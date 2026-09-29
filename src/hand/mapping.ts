import type { Hand, Point } from "./landmarks";

/**
 * Only the middle part of the camera image maps to the page, so you can reach the page's
 * edges without your hand leaving the camera's view (fraction ignored on each side).
 */
export const MARGIN = 0.15;

/**
 * Converts camera positions (0–1 fractions, already mirrored) to page pixels.
 *
 * The camera image is first cropped to the page's shape, so the hand isn't stretched when
 * the camera and the window have different proportions.
 */
export function cameraToPage(
  hand: Hand,
  video: { width: number; height: number },
  page: { width: number; height: number },
  margin = MARGIN,
): Hand {
  const videoAspect = video.width / video.height;
  const pageAspect = page.width / page.height;
  // Fraction of the camera image (width, height) that's kept after cropping.
  const keepX = videoAspect > pageAspect ? pageAspect / videoAspect : 1;
  const keepY = videoAspect > pageAspect ? 1 : videoAspect / pageAspect;

  const map = (value: number, keep: number, size: number) => {
    const cropped = (value - (1 - keep) / 2) / keep;
    return ((cropped - margin) / (1 - 2 * margin)) * size;
  };
  // Depth is in the same units as x, so it's scaled the same way.
  const depthScale = page.width / (keepX * (1 - 2 * margin));
  return hand.map((p: Point) => ({
    x: map(p.x, keepX, page.width),
    y: map(p.y, keepY, page.height),
    z: (p.z ?? 0) * depthScale,
  }));
}
