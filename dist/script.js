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

class EqualizerNode extends GainNode {
  constructor (ctx, options) {
    super(ctx, { gain: 1 });
    this._filters = new Array(options.bands).fill(null).map((_, ix) => (
      new BiquadFilterNode(ctx, {
        type: ix == 0 ? "lowshelf" : ix == options.bands - 1 ? "highshelf" : "peaking",
        frequency: options.frequencies[ix],
        Q: options.Qs[ix],
        gain: options.gains[ix],
      })
    ));
    const outNode = this._filters.reduce((l, r) => l.connect(r), this);
    this.connect(this._filters[0]);
    this.connect = (node) => outNode.connect(node);
    this.disconnect = (node) => outNode.disconnect(node);
  }

  setFrequencies (freqs) {
    freqs.forEach((v, ix) => this._filters[ix].frequency.value = v);
  }

  setGains (gains) {
    gains.forEach((v, ix) => this._filters[ix].gain.value = v);
  }

  setQs (qs) {
    qs.forEach((v, ix) => this._filters[ix].Q.value = v);
  }
}

async function getIRBuf (ctx, url) {
  const IR = await fetch("./hamilton_mausoleum.wav");
  const IRbuf = await IR.arrayBuffer();
  return await ctx.decodeAudioData(IRbuf);
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
  precompEqGains: [-30, -4, -8, -4, 0],
  // 62.501, 256.52, 860.48, 3192.8, 9682.6
  precompEqLogFreqs: [0.41, 0.55, 0.67, 0.80, 0.91],
  precompEqQs: [1, 3.49, 1.92, 1.96, 1],
  highValue: +8.00,
  deEssValue: -8.00,
  deEssFreq: 2100,
  enableNoiseReduction: false,
  /* webaudio things */
  ctx: null,
  sourceNode: null,
  delayNode: null,
  gainNode: null,
  equalizerNode: null,
  compressorNode: null,
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
const SAMPLE_RATE = 48000;
const MAX_FREQ = 24000;
const LOG_MAX_FREQ = Math.log2(24000);

Vue.filter("trim", v => `${v}`.substring(0, 7));

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
  computed: {
    precompEqFreqs: function () {
      return this.precompEqLogFreqs.map(v => Math.pow(2, v * LOG_MAX_FREQ));
    },
  },
  watch: {
    selectedInput: () => vm.reconnectSource(),
    selectedOutput: () => vm.ctx && vm.audio.setSinkId(vm.selectedOutput),
    wetValue: () => vm.ctx && vm.reverbNode.setWetness(vm.wetValue / 100),
    gainValue: () => vm.ctx && (vm.gainNode.gain.value = vm.gainValue / 100),
    delayValue: () => vm.ctx && (vm.delayNode.delayTime.value = vm.delayValue),
    precompEqFreqs: () => vm.ctx && vm.equalizerNode.setFrequencies(vm.precompEqFreqs),
    precompEqGains: () => vm.ctx && vm.equalizerNode.setGains(vm.precompEqGains),
    precompEqQs: () => vm.ctx && vm.equalizerNode.setQs(vm.precompEqQs),
    highValue: () => vm.ctx && (vm.high.gain.value = vm.highValue),
    deEssValue: () => vm.ctx && vm.deEss.setGain(vm.deEssValue),
    deEssFreq: () => vm.ctx && vm.deEss.setFrequency(vm.deEssFreq),
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
          sampleRate: SAMPLE_RATE,
        });
        vm.delayNode = new DelayNode(vm.ctx, {
          delayTime: vm.delayValue,
          maxDelayTime: 3,
        });
        vm.gainNode = new GainNode(vm.ctx, {
          gain: vm.gainValue / 100,
        });
        vm.equalizerNode = new EqualizerNode(vm.ctx, {
          bands: 5,
          frequencies: vm.precompEqFreqs,
          Qs: vm.precompEqQs,
          gains: vm.precompEqGains,
        });
        vm.compressorNode = new DynamicsCompressorNode(vm.ctx, {});
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
        vm.reverbNode = new ReverbNode(vm.ctx, {
          wetness: vm.wetValue / 100,
          /* taken from the Open AIR Library under the CC-BY License */
          buffer: await getIRBuf(vm.ctx, "./hamilton_mausoleum.wav"),
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
        vm.delayNode.connect(vm.gainNode).connect(vm.equalizerNode).connect(vm.compressorNode);
        vm.compressorNode.connect(vm.high).connect(vm.deEss).connect(vm.reverbNode)
        vm.reverbNode.connect(vm.destinationNode);
        vm.reverbNode.connect(vm.analyzerNode);
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
            autoGainControl: { ideal: false },
            noiseSuppression: { ideal: vm.enableNoiseReduction },
            echoCancellation: { ideal: false },
            sampleRate: { ideal: SAMPLE_RATE },
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
