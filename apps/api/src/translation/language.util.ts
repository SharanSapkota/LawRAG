const DEVANAGARI_RANGE = /[ऀ-ॿ]/g;

/**
 * Cheap, deterministic, no-API-call language check: is this text
 * majority Devanagari script (Nepali)? Used per-chunk rather than once
 * per document, so a document that mixes Nepali and English sections
 * (not uncommon) gets each chunk translated only when it actually needs
 * it.
 */
export function isPredominantlyDevanagari(text: string): boolean {
  const letters = text.replace(/\s/g, "");
  if (letters.length === 0) return false;

  const devanagariMatches = letters.match(DEVANAGARI_RANGE);
  const devanagariCount = devanagariMatches ? devanagariMatches.length : 0;

  return devanagariCount / letters.length > 0.3;
}
