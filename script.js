const vm = new Vue({
  el: "#app",
  data: {
    enabled: false,
    inputDevices: [],
    outputDevices: [],
    selectedInput: "default",
    selectedOutput: "default",
    gainValue: 1.0,
    enableNoiseReduction: false,
    enableReverb: false,
    gainNode: null,
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
    gainValue: () => {
      if (vm.gainNode) {
        vm.gainNode.gain.value = vm.gainValue;
      }
    },
  },
  methods: {
    initialize: async () => {
      const ctx = new AudioContext();
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          deviceId: vm.selectedInput,
          autoGainControl: false,
          noiseSuppression: vm.enableNoiseReduction,
          echoCancellation: false,
        },
        video: false,
      });
      let source = new MediaStreamAudioSourceNode(ctx, {
        mediaStream: stream,
      });
      if (vm.enableReverb) {
        /* taken from the Open AIR Library under the CC-BY License */
        const IR = await fetch("./hamilton_mausoleum.wav");
        const buf = await IR.arrayBuffer();
        const decodefBuf = await ctx.decodeAudioData(buf);
        const convolver = new ConvolverNode(ctx, {
          buffer: decodefBuf,
        });
        source.connect(convolver);
        source = convolver;
      }
      if (!vm.gainNode) {
        vm.gainNode = new GainNode(ctx, {
          gain: vm.gainValue,
        });
      }
      const dest = new MediaStreamAudioDestinationNode(ctx);
      source.connect(vm.gainNode).connect(dest);
      const audio = new Audio();
      audio.srcObject = dest.stream;
      audio.setSinkId(vm.selectedOutput);
      audio.play();
      vm.enabled = true;
    }
  }
});
