export interface TextChunk {
  sectionRef: string | null;
  content: string;
}

// English: "Section 12", "Section 12(3)", "Article 4", "Clause 7(a)".
// Nepali: "दफा १२" (Section 12), "धारा ४" (Article 4, common in
// constitutional text), "परिच्छेद २" (Chapter 2) — both Devanagari (०-९)
// and Arabic numerals, since translated/mixed documents may use either.
// The `\s*` around the parenthesized sub-clause (rather than requiring
// it tight against the digits) tolerates a real PDF-extraction artifact:
// Devanagari glyph clusters often come back from pdfjs with stray spaces
// between them, e.g. "५५ ( २ )" instead of "५५(२)".
const SECTION_HEADING_PATTERN =
  /^(Section|Article|Clause)\s+\d+[A-Za-z]?(\s*\(\s*\d+\s*\))?|^(दफा|धारा|परिच्छेद)\s+[०-९\d]+[क-ह]?(\s*\(\s*[०-९\d]+\s*\))?/i;
const MAX_CHUNK_CHARS = 2000;

/**
 * Chunking heuristic: scan line by line for a heading matching
 * "Section 12", "Section 12(3)", "Article 4", "Clause 7(a)", or the
 * Nepali equivalents ("दफा १२", "धारा ४", "परिच्छेद २") — when found, it
 * becomes the sectionRef for every line until the next heading, which is
 * what CLAUDE.md means by preserving sectionRef "wherever possible" for
 * accurate citations.
 *
 * If the document has no such headings anywhere (no legal document
 * structure detected), falls back to splitting on blank lines
 * (paragraph breaks) with sectionRef = null.
 *
 * Either way, any single chunk longer than MAX_CHUNK_CHARS is further
 * split at that length — a guard against one giant unbroken section
 * becoming a single oversized embedding input.
 */
export function chunkText(text: string): TextChunk[] {
  const bySection = chunkBySectionHeadings(text);

  if (bySection.some((chunk) => chunk.sectionRef !== null)) {
    return bySection.flatMap((chunk) => splitIfTooLong(chunk));
  }

  return chunkByParagraph(text).flatMap((chunk) => splitIfTooLong(chunk));
}

function chunkBySectionHeadings(text: string): TextChunk[] {
  const lines = text.split(/\r?\n/);
  const chunks: TextChunk[] = [];

  let currentSectionRef: string | null = null;
  let currentLines: string[] = [];

  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (content) {
      chunks.push({ sectionRef: currentSectionRef, content });
    }
    currentLines = [];
  };

  for (const line of lines) {
    const match = line.trim().match(SECTION_HEADING_PATTERN);
    if (match) {
      flush();
      currentSectionRef = match[0].trim();
    }
    currentLines.push(line);
  }
  flush();

  return chunks;
}

function chunkByParagraph(text: string): TextChunk[] {
  return text
    .split(/\n\s*\n/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
    .map((content) => ({ sectionRef: null, content }));
}

function splitIfTooLong(chunk: TextChunk): TextChunk[] {
  if (chunk.content.length <= MAX_CHUNK_CHARS) {
    return [chunk];
  }

  const parts: TextChunk[] = [];
  for (let i = 0; i < chunk.content.length; i += MAX_CHUNK_CHARS) {
    parts.push({
      sectionRef: chunk.sectionRef,
      content: chunk.content.slice(i, i + MAX_CHUNK_CHARS),
    });
  }
  return parts;
}
