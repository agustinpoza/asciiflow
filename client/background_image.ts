/**
 * Converts an uploaded image file into a background image source that is
 * small enough to keep in localStorage.
 *
 * The image is decoded, downscaled to a reasonable maximum dimension and
 * re-encoded (WebP when available, PNG otherwise) until the data URL fits in
 * our storage budget. `naturalW`/`naturalH` describe the encoded bitmap, so a
 * scale of 100% always means one stored pixel per world pixel.
 */

export interface IBackgroundSource {
  dataUrl: string;
  naturalW: number;
  naturalH: number;
}

const MAX_IMAGE_DIMENSION = 1600;
const MIN_IMAGE_DIMENSION = 320;
// ~1.2 MB of base64 (roughly 900 KB of binary). localStorage is usually 5 MB.
const MAX_DATA_URL_LENGTH = 1_200_000;

export function fitImageWithin(
  width: number,
  height: number,
  maxDimension: number = MAX_IMAGE_DIMENSION
): { width: number; height: number } {
  const largest = Math.max(width, height);
  if (largest <= maxDimension) {
    return { width: Math.max(1, Math.round(width)), height: Math.max(1, Math.round(height)) };
  }
  const ratio = maxDimension / largest;
  return {
    width: Math.max(1, Math.round(width * ratio)),
    height: Math.max(1, Math.round(height * ratio)),
  };
}

function loadImageElement(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("could not decode image"));
    image.src = url;
  });
}

function render(
  source: CanvasImageSource,
  width: number,
  height: number
): HTMLCanvasElement {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d")!;
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = "high";
  context.drawImage(source, 0, 0, width, height);
  return canvas;
}

function encode(canvas: HTMLCanvasElement, quality: number): string {
  const webp = canvas.toDataURL("image/webp", quality);
  // Browsers without WebP encoding fall back to PNG silently.
  return webp.startsWith("data:image/webp") ? webp : canvas.toDataURL("image/png");
}

/**
 * Decodes the file, downscales it and compresses it until the resulting data
 * URL is small enough to persist.
 */
export async function fileToBackgroundSource(
  file: File
): Promise<IBackgroundSource> {
  const url = URL.createObjectURL(file);
  try {
    const image = await loadImageElement(url);
    const originalW = image.naturalWidth || image.width;
    const originalH = image.naturalHeight || image.height;
    if (!(originalW > 0) || !(originalH > 0)) {
      throw new Error("image has no dimensions");
    }

    let { width, height } = fitImageWithin(
      originalW,
      originalH,
      MAX_IMAGE_DIMENSION
    );
    let canvas = render(image, width, height);
    let dataUrl = encode(canvas, 0.85);

    // Shrink until it fits or we hit a sane minimum size.
    while (
      dataUrl.length > MAX_DATA_URL_LENGTH &&
      Math.max(width, height) > MIN_IMAGE_DIMENSION
    ) {
      width = Math.max(1, Math.round(width * 0.75));
      height = Math.max(1, Math.round(height * 0.75));
      canvas = render(image, width, height);
      dataUrl = encode(canvas, 0.75);
    }

    return { dataUrl, naturalW: width, naturalH: height };
  } finally {
    URL.revokeObjectURL(url);
  }
}
