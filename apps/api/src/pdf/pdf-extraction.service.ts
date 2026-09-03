import { Injectable, Logger } from "@nestjs/common";
import { createCanvas, type SKRSContext2D } from "@napi-rs/canvas";
import { createWorker } from "tesseract.js";

const MIN_TEXT_LENGTH_BEFORE_OCR = 20;
const OCR_RENDER_SCALE = 2;

// pdfjs-dist v4 ships ESM only (no CommonJS build) — loaded via dynamic
// import even though this file otherwise compiles to CommonJS.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function loadPdfjs(): Promise<any> {
  return import("pdfjs-dist/legacy/build/pdf.mjs");
}

const LINE_BREAK_Y_THRESHOLD = 1;

/**
 * pdfjs's getTextContent() returns a flat list of text fragments per
 * page with no line-break markers — naively joining them with spaces
 * (as an earlier version of this file did) collapses every line on a
 * page into one giant line, which silently breaks chunk-text.util.ts's
 * line-by-line section-heading detection whenever a page has more than
 * one section. Each item's transform matrix carries its y-position
 * (transform[5]); a meaningful change between consecutive items' y
 * means a new line, so a newline is inserted instead of a space.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function joinTextItemsPreservingLines(items: any[]): string {
  let pageText = "";
  let lastY: number | null = null;

  for (const item of items) {
    const str: string = item.str ?? "";
    const y: number | null = Array.isArray(item.transform) ? item.transform[5] : null;

    if (pageText.length > 0) {
      pageText += lastY !== null && y !== null && Math.abs(y - lastY) > LINE_BREAK_Y_THRESHOLD
        ? "\n"
        : " ";
    }

    pageText += str;
    if (y !== null) lastY = y;
  }

  return pageText;
}

/**
 * Isolated here (not chat-specific) since the admin document pipeline
 * (CLAUDE.md section 5, not yet built) will need the same text-extraction
 * logic for chunking uploaded law documents.
 *
 * Uses pdfjs-dist (actively maintained) for both the primary text-layer
 * extraction and OCR page rendering — not pdf-parse, whose bundled pdf.js
 * (v1.10.100, ~2015) failed to parse even a plain macOS-generated PDF in
 * testing ("bad XRef entry"). One reliable library beats two, one of them
 * unreliable.
 */
@Injectable()
export class PdfExtractionService {
  private readonly logger = new Logger(PdfExtractionService.name);

  async extractText(buffer: Buffer): Promise<string> {
    const pdfjsLib = await loadPdfjs();
    const doc = await pdfjsLib.getDocument({ data: new Uint8Array(buffer) }).promise;

    let text = "";
    for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
      const page = await doc.getPage(pageNum);
      const content = await page.getTextContent();
      text += `${joinTextItemsPreservingLines(content.items)}\n\n`;
    }

    const trimmed = text.trim();

    if (trimmed.length >= MIN_TEXT_LENGTH_BEFORE_OCR) {
      return trimmed;
    }

    this.logger.log("PDF has little/no text layer — falling back to OCR");
    return this.extractTextViaOcr(doc);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private async extractTextViaOcr(doc: any): Promise<string> {
    // Combined eng+nep model: scanned documents' language isn't known
    // ahead of time (there's no text layer to check), so recognizing both
    // scripts in one pass covers English, Nepali, and mixed documents
    // without requiring the admin to specify a language at upload time.
    const worker = await createWorker(["eng", "nep"]);
    const pageTexts: string[] = [];

    try {
      for (let pageNum = 1; pageNum <= doc.numPages; pageNum++) {
        const page = await doc.getPage(pageNum);
        const viewport = page.getViewport({ scale: OCR_RENDER_SCALE });
        const canvas = createCanvas(viewport.width, viewport.height);
        const context = canvas.getContext("2d");

        await page.render({
          canvasContext: context as unknown as SKRSContext2D,
          viewport,
        }).promise;

        const {
          data: { text: pageText },
        } = await worker.recognize(canvas.toBuffer("image/png"));
        pageTexts.push(pageText);
      }
    } finally {
      await worker.terminate();
    }

    return pageTexts.join("\n\n").trim();
  }
}
