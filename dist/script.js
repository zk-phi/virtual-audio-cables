if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
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
  lowMidValue: -2.00,
  midValue: -4.00,
  hiMidValue: +4.00,
  highValue: +8.00,
  deEssValue: -20,
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
  deEss1: null,
  deEss2: null,
  deEss3: null,
  dryGainNode: null,
  wetGainNode: null,
  convolverNode: null,
  analyzerNode: null,
  destinationNode: null,
  audio: null,
};

if (data.standalone) {
  window.resizeTo(220, 500);
}

window.matchMedia('(display-mode: standalone)').addEventListener('change', (evt) => {
  data.standalone = !!evt.matches;
});

window.addEventListener('beforeinstallprompt', (e) => {
  data.installEvent = e;
  e.preventDefault();
});

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
    deEssValue: () => vm.updateDeEss(),
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
         *  filterNode
         *       |
         *    gainNode
         *       |
         * compressorNode
         *       |
         *   Eq, De-Ess
         *       |
         *       +--------+
         *       |        |
         *       |  convolverNode
         *       |        |
         *  dryGainNode   |
         *       |        |
         *       |   wetGainNode
         *       |        |
         *       +--------+
         *       |
         *  analyzerNode
         *       |
         * destinationNode
         *       |
         *     audio
         */
        vm.ctx = new AudioContext();
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
        vm.deEss1 = new BiquadFilterNode(vm.ctx, {
          type: "peaking",
          frequency: 2100,
          Q: 50,
          gain: vm.deEssValue,
        });
        vm.deEss2 = new BiquadFilterNode(vm.ctx, {
          type: "peaking",
          frequency: 4200,
          Q: 50,
          gain: vm.deEssValue,
        });
        vm.deEss3 = new BiquadFilterNode(vm.ctx, {
          type: "peaking",
          frequency: 8400,
          Q: 50,
          gain: vm.deEssValue,
        });
        vm.dryGainNode = new GainNode(vm.ctx, {
          gain: 1 - (vm.wetValue / 100),
        });
        vm.wetGainNode = new GainNode(vm.ctx, {
          gain: vm.wetValue / 100,
        });
        /* taken from the Open AIR Library under the CC-BY License */
        const IR = await fetch("./hamilton_mausoleum.wav");
        const IRbuf = await IR.arrayBuffer();
        const decodefIRBuf = await vm.ctx.decodeAudioData(IRbuf);
        vm.convolverNode = new ConvolverNode(vm.ctx, {
          buffer: decodefIRBuf,
        });
        vm.analyzerNode = new AnalyserNode(vm.ctx, {
          fftSize: 512,
        });
        let buf = new Float32Array(512);
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
        vm.delayNode.connect(vm.filterNode).connect(vm.gainNode).connect(vm.compressorNode);
        vm.compressorNode.connect(vm.lowMid).connect(vm.mid).connect(vm.hiMid).connect(vm.high);
        vm.high.connect(vm.deEss1).connect(vm.deEss2).connect(vm.deEss3);
        vm.deEss3.connect(vm.dryGainNode).connect(vm.analyzerNode);
        vm.deEss3.connect(vm.convolverNode).connect(vm.wetGainNode).connect(vm.analyzerNode);
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
        vm.dryGainNode.gain.value = 1 - (vm.wetValue / 100);
        vm.wetGainNode.gain.value = vm.wetValue / 100;
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
    updateDeEss: () => {
      if (vm.ctx) {
        vm.deEss1.gain.value = vm.deEssValue;
        vm.deEss2.gain.value = vm.deEssValue;
        vm.deEss3.gain.value = vm.deEssValue;
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
