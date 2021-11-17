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
    gainValue: 1.0,
    enableNoiseReduction: false,
    enableReverb: false,
    /* webaudio things */
    ctx: null,
    sourceNode: null,
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
    gainValue: () => vm.updateGain(),
    enableNoiseReduction: () => vm.reconnectSource(),
    enableReverb: () => vm.updateGain(),
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
         *                   dryGainNode --+
         *                                 |
         *                                 +-- destinationNode --- audio
         *                                 |
         * convolverNode --- wetGainNode --+
         */
        vm.ctx = new AudioContext();
        vm.dryGainNode = new GainNode(vm.ctx, {
          gain: vm.enableReverb ? 0 : vm.gainValue,
        });
        vm.wetGainNode = new GainNode(vm.ctx, {
          gain: vm.enableReverb ? vm.gainValue : 0,
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
        vm.dryGainNode.connect(vm.destinationNode);
        vm.convolverNode.connect(vm.wetGainNode).connect(vm.destinationNode);
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
        vm.sourceNode.connect(vm.dryGainNode);
        vm.sourceNode.connect(vm.convolverNode);
      }
    },
    disconnectSource: () => {
      vm.sourceNode.disconnect();
      vm.sourceNode = null;
    },
    updateGain: () => {
      if (vm.ctx) {
        vm.dryGainNode.gain.value = vm.enableReverb ? 0 : vm.gainValue;
        vm.wetGainNode.gain.value = vm.enableReverb ? vm.gainValue : 0;
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
