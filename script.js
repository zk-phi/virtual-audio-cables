if ("serviceWorker" in navigator) {
  navigator.serviceWorker.register("sw.js");
}

const SAMPLE_RATE = 48000;
const FFT_SIZE = 2048;

class InputNode {
  constructor (ctx, options) {
    this.gainNode = new GainNode(ctx, { gain: 1.0 });
    this.analyzerNode = new AnalyserNode(ctx, { fftSize: FFT_SIZE });
    this.analyzerBuffer = new Float32Array(FFT_SIZE);
    this.gain = this.gainNode.gain;

    (async () => {
      let stream;
      if (options.device) {
        this.label = options.device.label;
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            deviceId: options.device.deviceId,
            autoGainControl: { ideal: false },
            noiseSuppression: { ideal: options.noiseSuppression },
            echoCancellation: { ideal: false },
            sampleRate: { ideal: SAMPLE_RATE },
            sampleSize: { ideal: 24 },
          },
          video: false,
        });
      } else {
        this.label = "別のタブ";
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: true, /* required to be true by the API spec */
          audio: true,
        });
      }
      this.sourceNode = new MediaStreamAudioSourceNode(ctx, {
        mediaStream: stream,
      });
      this.sourceNode.connect(this.gainNode).connect(this.analyzerNode);
    })();
  }

  /* get audio volume in db (-60 ~ 0) */
  getAnalyzerValue () {
    this.analyzerNode.getFloatTimeDomainData(this.analyzerBuffer);
    const value = Math.max(
      Math.max(...this.analyzerBuffer),
      - Math.min(...this.analyzerBuffer),
      1e-128,
    );
    return Math.max(-60, Math.LOG10E * 20 * Math.log(value));
  }

  connect (node) {
    this.gainNode.connect(node);
  }

  disconnect (node) {
    this.gainNode.disconnect(node);
  }
}

class OutputNode extends MediaStreamAudioDestinationNode {
  constructor (ctx, options) {
    super(ctx);
    this.label = options.device.label;
    this.audio = new Audio();
    this.audio.srcObject = this.stream;
    this.audio.setSinkId(options.device.deviceId);
    this.audio.play();
  }
}

const data = {
  /* status */
  installEvent: null,
  standalone: window.matchMedia('(display-mode: standalone)').matches,
  cables: [],
  volumes: [],
  meterBgs: [],
  /* form inputs */
  inputDevices: [],
  outputDevices: [],
  selectedInput: "default",
  selectedOutput: "default",
  /* webaudio things */
  ctx: null,
  inputNodes: [],
  outputNodes: [],
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
    vm.selectedInput = 0;
    vm.selectedOutput = 0;
    const visualizerFn = () => {
      vm.meterBgs = vm.cables.map((cable) => {
        const db = cable.input.getAnalyzerValue();
        const p = (db + 60) / 60 * 100;
        return `linear-gradient(to right, #fff4 ${p}%, transparent ${p}%)`;
      });
      window.requestAnimationFrame(visualizerFn);
    };
    visualizerFn();
  },
  watch: {
    volumes: {
      handler: () => {
        vm.volumes.forEach((volume, ix) => {
          vm.cables[ix].input.gain.value = volume;
        });
      },
      deep: true,
    },
  },
  methods: {
    initialize: async () => {
      if (!vm.ctx) {
        vm.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
      }
    },
    addCable: async () => {
      await vm.initialize();
      const input = new InputNode(vm.ctx, {
        device: vm.inputDevices[vm.selectedInput],
        noiseSuppression: true,
      });
      const output = new OutputNode(vm.ctx, {
        device: vm.outputDevices[vm.selectedOutput],
      });
      input.connect(output);
      vm.cables.push({ input, output });
      vm.volumes.push(1.0);
    },
    removeCable: (ix) => {
      vm.cables[ix].input.disconnect(vm.cables[ix].output);
      vm.cables.splice(ix, 1);
    },
    install: () => {
      vm.installEvent.prompt();
    },
  }
});
