const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;
const OCR_SUBSTITUTIONS = Object.freeze({ O: '0', I: '1', Q: '0' });

/**
 * Retains only characters that can be typed in a VIN and normalizes casing.
 * Invalid VIN letters are deliberately retained so validation can explain why
 * a value is invalid instead of silently changing the customer's data.
 */
export function normalizeVinInput(value = '') {
  return String(value).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 17);
}

export function isValidVin(value = '') {
  return VIN_PATTERN.test(value);
}

function collectOcrFragments(ocrText) {
  const fragments = new Set();
  const lines = String(ocrText).toUpperCase().split(/\r?\n/);

  for (const line of lines) {
    const tokens = line.match(/[A-Z0-9]+/g) ?? [];

    for (let start = 0; start < tokens.length; start += 1) {
      let fragment = '';
      for (let end = start; end < tokens.length; end += 1) {
        fragment += tokens[end];
        if (fragment.length > 19) break;
        if (fragment.length >= 15) fragments.add(fragment);
      }
    }
  }

  return [...fragments];
}

function inspectFragment(rawCandidate) {
  const corrections = [];
  const normalized = [...rawCandidate].map((character, index) => {
    const replacement = OCR_SUBSTITUTIONS[character];
    if (replacement) {
      corrections.push({ index, from: character, to: replacement });
      return replacement;
    }
    return character;
  }).join('');
  const valid = rawCandidate.length === 17 && isValidVin(normalized);
  const distance = Math.abs(rawCandidate.length - 17);

  return {
    raw: rawCandidate,
    normalized,
    corrections,
    valid,
    score: (valid ? 100 : 0) - distance * 10 - corrections.length * 0.1,
  };
}

/**
 * Inspects OCR output without modifying user input. O/I/Q substitutions are
 * returned as visible OCR-only corrections, so the user can verify them.
 */
export function analyzeVinOcr(ocrText = '') {
  const rawText = String(ocrText).trim();
  const fragments = collectOcrFragments(rawText);
  const candidates = fragments
    .map(inspectFragment)
    .sort((first, second) => second.score - first.score || first.raw.localeCompare(second.raw));

  return {
    rawText,
    best: candidates[0] ?? null,
    valid: candidates.find((candidate) => candidate.valid) ?? null,
  };
}

export function extractVinCandidate(ocrText = '') {
  return analyzeVinOcr(ocrText).valid?.normalized ?? '';
}
