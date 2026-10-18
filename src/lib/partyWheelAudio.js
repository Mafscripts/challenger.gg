export function createPartyWheelAudio(getAudioContext = () => globalThis.AudioContext || globalThis.webkitAudioContext) {
  let context, master, muted = false, lastTick = -Infinity, closed = false;
  const voices = new Set();
  const fireworkVoices = new Set();
  const tone = (frequency, start, duration, volume, type = "sine", endFrequency, firework = false) => {
    if (closed || muted || context?.state !== "running") return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    if (endFrequency) oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(master);
    voices.add(oscillator);
    if (firework) fireworkVoices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); fireworkVoices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .01);
  };
  const noise = (start, duration, volume, type, frequency) => {
    if (closed || muted || context?.state !== "running") return;
    const buffer = context.createBuffer(1, Math.ceil(context.sampleRate * duration), context.sampleRate);
    const samples = buffer.getChannelData(0);
    for (let index = 0; index < samples.length; index++) samples[index] = Math.random() * 2 - 1;
    const source = context.createBufferSource(), filter = context.createBiquadFilter(), gain = context.createGain();
    source.buffer = buffer; filter.type = type; filter.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start); gain.gain.exponentialRampToValueAtTime(volume, start + .008);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    source.connect(filter); filter.connect(gain); gain.connect(master);
    voices.add(source); fireworkVoices.add(source);
    source.onended = () => { voices.delete(source); fireworkVoices.delete(source); source.disconnect(); filter.disconnect(); gain.disconnect(); };
    source.start(start); source.stop(start + duration + .01);
  };
  const stopFireworks = () => {
    fireworkVoices.forEach((voice) => { try { voice.stop(); } catch { /* Already ended. */ } });
    fireworkVoices.clear();
  };
  return {
    async unlock() {
      if (closed) return false;
      try {
        const AudioContext = getAudioContext();
        if (!AudioContext) return false;
        if (!context) {
          context = new AudioContext(); master = context.createGain();
          master.gain.setValueAtTime(muted ? 0 : .5, context.currentTime); master.connect(context.destination);
        }
        if (context.state === "suspended") await context.resume();
        return context.state === "running";
      } catch { return false; }
    },
    mute(value) {
      muted = value;
      if (master && !closed) master.gain.setValueAtTime(muted ? 0 : .5, context.currentTime);
    },
    tick() {
      if (!context || context.currentTime - lastTick < .045 || muted || closed) return;
      lastTick = context.currentTime;
      tone(1050, context.currentTime, .035, .12, "triangle");
    },
    finish() {
      if (!context || muted || closed) return;
      [523.25, 659.25, 783.99, 1046.5].forEach((note, index) => tone(note, context.currentTime + index * .12, .4, .13));
    },
    fireworkLaunch() {
      if (!context || muted || closed) return;
      tone(380, context.currentTime, .55, .035, "sine", 1500, true);
      noise(context.currentTime, .45, .035, "highpass", 1500);
    },
    fireworkBurst() {
      if (!context || muted || closed) return;
      noise(context.currentTime, .65, .2, "lowpass", 1500);
      tone(95, context.currentTime, .4, .12, "sine", 35, true);
      for (let index = 0; index < 3; index++) noise(context.currentTime + .12 + index * .09, .08, .045, "highpass", 2200);
    },
    stopFireworks,
    close() {
      closed = true;
      voices.forEach((voice) => { try { voice.stop(); } catch { /* Already ended. */ } });
      voices.clear();
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
