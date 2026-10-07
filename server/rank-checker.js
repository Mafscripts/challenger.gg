import { Worker } from "node:worker_threads";
import crypto from "node:crypto";

let worker, active, timer;
const queue = [];
function stop(error) {
  clearTimeout(timer);
  const stopped = worker;
  worker = null;
  active?.reject(error);
  active = null;
  queue.splice(0).forEach((job) => job.reject(error));
  if (stopped) { stopped.removeAllListeners(); void stopped.terminate(); }
}
function next() {
  if (active || !queue.length) return;
  if (!worker) {
    worker = new Worker(new URL("./rank-recognition-worker.js", import.meta.url), { execArgv: [] });
    worker.on("error", (error) => stop(error));
    worker.on("exit", (code) => { if (worker) stop(new Error(`Rank checker stopped (${code})`)); });
    worker.on("message", (message) => {
      if (!active || message.id !== active.id) return;
      clearTimeout(timer);
      const job = active; active = null;
      if (message.error) job.reject(new Error(message.error)); else job.resolve(message.result);
      worker.unref(); next();
    });
  }
  active = queue.shift();
  worker.ref();
  timer = setTimeout(() => stop(new Error("Rank checker timed out")), 20_000);
  worker.postMessage({ id: active.id, image: active.image });
}
export function checkRankImage(image) {
  if (queue.length >= 6) throw Object.assign(new Error("Rank checker is busy. Please try again shortly."), { status: 503 });
  return new Promise((resolve, reject) => { queue.push({ id: crypto.randomUUID(), image, resolve, reject }); next(); });
}
export const stopRankChecker = () => stop(new Error("Rank checker stopped"));
