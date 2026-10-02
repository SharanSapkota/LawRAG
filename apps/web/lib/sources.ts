import type { RetrievedSourceData } from "./types";

/** Retrieval can return several chunks from the same section — show each once. */
export function dedupeSources(sources: RetrievedSourceData[]): RetrievedSourceData[] {
  const seen = new Set<string>();
  return sources.filter((source) => {
    const key = `${source.documentTitle}\u0000${source.sectionRef ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function normalize(value: string): string {
  return value
    .toLowerCase()
    .replace(/[\s.,;:()"'“”‘’\-–—]+/g, " ")
    .trim();
}

/**
 * Maps a bracketed citation from the answer text (e.g. "Section 12") to the
 * index of the retrieved source it refers to, or null when there's no
 * confident match.
 */
export function createCitationResolver(sources: RetrievedSourceData[]) {
  const normalized = sources.map((source) => ({
    ref: source.sectionRef ? normalize(source.sectionRef) : "",
    title: normalize(source.documentTitle),
  }));

  return (citation: string): number | null => {
    const target = normalize(citation);
    if (!target) return null;

    const exact = normalized.findIndex((s) => s.ref && s.ref === target);
    if (exact !== -1) return exact;

    const partial = normalized.findIndex(
      (s) => s.ref.length >= 3 && (target.includes(s.ref) || s.ref.includes(target)),
    );
    if (partial !== -1) return partial;

    const byTitle = normalized.findIndex((s) => s.title === target);
    return byTitle === -1 ? null : byTitle;
  };
}
