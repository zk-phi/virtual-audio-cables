if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

class ReverbNode extends GainNode {
  constructor (ctx, options) {
    super(ctx, { gain: 1 });
    this._dryGainNode = new GainNode(ctx, {
      gain: (1 - options.wetness),
    });
    this._wetGainNode = new GainNode(ctx, {
      gain: options.wetness,
    });
    this._convolverNode = new ConvolverNode(ctx, {
      buffer: options.buffer,
    });
    this.connect(this._dryGainNode);
    this.connect(this._convolverNode);
    this._convolverNode.connect(this._wetGainNode);
    this.connect = (node) => {
      this._dryGainNode.connect(node);
      this._wetGainNode.connect(node);
    };
    this.disconnect = (node) => {
      this._dryGainNode.disconnect(node);
      this._wetGainNode.disconnect(node);
    }
  }

  setWetness (value) {
    this._dryGainNode.gain.value = (1 - value);
    this._wetGainNode.gain.value = value;
  }
}

class SurgicalEqNode extends GainNode {
  constructor (ctx, options) {
    super(ctx, { gain: 1 });
    this._filters = (new Array(options.octave)).fill(null).map((_, ix) => (
      new BiquadFilterNode(ctx, {
        type: "peaking",
        frequency: options.frequency * Math.pow(2, ix),
        Q: options.Q,
        gain: options.gain,
      })
    ));
    const outNode = this._filters.reduce((l, r) => l.connect(r), this);
    this.connect(this._filters[0]);
    this.connect = (node) => outNode.connect(node);
    this.disconnect = (node) => outNode.disconnect(node);
  }

  setFrequency (value) {
    this._filters.forEach((node, ix) => node.frequency.value = value * Math.pow(2, ix));
  }

  setGain (value) {
    this._filters.forEach((node, ix) => node.gain.value = value);
  }

  setQ (value) {
    this._filters.forEach((node, ix) => node.Q.value = value);
  }
}

const data = {
  /* status */
  enabled: false,
  showDetails: false,
  value: 0,
  reduction: 0,
  buttonBg: "transparent",
  installEvent: null,
  standalone: window.matchMedia('(display-mode: standalone)').matches,
  /* form inputs */
  inputDevices: [],
  outputDevices: [],
  selectedInput: "default",
  selectedOutput: "default",
  wetValue: 0,
  gainValue: 100,
  delayValue: 0.0,
  lowMidValue: -4.00,
  midValue: -8.00,
  hiMidValue: -4.00,
  highValue: +8.00,
  deEssValue: -8.00,
  deEssFreq: 2100,
  filterFreq: 120,
  enableNoiseReduction: false,
  /* webaudio things */
  ctx: null,
  sourceNode: null,
  delayNode: null,
  filterNode: null,
  gainNode: null,
  compressorNode: null,
  lowMid: null,
  mid: null,
  hiMid: null,
  high: null,
  deEss: null,
  reverbNode: null,
  analyzerNode: null,
  destinationNode: null,
  audio: null,
};

if (data.standalone) {
  window.resizeTo(220, 500);
}

window.matchMedia('(display-mode: standalone)').addEventListener('change', (evt) => {
  data.standalone = !!evt.matches;
  if (data.standalone) {
    window.resizeTo(220, 500);
  }
});

window.addEventListener('beforeinstallprompt', (e) => {
  data.installEvent = e;
  e.preventDefault();
});

const FFT_SIZE = 256;

const vm = new Vue({
  el: "#app",
  data: data,
  ready: async () => {
    await navigator.mediaDevices.getUserMedia({
      audio: true,
      video: false,
    });
    const devs = await navigator.mediaDevices.enumerateDevices();
    vm.inputDevices = devs.filter(dev => dev.kind === "audioinput");
    vm.outputDevices = devs.filter(dev => dev.kind === "audiooutput");
  },
  watch: {
    selectedInput: () => vm.reconnectSource(),
    selectedOutput: () => vm.updateOutput(),
    wetValue: () => vm.updateWettiness(),
    gainValue: () => vm.updateGain(),
    delayValue: () => vm.updateDelay(),
    filterFreq: () => vm.updateFilter(),
    lowMidValue: () => vm.updateLowMid(),
    midValue: () => vm.updateMid(),
    hiMidValue: () => vm.updateHiMid(),
    highValue: () => vm.updateHigh(),
    deEssValue: () => vm.updateDeEssValue(),
    deEssFreq: () => vm.updateDeEssFreq(),
    enableNoiseReduction: () => vm.reconnectSource(),
    value: () => {
      const p = (vm.value + 60) / 60 * 100;
      const p2 = - vm.reduction / 60 * 100;
      vm.buttonBg =
        "linear-gradient(" +
        "to right," +
        "rgba(255,255,255,0.1) " + (p - p2) + "%," +
        "rgba(255,255,255,0.2) " + (p - p2) + "%," +
        "rgba(255,255,255,0.2) " + p + "%," +
        "transparent " + p + "%" +
        ")";
    },
  },
  methods: {
    toggle: () => {
      if (vm.enabled) {
        vm.stop();
      } else {
        vm.start();
      }
    },
    initialize: async () => {
      if (!vm.ctx) {
        /* wire-up a network like this:
         *
         *   delayNode
         *       |
         *    gainNode
         *       |
         *  filterNode
         *       |
         *      Eq1
         *       |
         * compressorNode
         *       |
         *  Eq2, De-Ess
         *       |
         *     Reverb
         *       |
         *  analyzerNode
         *       |
         * destinationNode
         *       |
         *     audio
         */
        vm.ctx = new AudioContext({
          sampleRate: 48000,
        });
        vm.delayNode = new DelayNode(vm.ctx, {
          delayTime: vm.delayValue,
          maxDelayTime: 3,
        });
        vm.filterNode = new BiquadFilterNode(vm.ctx, {
          type: "highpass",
          frequency: vm.filterFreq,
          Q: 1,
        });
        vm.gainNode = new GainNode(vm.ctx, {
          gain: vm.gainValue / 100,
        });
        vm.compressorNode = new DynamicsCompressorNode(vm.ctx, {});
        vm.lowMid = new BiquadFilterNode(vm.ctx, {
          type: "peaking",
          frequency: 244.3,
          Q: 3.49,
          gain: vm.lowMidValue,
        });
        vm.mid = new BiquadFilterNode(vm.ctx, {
          type: "peaking",
          frequency: 824.9,
          Q: 1.92,
          gain: vm.midValue,
        });
        vm.hiMid = new BiquadFilterNode(vm.ctx, {
          type: "peaking",
          frequency: 3250,
          Q: 1.96,
          gain: vm.hiMidValue,
        });
        vm.high = new BiquadFilterNode(vm.ctx, {
          type: "highshelf",
          frequency: 9570,
          gain: vm.highValue,
        });
        vm.deEss = new SurgicalEqNode(vm.ctx, {
          octave: 4,
          frequency: vm.deEssFreq,
          Q: 50,
          gain: vm.deEssValue,
        });
        /* taken from the Open AIR Library under the CC-BY License */
        const IR = await fetch("./hamilton_mausoleum.wav");
        const IRbuf = await IR.arrayBuffer();
        const decodedIRBuf = await vm.ctx.decodeAudioData(IRbuf);
        vm.reverbNode = new ReverbNode(vm.ctx, {
          wetness: vm.wetValue / 100,
          buffer: decodedIRBuf,
        });
        vm.analyzerNode = new AnalyserNode(vm.ctx, {
          fftSize: FFT_SIZE,
        });
        let buf = new Float32Array(FFT_SIZE);
        setInterval(() => {
          vm.analyzerNode.getFloatTimeDomainData(buf);
          const value = Math.max(Math.max(...buf), - Math.min(...buf), 1e-128);
          vm.value = Math.max(-60, Math.LOG10E * 20 * Math.log(value));
          vm.reduction = vm.compressorNode.reduction;
        }, 30);
        vm.destinationNode = new MediaStreamAudioDestinationNode(vm.ctx);
        vm.audio = new Audio();
        vm.audio.srcObject = vm.destinationNode.stream;
        vm.audio.setSinkId(vm.selectedOutput);
        vm.audio.play();
        vm.delayNode.connect(vm.gainNode).connect(vm.filterNode).connect(vm.lowMid);
        vm.lowMid.connect(vm.mid).connect(vm.hiMid).connect(vm.compressorNode).connect(vm.high);
        vm.high.connect(vm.deEss).connect(vm.reverbNode).connect(vm.analyzerNode);
        vm.analyzerNode.connect(vm.destinationNode);
      }
    },
    reconnectSource: async () => {
      if (vm.sourceNode) {
        vm.disconnectSource();
      }
      if (vm.ctx) {
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: vm.selectedInput,
            autoGainControl: false,
            noiseSuppression: vm.enableNoiseReduction,
            echoCancellation: true,
            sampleRate: { ideal: 48000 },
            sampleSize: { ideal: 24 },
          },
          video: false,
        });
        vm.sourceNode = new MediaStreamAudioSourceNode(vm.ctx, {
          mediaStream: stream,
        });
        vm.sourceNode.connect(vm.delayNode);
      }
    },
    disconnectSource: () => {
      vm.sourceNode.mediaStream.getTracks().map(track => track.stop());
      vm.sourceNode.disconnect();
      vm.sourceNode = null;
    },
    updateGain: () => {
      if (vm.ctx) {
        vm.gainNode.gain.value = vm.gainValue / 100;
      }
    },
    updateWettiness: () => {
      if (vm.ctx) {
        vm.reverbNode.setWetness(vm.wetValue / 100);
      }
    },
    updateDelay: () => {
      if (vm.ctx) {
        vm.delayNode.delayTime.value = vm.delayValue;
      }
    },
    updateFilter: () => {
      if (vm.ctx) {
        vm.filterNode.frequency.value = vm.filterFreq;
      }
    },
    updateEq1: () => {
      if (vm.ctx) {
        vm.eq1.gain.value = vm.eq1Value;
      }
    },
    updateLowMid: () => {
      if (vm.ctx) {
        vm.lowMid.gain.value = vm.lowMidValue;
      }
    },
    updateMid: () => {
      if (vm.ctx) {
        vm.mid.gain.value = vm.midValue;
      }
    },
    updateHiMid: () => {
      if (vm.ctx) {
        vm.hiMid.gain.value = vm.hiMidValue;
      }
    },
    updateHigh: () => {
      if (vm.ctx) {
        vm.high.gain.value = vm.highValue;
      }
    },
    updateDeEssValue: () => {
      if (vm.ctx) {
        vm.deEss.setGain(vm.deEssValue);
      }
    },
    updateDeEssFreq: () => {
      if (vm.ctx) {
        vm.deEss.setFrequency(vm.deEssFreq);
      }
    },
    updateOutput: () => {
      if (vm.ctx) {
        vm.audio.setSinkId(vm.selectedOutput);
      }
    },
    start: async () => {
      if (!vm.ctx) {
        await vm.initialize();
      }
      vm.reconnectSource();
      vm.enabled = true;
    },
    stop: () => {
      vm.disconnectSource();
      vm.enabled = false;
    },
    install: () => {
      vm.installEvent.prompt();
    },
  }
});
