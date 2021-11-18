const vm = new Vue({
  el: "#app",
  data: {
    /* status */
    enabled: false,
    showDetails: false,
    value: 0,
    reduction: 0,
    buttonBg: "transparent",
    /* form inputs */
    inputDevices: [],
    outputDevices: [],
    selectedInput: "default",
    selectedOutput: "default",
    wetValue: 0,
    gainValue: 100,
    delayValue: 0.0,
    filterFreq: 80,
    enableNoiseReduction: false,
    /* webaudio things */
    ctx: null,
    sourceNode: null,
    delayNode: null,
    filterNode: null,
    dryGainNode: null,
    wetGainNode: null,
    convolverNode: null,
    compressorNode: null,
    analyzerNode: null,
    destinationNode: null,
    audio: null,
  },
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
    wetValue: () => vm.updateGain(),
    gainValue: () => vm.updateGain(),
    delayValue: () => vm.updateDelay(),
    filterFreq: () => vm.updateFilter(),
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
         * compressorNode
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
          Q: 0.7,
        });
        vm.dryGainNode = new GainNode(vm.ctx, {
          gain: (1 - (vm.wetValue / 100)) * (vm.gainValue / 100),
        });
        vm.wetGainNode = new GainNode(vm.ctx, {
          gain: (vm.wetValue / 100) * (vm.gainValue / 100),
        });
        /* taken from the Open AIR Library under the CC-BY License */
        const IR = await fetch("./hamilton_mausoleum.wav");
        const IRbuf = await IR.arrayBuffer();
        const decodefIRBuf = await vm.ctx.decodeAudioData(IRbuf);
        vm.convolverNode = new ConvolverNode(vm.ctx, {
          buffer: decodefIRBuf,
        });
        vm.compressorNode = new DynamicsCompressorNode(vm.ctx, {});
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
        vm.delayNode.connect(vm.filterNode);
        vm.filterNode.connect(vm.dryGainNode).connect(vm.compressorNode);
        vm.filterNode.connect(vm.convolverNode).connect(vm.wetGainNode).connect(vm.compressorNode);
        vm.compressorNode.connect(vm.analyzerNode).connect(vm.destinationNode);
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
      vm.sourceNode.disconnect();
      vm.sourceNode = null;
    },
    updateGain: () => {
      if (vm.ctx) {
        vm.dryGainNode.gain.value = (1 - (vm.wetValue / 100)) * (vm.gainValue / 100);
        vm.wetGainNode.gain.value = (vm.wetValue / 100) * (vm.gainValue / 100);
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
  }
});
