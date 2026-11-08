import assert from 'node:assert/strict';
import test from 'node:test';
import { analyzeVinOcr, extractVinCandidate, isValidVin, normalizeVinInput } from '../src/vin.js';

test('normalizes user VIN input without silently correcting prohibited letters', () => {
  assert.equal(normalizeVinInput(' mr0-abc 123 456 789 '), 'MR0ABC123456789');
  assert.equal(normalizeVinInput('mr0ioql2345678901'), 'MR0IOQL2345678901');
});

test('validates only 17-character VIN values without I, O, or Q', () => {
  assert.equal(isValidVin('MR0AB12C3D4567890'), true);
  assert.equal(isValidVin('MR0AB12C3D456789'), false);
  assert.equal(isValidVin('MR0AB12C3D45678IO'), false);
});

test('extracts a contiguous valid VIN from OCR output', () => {
  assert.equal(
    extractVinCandidate('NOMOR RANGKA\nMR0AB12C3D4567890\nMODEL'),
    'MR0AB12C3D4567890',
  );
});

test('handles spaced OCR VIN and common OCR O/I substitutions', () => {
  assert.equal(
    extractVinCandidate('No. rangka: MR OAB12C3D4S6789O'),
    'MR0AB12C3D4S67890',
  );
});

test('surfaces a visible OCR-only O-to-0 correction', () => {
  const analysis = analyzeVinOcr('MR0AB12C3D456789O');
  assert.equal(analysis.valid?.normalized, 'MR0AB12C3D4567890');
  assert.deepEqual(analysis.valid?.corrections, [{ index: 16, from: 'O', to: '0' }]);
});

test('preserves a near-valid OCR result for manual correction', () => {
  const analysis = analyzeVinOcr('MR0AB12C3D456789');
  assert.equal(analysis.valid, null);
  assert.equal(analysis.best?.raw, 'MR0AB12C3D456789');
});

test('joins separately recognized VIN characters inside the selected crop', () => {
  assert.equal(
    analyzeVinOcr('M R 0 A B 1 2 C 3 D 4 5 6 7 8 9 O').valid?.normalized,
    'MR0AB12C3D4567890',
  );
});
test('does not return uncertain non-VIN text', () => {
  assert.equal(extractVinCandidate('nomor dokumen 1234-ABCD'), '');
});
