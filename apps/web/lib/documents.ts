import type { LawDocumentListItem } from "./types";

/**
 * The API only has DRAFT/PUBLISHED; the UI splits drafts by whether they've
 * been processed into searchable chunks yet, since that's what decides the
 * admin's next step (process → publish).
 */
export type DocumentStage = "unprocessed" | "ready" | "published";

export function getDocumentStage(doc: LawDocumentListItem): DocumentStage {
  if (doc.status === "PUBLISHED") return "published";
  return doc.chunkCount > 0 ? "ready" : "unprocessed";
}

export const STAGE_LABELS: Record<DocumentStage, string> = {
  unprocessed: "Needs processing",
  ready: "Ready to publish",
  published: "Published",
};
