export const DEFAULT_CROP = Object.freeze({ x: 0.08, y: 0.4, width: 0.84, height: 0.2 });
export const MIN_CROP_WIDTH = 0.18;
export const MIN_CROP_HEIGHT = 0.08;

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);
const round = (value) => Math.round(value * 1_000_000) / 1_000_000;

export function normalizeCrop(crop) {
  const width = clamp(Number(crop.width) || DEFAULT_CROP.width, MIN_CROP_WIDTH, 1);
  const height = clamp(Number(crop.height) || DEFAULT_CROP.height, MIN_CROP_HEIGHT, 1);
  const x = clamp(Number(crop.x) || 0, 0, 1 - width);
  const y = clamp(Number(crop.y) || 0, 0, 1 - height);

  return { x: round(x), y: round(y), width: round(width), height: round(height) };
}

export function moveCrop(crop, deltaX, deltaY) {
  const normalized = normalizeCrop(crop);
  return normalizeCrop({
    ...normalized,
    x: normalized.x + deltaX,
    y: normalized.y + deltaY,
  });
}

export function resizeCrop(crop, handle, point) {
  const current = normalizeCrop(crop);
  const right = current.x + current.width;
  const bottom = current.y + current.height;
  const x = clamp(point.x, 0, 1);
  const y = clamp(point.y, 0, 1);
  let left = current.x;
  let top = current.y;
  let nextRight = right;
  let nextBottom = bottom;

  if (handle.includes('w')) left = clamp(x, 0, right - MIN_CROP_WIDTH);
  if (handle.includes('e')) nextRight = clamp(x, current.x + MIN_CROP_WIDTH, 1);
  if (handle.includes('n')) top = clamp(y, 0, bottom - MIN_CROP_HEIGHT);
  if (handle.includes('s')) nextBottom = clamp(y, current.y + MIN_CROP_HEIGHT, 1);

  return normalizeCrop({
    x: left,
    y: top,
    width: nextRight - left,
    height: nextBottom - top,
  });
}

export function cropToPixels(crop, sourceWidth, sourceHeight) {
  const normalized = normalizeCrop(crop);
  return {
    x: Math.round(normalized.x * sourceWidth),
    y: Math.round(normalized.y * sourceHeight),
    width: Math.max(1, Math.round(normalized.width * sourceWidth)),
    height: Math.max(1, Math.round(normalized.height * sourceHeight)),
  };
}
