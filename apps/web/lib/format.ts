import type { ChatSessionSummary } from "./types";

export function getErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof TypeError) {
    // fetch() rejects with a TypeError when the API is unreachable.
    return "Couldn't reach the server. Check your connection and try again.";
  }
  return err instanceof Error && err.message ? err.message : fallback;
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const dateFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  year: "numeric",
});

const dateTimeFormatter = new Intl.DateTimeFormat(undefined, {
  day: "numeric",
  month: "short",
  hour: "numeric",
  minute: "2-digit",
});

const timeFormatter = new Intl.DateTimeFormat(undefined, {
  hour: "numeric",
  minute: "2-digit",
});

export function formatDate(iso: string): string {
  return dateFormatter.format(new Date(iso));
}

export function formatDateTime(iso: string): string {
  return dateTimeFormatter.format(new Date(iso));
}

export function formatTime(iso: string): string {
  return timeFormatter.format(new Date(iso));
}

export interface SessionGroup {
  label: string;
  sessions: ChatSessionSummary[];
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Buckets sessions (already sorted most-recent first) by recency. */
export function groupSessionsByDate(
  sessions: ChatSessionSummary[],
  now: Date = new Date(),
): SessionGroup[] {
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const buckets: SessionGroup[] = [
    { label: "Today", sessions: [] },
    { label: "Yesterday", sessions: [] },
    { label: "Previous 7 days", sessions: [] },
    { label: "Previous 30 days", sessions: [] },
    { label: "Older", sessions: [] },
  ];

  for (const session of sessions) {
    const time = new Date(session.updatedAt).getTime();
    let index: number;
    if (time >= startOfToday) index = 0;
    else if (time >= startOfToday - DAY_MS) index = 1;
    else if (time >= startOfToday - 7 * DAY_MS) index = 2;
    else if (time >= startOfToday - 30 * DAY_MS) index = 3;
    else index = 4;
    buckets[index].sessions.push(session);
  }

  return buckets.filter((group) => group.sessions.length > 0);
}
