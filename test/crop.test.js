import assert from 'node:assert/strict';
import test from 'node:test';
import { DEFAULT_CROP, cropToPixels, moveCrop, resizeCrop } from '../src/crop.js';

test('moves crop while keeping it inside the image bounds', () => {
  assert.deepEqual(
    moveCrop(DEFAULT_CROP, 2, 2),
    { x: 0.16, y: 0.8, width: 0.84, height: 0.2 },
  );
});

test('resizes crop from a corner while preserving a minimum selection size', () => {
  const resized = resizeCrop(DEFAULT_CROP, 'nw', { x: 0.3, y: 0.52 });
  assert.deepEqual(resized, { x: 0.3, y: 0.52, width: 0.62, height: 0.08 });
});

test('converts normalized crop coordinates into source pixels', () => {
  assert.deepEqual(
    cropToPixels({ x: 0.1, y: 0.25, width: 0.5, height: 0.2 }, 2000, 1000),
    { x: 200, y: 250, width: 1000, height: 200 },
  );
});
