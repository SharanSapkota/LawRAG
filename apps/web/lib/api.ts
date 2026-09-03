import type {
  ChatSessionSummary,
  ChatSessionWithMessages,
  LawCategoryData,
  LawDocumentListItem,
  SendMessageResponse,
} from "./types";

// Client-side fetches need NEXT_PUBLIC_-prefixed env vars — the plain
// NEST_API_URL used by the server-side NextAuth callback isn't available
// in the browser bundle.
const NEST_API_URL = process.env.NEXT_PUBLIC_NEST_API_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  status: number;
  payload: unknown;

  constructor(message: string, status: number, payload: unknown) {
    super(message);
    this.status = status;
    this.payload = payload;
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {},
): Promise<T> {
  const { token, headers, ...rest } = options;

  const res = await fetch(`${NEST_API_URL}${path}`, {
    ...rest,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...headers,
    },
  });

  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await res.json();
    } catch {
      payload = undefined;
    }
    const message =
      payload && typeof payload === "object" && "message" in payload
        ? String((payload as { message: unknown }).message)
        : `Request failed with status ${res.status}`;
    throw new ApiError(message, res.status, payload);
  }

  return res.json() as Promise<T>;
}

export function createChatSession(token?: string): Promise<ChatSessionSummary> {
  return request<ChatSessionSummary>("/chat/sessions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({}),
    token,
  });
}

export function getChatSession(id: string, token?: string): Promise<ChatSessionWithMessages> {
  return request<ChatSessionWithMessages>(`/chat/sessions/${id}`, { token });
}

export function listChatSessions(token: string): Promise<ChatSessionSummary[]> {
  return request<ChatSessionSummary[]>("/chat/sessions", { token });
}

export function sendChatMessage(
  sessionId: string,
  content: string,
  token: string,
): Promise<SendMessageResponse> {
  return request<SendMessageResponse>("/chat/messages", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, content }),
    token,
  });
}

export function listCategories(): Promise<LawCategoryData[]> {
  return request<LawCategoryData[]>("/categories");
}

export function createCategory(
  name: string,
  token: string,
  parentId?: string,
): Promise<LawCategoryData> {
  return request<LawCategoryData>("/categories", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, parentId }),
    token,
  });
}

export function listDocuments(token: string): Promise<LawDocumentListItem[]> {
  return request<LawDocumentListItem[]>("/admin/documents", { token });
}

export function uploadDocument(
  input: { categoryId: string; title?: string; file: File },
  token: string,
): Promise<LawDocumentListItem> {
  const formData = new FormData();
  formData.append("categoryId", input.categoryId);
  if (input.title) formData.append("title", input.title);
  formData.append("file", input.file);

  // No Content-Type header here on purpose — the browser sets the
  // multipart boundary itself when the body is a FormData instance;
  // setting it manually breaks the upload.
  return request<LawDocumentListItem>("/admin/documents", {
    method: "POST",
    body: formData,
    token,
  });
}

export function processDocument(id: string, token: string): Promise<{ chunkCount: number }> {
  return request<{ chunkCount: number }>(`/admin/documents/${id}/process`, {
    method: "POST",
    token,
  });
}

export function publishDocument(id: string, token: string): Promise<LawDocumentListItem> {
  return request<LawDocumentListItem>(`/admin/documents/${id}/publish`, {
    method: "POST",
    token,
  });
}

export function renameDocument(
  id: string,
  title: string,
  token: string,
): Promise<LawDocumentListItem> {
  return request<LawDocumentListItem>(`/admin/documents/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ title }),
    token,
  });
}
