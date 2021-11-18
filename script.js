const vm = new Vue({
  el: "#app",
  data: {
    /* status */
    enabled: false,
    /* form inputs */
    inputDevices: [],
    outputDevices: [],
    selectedInput: "default",
    selectedOutput: "default",
    wetValue: 0.0,
    gainValue: 1.0,
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
         *       +------------+
         *       |            |
         *       |      convolverNode
         *       |            |
         *  dryGainNode       |
         *       |            |
         *       |       wetGainNode
         *       |            |
         *       +------------+
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
          gain: (1 - vm.wetValue) * vm.gainValue,
        });
        vm.wetGainNode = new GainNode(vm.ctx, {
          gain: vm.wetValue * vm.gainValue,
        });
        /* taken from the Open AIR Library under the CC-BY License */
        const IR = await fetch("./hamilton_mausoleum.wav");
        const buf = await IR.arrayBuffer();
        const decodefBuf = await vm.ctx.decodeAudioData(buf);
        vm.convolverNode = new ConvolverNode(vm.ctx, {
          buffer: decodefBuf,
        });
        vm.destinationNode = new MediaStreamAudioDestinationNode(vm.ctx);
        vm.audio = new Audio();
        vm.audio.srcObject = vm.destinationNode.stream;
        vm.audio.setSinkId(vm.selectedOutput);
        vm.audio.play();
        vm.delayNode.connect(vm.filterNode);
        vm.filterNode.connect(vm.dryGainNode).connect(vm.destinationNode);
        vm.filterNode.connect(vm.convolverNode).connect(vm.wetGainNode).connect(vm.destinationNode);
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
        vm.dryGainNode.gain.value = (1 - vm.wetValue) * vm.gainValue;
        vm.wetGainNode.gain.value = vm.wetValue * vm.gainValue;
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
