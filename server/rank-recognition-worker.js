import { parentPort } from "node:worker_threads";
import { recognizeRank } from "./rank-recognition.js";
parentPort.on("message", async ({ id, image }) => {
  try { parentPort.postMessage({ id, result: await recognizeRank(Buffer.from(image)) }); }
  catch (error) { parentPort.postMessage({ id, error: error.message }); }
});
