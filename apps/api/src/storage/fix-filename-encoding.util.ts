/**
 * multer/busboy can mis-decode non-ASCII filenames (e.g. Nepali/Devanagari)
 * from the multipart Content-Disposition header as latin1, even though the
 * browser sent them as UTF-8 — corrupting them into mojibake before our
 * code ever sees them. Re-decoding the mis-interpreted latin1 string as
 * UTF-8 recovers the original text. Safe no-op for plain ASCII filenames
 * (ASCII round-trips identically through latin1 and UTF-8).
 */
export function fixMulterFilenameEncoding(originalname: string): string {
  return Buffer.from(originalname, "latin1").toString("utf8");
}
