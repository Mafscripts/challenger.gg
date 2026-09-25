const imageFileMaxBytes = 8 * 1024 * 1024;
const savedImageMaxBytes = 700 * 1024;
const imageMaxDimension = 1200;

const dataUrlBytes = (value) => {
  const encoded = String(value || "").split(",")[1] || "";
  return Math.ceil((encoded.length * 3) / 4);
};

const loadLocalImage = (file) => new Promise((resolve, reject) => {
  const source = URL.createObjectURL(file);
  const image = new Image();
  image.onload = () => {
    URL.revokeObjectURL(source);
    resolve(image);
  };
  image.onerror = () => {
    URL.revokeObjectURL(source);
    reject(new Error("Could not read image file."));
  };
  image.src = source;
});

export const prepareImageFile = async (file) => {
  if (!file) return "";
  if (!file.type.startsWith("image/")) throw new Error("Choose an image file.");
  if (file.size > imageFileMaxBytes) throw new Error("Image must be 8MB or smaller.");

  const image = await loadLocalImage(file);
  const initialScale = Math.min(1, imageMaxDimension / Math.max(image.naturalWidth, image.naturalHeight));
  let width = Math.max(1, Math.round(image.naturalWidth * initialScale));
  let height = Math.max(1, Math.round(image.naturalHeight * initialScale));
  let quality = 0.9;
  let result = "";

  for (let attempt = 0; attempt < 8; attempt += 1) {
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Image processing is not available in this browser.");
    context.drawImage(image, 0, 0, width, height);
    result = canvas.toDataURL("image/webp", quality);
    if (dataUrlBytes(result) <= savedImageMaxBytes) return result;

    if (quality > 0.62) quality -= 0.1;
    else {
      width = Math.max(1, Math.round(width * 0.82));
      height = Math.max(1, Math.round(height * 0.82));
    }
  }

  if (dataUrlBytes(result) > savedImageMaxBytes) {
    throw new Error("Could not optimize this image. Try a smaller picture.");
  }
  return result;
};

export const normalizeImageSource = (value) => {
  const source = String(value || "").trim();
  if (!source || source.startsWith("data:image/")) return source;
  const withProtocol = source.startsWith("//")
    ? `https:${source}`
    : /^[a-z][a-z\d+.-]*:/i.test(source) ? source : `https://${source}`;

  let url;
  try {
    url = new URL(withProtocol);
  } catch {
    throw new Error("Enter a valid image URL.");
  }
  if (!["http:", "https:"].includes(url.protocol)) {
    throw new Error("Image URL must start with http:// or https://.");
  }
  return url.toString();
};
