export function createPartyWheelAudio(getAudioContext = () => globalThis.AudioContext || globalThis.webkitAudioContext) {
  let context, master, muted = false, lastTick = -Infinity, closed = false;
  const voices = new Set();
  const tone = (frequency, start, duration, volume, type = "sine") => {
    if (closed || muted || context?.state !== "running") return;
    const oscillator = context.createOscillator(), gain = context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    gain.gain.setValueAtTime(.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + .005);
    gain.gain.exponentialRampToValueAtTime(.0001, start + duration);
    oscillator.connect(gain); gain.connect(master);
    voices.add(oscillator);
    oscillator.onended = () => { voices.delete(oscillator); oscillator.disconnect(); gain.disconnect(); };
    oscillator.start(start); oscillator.stop(start + duration + .01);
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
    close() {
      closed = true;
      voices.forEach((voice) => { try { voice.stop(); } catch { /* Already ended. */ } });
      voices.clear();
      if (context && context.state !== "closed") void context.close().catch(() => {});
    },
  };
}
