const colors = ["#27ddfa", "#ffa55c", "#ffe098", "#d3faff"];

// A separate canvas keeps the rockets independent of the confetti worker.
export function createPartyFireworks(canvas, {
  onLaunch = () => {}, onBurst = () => {}, onStop = () => {}, random = Math.random,
  now = () => performance.now(), requestFrame = (fn) => requestAnimationFrame(fn), cancelFrame = (id) => cancelAnimationFrame(id),
  viewport = () => ({ width: window.innerWidth, height: window.innerHeight, ratio: Math.min(window.devicePixelRatio || 1, 2) }),
  allowed = () => !window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches && document.visibilityState !== "hidden",
} = {}) {
  const context = canvas.getContext("2d");
  let frame, running = false, started = 0, rockets = [], sparks = [], rings = [], launched = 0;
  let width = 0, height = 0;
  const size = () => {
    const view = viewport();
    if (width === view.width && height === view.height) return;
    width = view.width; height = view.height;
    canvas.width = Math.round(width * view.ratio); canvas.height = Math.round(height * view.ratio);
    context.setTransform(view.ratio, 0, 0, view.ratio, 0, 0);
  };
  const stop = () => {
    running = false;
    if (frame !== undefined) cancelFrame(frame);
    frame = undefined; rockets = []; sparks = []; rings = [];
    context?.clearRect(0, 0, width, height);
    onStop();
  };
  const burst = (rocket, time) => {
    const color = colors[rocket.index % colors.length];
    for (let index = 0; index < 72; index++) {
      const angle = index * Math.PI * 2 / 72 + random() * .05, speed = 100 + random() * 190;
      sparks.push({ x: rocket.targetX, y: rocket.targetY, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        born: time, life: 1050 + random() * 750, color: index % 5 === 0 ? "#fff6d6" : color, radius: 1 + random() });
    }
    rings.push({ x: rocket.targetX, y: rocket.targetY, born: time, color });
    onBurst();
  };
  const tick = () => {
    if (!running) return;
    if (!allowed()) { stop(); return; }
    const time = now(), elapsed = time - started;
    size(); context.clearRect(0, 0, width, height);
    // Stagger five launches; do not replay sounds after a background-tab delay.
    while (launched < 5 && elapsed >= launched * 620) {
      const index = launched++, due = started + index * 620;
      if (time - due > 180) continue;
      const side = [.17, .83, .32, .7, .5][index];
      rockets.push({ index, born: time, x: width * (side < .5 ? .08 : .92), y: height + 15,
        targetX: width * side, targetY: height * (.12 + random() * .2) });
      onLaunch();
    }
    rockets = rockets.filter((rocket) => {
      const progress = Math.min(1, (time - rocket.born) / 670);
      if (progress === 1) { if (time - rocket.born < 850) burst(rocket, time); return false; }
      const eased = 1 - (1 - progress) ** 2;
      const x = rocket.x + (rocket.targetX - rocket.x) * eased, y = rocket.y + (rocket.targetY - rocket.y) * eased;
      const trail = context.createLinearGradient(x, y, x, y + 65);
      trail.addColorStop(0, "#fff4cb"); trail.addColorStop(.4, colors[rocket.index % colors.length]); trail.addColorStop(1, "transparent");
      context.globalAlpha = 1; context.strokeStyle = trail; context.lineWidth = 2;
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - (rocket.targetX - rocket.x) * .02, y + 65); context.stroke();
      return true;
    });
    rings = rings.filter((ring) => {
      const age = (time - ring.born) / 450;
      if (age >= 1) return false;
      context.globalAlpha = (1 - age) * .3; context.strokeStyle = ring.color; context.lineWidth = 1;
      context.beginPath(); context.arc(ring.x, ring.y, 8 + age * 105, 0, Math.PI * 2); context.stroke();
      return true;
    });
    sparks = sparks.filter((spark) => {
      const age = time - spark.born;
      if (age >= spark.life) return false;
      const seconds = age / 1000, distance = (1 - Math.exp(-1.3 * seconds)) / 1.3;
      const x = spark.x + spark.vx * distance, y = spark.y + spark.vy * distance + 55 * seconds ** 2;
      context.globalAlpha = (1 - age / spark.life) * (.72 + Math.sin(age * .035) * .2);
      context.strokeStyle = spark.color; context.lineWidth = spark.radius; context.lineCap = "round";
      context.beginPath(); context.moveTo(x, y); context.lineTo(x - spark.vx * .018, y - spark.vy * .018 - seconds * 2); context.stroke();
      return true;
    });
    context.globalAlpha = 1;
    if (elapsed > 5000 || launched === 5 && !rockets.length && !sparks.length) stop();
    else frame = requestFrame(tick);
  };
  return {
    start() {
      stop();
      if (!context || !allowed()) return;
      launched = 0; started = now(); running = true; frame = requestFrame(tick);
    },
    stop,
  };
}
