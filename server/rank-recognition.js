import sharp from "sharp";
import cvModule from "@techstark/opencv-js";
import { fileURLToPath } from "node:url";

const cv = await cvModule;
const references = [
  { rank: "diamond", crop: { left: 44, top: 5, width: 277, height: 270 } },
  { rank: "crimson", crop: { left: 20, top: 12, width: 265, height: 255 } },
  { rank: "iridescent", crop: { left: 65, top: 80, width: 421, height: 392 } },
  { rank: "top250", crop: { left: 28, top: 13, width: 275, height: 306 } },
];
const detector = new cv.ORB(1800, 1.2, 10, 12, 0, 2, cv.ORB_HARRIS_SCORE, 31, 10);
const matcher = new cv.BFMatcher(cv.NORM_HAMMING, false);
let templates;

async function pixels(input, crop) {
  const image = sharp(input, { limitInputPixels: 20_000_000 }).rotate();
  if (crop) image.extract(crop);
  const { data, info } = await image.resize({ width: crop ? 360 : 1600, height: crop ? 360 : 1600, fit: "inside", withoutEnlargement: !crop }).removeAlpha().toColourspace("srgb").raw().toBuffer({ resolveWithObject: true });
  return { data, width: info.width, height: info.height };
}

function features(image, reference = false) {
  const rgb = cv.matFromArray(image.height, image.width, cv.CV_8UC3, image.data);
  const gray = new cv.Mat(), mask = new cv.Mat(), keys = new cv.KeyPointVector(), descriptors = new cv.Mat();
  try {
    cv.cvtColor(rgb, gray, cv.COLOR_RGB2GRAY);
    cv.equalizeHist(gray, gray);
    if (reference) {
      mask.create(image.height, image.width, cv.CV_8UC1);
      mask.setTo(new cv.Scalar(255));
      // Exclude division numerals / Top 250 placing on the central plaque.
      cv.rectangle(mask, new cv.Point(image.width * .25, image.height * .60), new cv.Point(image.width * .76, image.height * .87), new cv.Scalar(0), -1);
    }
    detector.detectAndCompute(gray, mask, keys, descriptors);
    return { keys, descriptors, width: image.width, height: image.height, data: image.data };
  } finally { rgb.delete(); gray.delete(); mask.delete(); }
}

function colorSimilarity(template, image, bounds) {
  const histogram = (data, width, height, box) => {
    const bins = new Float64Array(12);
    for (let y = Math.max(0, Math.floor(box.top)); y < Math.min(height, box.bottom); y += 3) {
      for (let x = Math.max(0, Math.floor(box.left)); x < Math.min(width, box.right); x += 3) {
        const i = (y * width + x) * 3;
        const r = data[i] / 255, g = data[i + 1] / 255, b = data[i + 2] / 255;
        const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
        if (d < .12 || max < .15) continue;
        const hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
        bins[Math.min(11, Math.floor(hue * 2))] += d;
      }
    }
    return bins;
  };
  const a = histogram(template.data, template.width, template.height, { left: 0, top: 0, right: template.width, bottom: template.height });
  const b = histogram(image.data, image.width, image.height, bounds);
  let dot = 0, aa = 0, bb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; aa += a[i] ** 2; bb += b[i] ** 2; }
  return aa && bb ? dot / Math.sqrt(aa * bb) : 0;
}

function score(template, image) {
  if (image.descriptors.rows < 2 || template.descriptors.rows < 2) return null;
  const pairs = new cv.DMatchVectorVector();
  const from = [], to = [], cells = new Set(), targets = new Set();
  try {
    matcher.knnMatch(template.descriptors, image.descriptors, pairs, 2);
    for (let i = 0; i < pairs.size(); i++) {
      const pair = pairs.get(i);
      try {
        if (pair.size() < 2) continue;
        const best = pair.get(0), other = pair.get(1);
        if (best.distance > 64 || best.distance >= .76 * other.distance || targets.has(best.trainIdx)) continue;
        const a = template.keys.get(best.queryIdx).pt, b = image.keys.get(best.trainIdx).pt;
        targets.add(best.trainIdx); from.push(a.x, a.y); to.push(b.x, b.y);
      } finally { pair.delete(); }
    }
  } finally { pairs.delete(); }
  if (from.length < 24) return null;
  const src = cv.matFromArray(from.length / 2, 1, cv.CV_32FC2, from);
  const dst = cv.matFromArray(to.length / 2, 1, cv.CV_32FC2, to);
  const inliers = new cv.Mat();
  let homography;
  try {
    homography = cv.findHomography(src, dst, cv.RANSAC, 4, inliers);
    if (homography.empty()) return null;
    const h = homography.data64F;
    const project = (x, y) => { const z = h[6] * x + h[7] * y + h[8]; return [(h[0] * x + h[1] * y + h[2]) / z, (h[3] * x + h[4] * y + h[5]) / z]; };
    const corners = [[0, 0], [template.width, 0], [template.width, template.height], [0, template.height]].map(([x, y]) => project(x, y));
    if (corners.some((p) => p.some((v) => !Number.isFinite(v)))) return null;
    const bounds = { left: Math.min(...corners.map((p) => p[0])), right: Math.max(...corners.map((p) => p[0])), top: Math.min(...corners.map((p) => p[1])), bottom: Math.max(...corners.map((p) => p[1])) };
    const w = bounds.right - bounds.left, ht = bounds.bottom - bounds.top;
    if (w < 70 || ht < 70 || w / ht < .45 || w / ht > 1.8 || bounds.left < -30 || bounds.top < -30 || bounds.right > image.width + 30 || bounds.bottom > image.height + 30) return null;
    let count = 0;
    for (let i = 0; i < inliers.rows; i++) if (inliers.data[i]) {
      count++;
      cells.add(`${Math.min(3, Math.floor(from[i * 2] / template.width * 4))}:${Math.min(3, Math.floor(from[i * 2 + 1] / template.height * 4))}`);
    }
    const ratio = count / (from.length / 2);
    if (count < 12 || ratio < .55 || cells.size < 5) return null;
    const color = colorSimilarity(template, image, bounds);
    // Color supports a geometrically consistent shape, but cannot select a rank alone.
    const confidence = .65 * ratio + .25 * Math.min(1, count / 35) + .10 * color;
    return { rank: template.rank, confidence, inliers: count, coverage: cells.size, color };
  } finally { src.delete(); dst.delete(); inliers.delete(); homography?.delete(); }
}

export async function recognizeRank(input) {
  if (!templates) {
    templates = await Promise.all(references.map(async (ref) => ({ rank: ref.rank, ...features(await pixels(fileURLToPath(new URL(`./rank-references/${ref.rank}.png`, import.meta.url)), ref.crop), true) })));
  }
  const image = features(await pixels(input));
  try {
    const candidates = templates.map((template) => score(template, image)).filter(Boolean).sort((a, b) => b.confidence - a.confidence);
    const best = candidates[0];
    const accepted = best && best.confidence >= .70 && (!candidates[1] || best.confidence - candidates[1].confidence >= .08);
    return { rank: accepted ? best.rank : null, confidence: best?.confidence || 0, candidates: candidates.map(({ rank, confidence, inliers, coverage, color }) => ({ rank, confidence, inliers, coverage, color })) };
  } finally { image.keys.delete(); image.descriptors.delete(); }
}
