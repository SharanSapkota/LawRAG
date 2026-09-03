// Mirrors the shapes returned by apps/api's chat endpoints. Not imported
// from @repo/database — the frontend never talks to the DB directly, only
// through the Nest API (CLAUDE.md), so these are hand-kept response types.
// A future step could move these to packages/shared-types.

export type ChatMessageRole = "USER" | "ASSISTANT";

export interface ChatMessageData {
  id: string;
  sessionId: string;
  role: ChatMessageRole;
  content: string;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionSummary {
  id: string;
  userId: string | null;
  title: string | null;
  isPublicPreview: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ChatSessionWithMessages extends ChatSessionSummary {
  messages: ChatMessageData[];
}

export interface RetrievedSourceData {
  sectionRef: string | null;
  documentTitle: string;
}

export interface SendMessageResponse {
  userMessage: ChatMessageData;
  aiMessage: ChatMessageData;
  sources: RetrievedSourceData[];
}

export interface LawCategoryData {
  id: string;
  name: string;
  slug: string;
  parentId: string | null;
}

export type LawDocumentStatus = "DRAFT" | "PUBLISHED";

export interface LawDocumentListItem {
  id: string;
  title: string;
  status: LawDocumentStatus;
  fileName: string | null;
  createdAt: string;
  category: { id: string; name: string } | null;
  chunkCount: number;
}
