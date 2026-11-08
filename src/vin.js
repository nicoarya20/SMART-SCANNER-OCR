const VIN_PATTERN = /^[A-HJ-NPR-Z0-9]{17}$/;

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

function normalizeOcrFragment(fragment) {
  return fragment
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, '')
    .replaceAll('O', '0')
    .replaceAll('I', '1')
    .replaceAll('Q', '0');
}

/**
 * Finds the strongest 17-character VIN candidate in OCR text. OCR commonly
 * confuses O/I/Q with 0/1, so those substitutions are only applied here, not
 * when a user manually edits the VIN.
 */
export function extractVinCandidate(ocrText = '') {
  const raw = String(ocrText).toUpperCase();
  const exactMatches = raw.match(/[A-HJ-NPR-Z0-9]{17}/g) ?? [];

  if (exactMatches.length > 0) {
    return exactMatches[0];
  }

  const lines = raw.split(/\r?\n/);
  for (const line of lines) {
    const tokens = line.match(/[A-Z0-9]+/g) ?? [];

    for (let start = 0; start < tokens.length; start += 1) {
      let candidate = '';
      let longestToken = 0;

      for (let end = start; end < tokens.length; end += 1) {
        const token = normalizeOcrFragment(tokens[end]);
        candidate += token;
        longestToken = Math.max(longestToken, token.length);

        if (candidate.length === 17 && longestToken >= 8 && isValidVin(candidate)) {
          return candidate;
        }
        if (candidate.length >= 17) break;
      }
    }
  }

  return '';
}
