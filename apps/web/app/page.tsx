"use client";

import { useCallback, useEffect, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Sidebar } from "../components/Sidebar";
import { MessageList } from "../components/MessageList";
import { Composer } from "../components/Composer";
import {
  ApiError,
  createChatSession,
  getChatSession,
  listChatSessions,
  sendChatMessage,
} from "../lib/api";
import type { ChatMessageData, ChatSessionSummary } from "../lib/types";

interface QuotaErrorState {
  message: string;
  retryAfter?: string;
}

export default function HomePage() {
  const { data: authSession, status } = useSession();

  // null = a "blank" chat that has never been sent to yet, and therefore
  // has no backend ChatSession row at all — this is the fix for sessions
  // piling up in the sidebar: a session is created lazily, only at the
  // moment of the first real send, never just from loading the page or
  // clicking "New chat".
  const [chatSession, setChatSession] = useState<ChatSessionSummary | null>(null);
  // Tracks which token (if any) the current local chat state belongs to,
  // so a sign-in/sign-out/account-switch can discard stale state instead
  // of risking a send into a session that belongs to someone else.
  const [sessionToken, setSessionToken] = useState<string | undefined>(undefined);
  const [sessions, setSessions] = useState<ChatSessionSummary[]>([]);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [quotaError, setQuotaError] = useState<QuotaErrorState | null>(null);
  const [generalError, setGeneralError] = useState<string | null>(null);

  const refreshSessions = useCallback(async (token?: string) => {
    if (!token) {
      setSessions([]);
      return;
    }
    try {
      const list = await listChatSessions(token);
      setSessions(list);
    } catch {
      // Non-critical — the sidebar history list just stays stale/empty.
      // Not worth surfacing a banner for this.
    }
  }, []);

  // "New chat" only clears LOCAL state back to blank — it never calls the
  // API. If we're already on a blank, never-sent-to chat, this is a
  // no-op: there's nothing to reset and nothing was ever created, so
  // clicking it repeatedly can't spawn duplicate empty sessions.
  const handleNewChat = useCallback(() => {
    if (!chatSession && messages.length === 0) {
      return;
    }
    setChatSession(null);
    setMessages([]);
    setGeneralError(null);
    setQuotaError(null);
  }, [chatSession, messages.length]);

  const handleSelectSession = useCallback(
    async (id: string) => {
      const token = authSession?.nestAccessToken;
      if (!token || id === chatSession?.id) return;

      setIsLoadingSession(true);
      setGeneralError(null);
      setQuotaError(null);
      try {
        const session = await getChatSession(id, token);
        setChatSession(session);
        setSessionToken(token);
        setMessages(session.messages);
      } catch (err) {
        setGeneralError(err instanceof Error ? err.message : "Failed to load that chat.");
      } finally {
        setIsLoadingSession(false);
      }
    },
    [authSession?.nestAccessToken, chatSession?.id],
  );

  // Discards stale local chat state on any change of "who we are" — sign
  // in, sign out, or switching Google accounts — and (re)loads the
  // sidebar history for whoever's now signed in. Never creates a session
  // itself; that stays lazy, in handleSend.
  useEffect(() => {
    if (status === "loading") return;
    const token = authSession?.nestAccessToken;

    if (token !== sessionToken) {
      setChatSession(null);
      setMessages([]);
      setSessionToken(token);
    }

    void refreshSessions(token);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, authSession?.nestAccessToken]);

  const handleSend = useCallback(
    async (content: string) => {
      const token = authSession?.nestAccessToken;
      if (!token) return;

      setIsSending(true);
      setQuotaError(null);
      setGeneralError(null);

      let session = chatSession;
      if (!session) {
        try {
          session = await createChatSession(token);
          setChatSession(session);
          setSessionToken(token);
        } catch (err) {
          setGeneralError(err instanceof Error ? err.message : "Failed to start a new chat.");
          setIsSending(false);
          return;
        }
      }

      const optimisticId = `optimistic-${Date.now()}`;
      const optimisticUserMessage: ChatMessageData = {
        id: optimisticId,
        sessionId: session.id,
        role: "USER",
        content,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      setMessages((prev) => [...prev, optimisticUserMessage]);

      try {
        const result = await sendChatMessage(session.id, content, token);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== optimisticId),
          result.userMessage,
          result.aiMessage,
        ]);
        // Picks up the auto-generated title (first message) and the
        // updated-recency reordering in the sidebar history list.
        void refreshSessions(token);
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));

        if (err instanceof ApiError && err.status === 429) {
          const payload = err.payload as { message?: string; retryAfter?: string } | undefined;
          setQuotaError({
            message: payload?.message ?? err.message,
            retryAfter: payload?.retryAfter,
          });
        } else {
          setGeneralError(err instanceof Error ? err.message : "Failed to send message.");
        }
      } finally {
        setIsSending(false);
      }
    },
    [chatSession, authSession?.nestAccessToken, refreshSessions],
  );

  const isAuthenticated = Boolean(authSession?.nestAccessToken);

  return (
    <div className="app-shell">
      <Sidebar
        onNewChat={handleNewChat}
        sessions={sessions}
        activeSessionId={chatSession?.id ?? null}
        onSelectSession={(id) => void handleSelectSession(id)}
      />

      <div className="chat-panel">
        <MessageList messages={messages} pending={isSending} />

        {quotaError ? (
          <div className="banner banner-quota">
            {quotaError.message}
            {quotaError.retryAfter ? (
              <> Try again after {new Date(quotaError.retryAfter).toLocaleString()}.</>
            ) : null}
          </div>
        ) : null}

        {generalError ? <div className="banner banner-error">{generalError}</div> : null}

        <Composer
          isAuthenticated={isAuthenticated}
          isSending={isSending || isLoadingSession}
          onSend={handleSend}
          onSignInRequired={() => signIn("google")}
        />
      </div>
    </div>
  );
}
