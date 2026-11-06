/**
 * Scale math for background images.
 *
 * All scales are expressed as a multiplier of the stored image's natural
 * pixels (1 = 100%). The image is drawn in world pixels, so it scales with
 * zoom and pan like the rest of the drawing.
 */

export type BackgroundScaleMode =
  | "fit"
  | "fit-width"
  | "fit-height"
  | "25"
  | "50"
  | "100"
  | "200"
  | "custom";

export const MIN_BACKGROUND_SCALE = 0.05;
export const MAX_BACKGROUND_SCALE = 5;

/** Fraction of the viewport used by the `fit` modes, leaving a small margin. */
export const FIT_MARGIN = 0.9;

export function clampBackgroundScale(scale: number): number {
  if (!Number.isFinite(scale) || scale <= 0) {
    return 1;
  }
  return Math.min(MAX_BACKGROUND_SCALE, Math.max(MIN_BACKGROUND_SCALE, scale));
}

export function percentToScale(percent: number): number {
  return clampBackgroundScale(percent / 100);
}

export function computeBackgroundScale(
  mode: BackgroundScaleMode,
  naturalW: number,
  naturalH: number,
  viewportW: number,
  viewportH: number
): number {
  if (!(naturalW > 0) || !(naturalH > 0)) {
    return 1;
  }
  const vw = Math.max(1, viewportW);
  const vh = Math.max(1, viewportH);
  switch (mode) {
    case "fit":
      return clampBackgroundScale(
        Math.min(vw / naturalW, vh / naturalH) * FIT_MARGIN
      );
    case "fit-width":
      return clampBackgroundScale((vw / naturalW) * FIT_MARGIN);
    case "fit-height":
      return clampBackgroundScale((vh / naturalH) * FIT_MARGIN);
    case "25":
      return 0.25;
    case "50":
      return 0.5;
    case "100":
      return 1;
    case "200":
      return 2;
    default:
      return 1;
  }
}
