"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { signIn, useSession } from "next-auth/react";
import { Sidebar } from "../components/Sidebar";
import { MessageList } from "../components/MessageList";
import { Composer, type ComposerHandle } from "../components/Composer";
import { WelcomeScreen } from "../components/WelcomeScreen";
import { Alert } from "../components/ui/Alert";
import { Button } from "../components/ui/Button";
import { Icon } from "../components/ui/Icon";
import {
  ApiError,
  createChatSession,
  getChatSession,
  listChatSessions,
  sendChatMessage,
} from "../lib/api";
import { formatDateTime, getErrorMessage } from "../lib/format";
import type { ChatMessageData, ChatSessionSummary, RetrievedSourceData } from "../lib/types";

interface QuotaErrorState {
  message: string;
  retryAfter?: string;
}

interface GeneralErrorState {
  message: string;
  // Present when the failure was a send — lets the user retry in one click.
  retryContent?: string;
}

// The API includes messages unordered; sort by time, user before assistant
// on ties (both rows of a turn can share a timestamp).
function sortMessages(messages: ChatMessageData[]): ChatMessageData[] {
  return [...messages].sort((a, b) => {
    const diff = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
    if (diff !== 0) return diff;
    return a.role === b.role ? 0 : a.role === "USER" ? -1 : 1;
  });
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
  const [isLoadingSessions, setIsLoadingSessions] = useState(false);
  const [messages, setMessages] = useState<ChatMessageData[]>([]);
  // Sources aren't persisted by the API (see ChatService.sendMessage), so
  // they're kept client-side, keyed by assistant message id, for answers
  // received during this visit.
  const [sourcesByMessageId, setSourcesByMessageId] = useState<
    Record<string, RetrievedSourceData[]>
  >({});
  const [isLoadingSession, setIsLoadingSession] = useState(false);
  const [isSending, setIsSending] = useState(false);
  const [quotaError, setQuotaError] = useState<QuotaErrorState | null>(null);
  const [generalError, setGeneralError] = useState<GeneralErrorState | null>(null);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  const composerRef = useRef<ComposerHandle>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);

  const refreshSessions = useCallback(async (token?: string) => {
    if (!token) {
      setSessions([]);
      return;
    }
    setIsLoadingSessions(true);
    try {
      const list = await listChatSessions(token);
      setSessions(list);
    } catch {
      // Non-critical — the sidebar history list just stays stale/empty.
      // Not worth surfacing a banner for this.
    } finally {
      setIsLoadingSessions(false);
    }
  }, []);

  const closeSidebar = useCallback(() => setIsSidebarOpen(false), []);

  // Mobile drawer: return focus to the menu button when it closes (if focus
  // was inside it), and close it on Escape.
  const wasSidebarOpen = useRef(false);
  useEffect(() => {
    if (wasSidebarOpen.current && !isSidebarOpen) {
      const active = document.activeElement;
      if (!active || active === document.body || active.closest("#app-sidebar")) {
        menuButtonRef.current?.focus();
      }
    }
    wasSidebarOpen.current = isSidebarOpen;
  }, [isSidebarOpen]);

  useEffect(() => {
    if (!isSidebarOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeSidebar();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isSidebarOpen, closeSidebar]);

  // "New chat" only clears LOCAL state back to blank — it never calls the
  // API. If we're already on a blank, never-sent-to chat, this is a
  // no-op: there's nothing to reset and nothing was ever created, so
  // clicking it repeatedly can't spawn duplicate empty sessions.
  const handleNewChat = useCallback(() => {
    setIsSidebarOpen(false);
    requestAnimationFrame(() => composerRef.current?.focus());
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
      setIsSidebarOpen(false);
      const token = authSession?.nestAccessToken;
      if (!token || id === chatSession?.id) return;

      setIsLoadingSession(true);
      setGeneralError(null);
      setQuotaError(null);
      try {
        const session = await getChatSession(id, token);
        setChatSession(session);
        setSessionToken(token);
        setMessages(sortMessages(session.messages));
      } catch (err) {
        setGeneralError({ message: getErrorMessage(err, "Failed to load that conversation.") });
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
      setSourcesByMessageId({});
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
          setGeneralError({
            message: getErrorMessage(err, "Failed to start a new conversation."),
            retryContent: content,
          });
          composerRef.current?.setDraft(content);
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
        setSourcesByMessageId((prev) => ({ ...prev, [result.aiMessage.id]: result.sources }));
        // Picks up the auto-generated title (first message) and the
        // updated-recency reordering in the sidebar history list.
        void refreshSessions(token);
      } catch (err) {
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
        // Give the question back so it isn't lost.
        composerRef.current?.setDraft(content);

        if (err instanceof ApiError && err.status === 429) {
          const payload = err.payload as { message?: string; retryAfter?: string } | undefined;
          setQuotaError({
            message: payload?.message ?? err.message,
            retryAfter: payload?.retryAfter,
          });
        } else {
          setGeneralError({
            message: getErrorMessage(err, "Failed to send your question."),
            retryContent: content,
          });
        }
      } finally {
        setIsSending(false);
      }
    },
    [chatSession, authSession?.nestAccessToken, refreshSessions],
  );

  const handleRetry = useCallback(() => {
    const content = generalError?.retryContent;
    if (!content) return;
    composerRef.current?.setDraft("");
    void handleSend(content);
  }, [generalError?.retryContent, handleSend]);

  const handlePickQuestion = useCallback((question: string) => {
    composerRef.current?.setDraft(question);
  }, []);

  const handleSignIn = useCallback(() => {
    void signIn("google");
  }, []);

  const isAuthenticated = Boolean(authSession?.nestAccessToken);
  const isSignedInWithoutToken = Boolean(authSession) && !isAuthenticated;
  // The API auto-titles a session on its first message; that title reaches
  // us through the refreshed history list, not the session object we hold.
  const sessionTitle = chatSession
    ? (sessions.find((s) => s.id === chatSession.id)?.title ?? chatSession.title)
    : null;
  const title = sessionTitle ?? (messages.length > 0 ? "Untitled conversation" : "New research");

  return (
    <div className="app-shell">
      <a href="#composer-input" className="skip-link">
        Skip to question box
      </a>

      <Sidebar
        onNewChat={handleNewChat}
        sessions={sessions}
        isLoadingSessions={isLoadingSessions}
        activeSessionId={chatSession?.id ?? null}
        onSelectSession={handleSelectSession}
        isOpen={isSidebarOpen}
        onClose={closeSidebar}
      />

      <main className="chat-panel">
        <header className="chat-header">
          <button
            ref={menuButtonRef}
            type="button"
            className="chat-header-button chat-menu-button"
            onClick={() => setIsSidebarOpen(true)}
            aria-label="Open menu"
            aria-controls="app-sidebar"
            aria-expanded={isSidebarOpen}
          >
            <Icon name="menu" size={20} />
          </button>
          <h1 className="chat-title" title={title}>
            {title}
          </h1>
          {chatSession ? (
            <span className="chat-header-meta">{formatDateTime(chatSession.createdAt)}</span>
          ) : null}
          <button
            type="button"
            className="chat-header-button chat-new-button"
            onClick={handleNewChat}
            aria-label="New research"
            title="New research"
          >
            <Icon name="plus" size={20} />
          </button>
        </header>

        <MessageList
          messages={messages}
          sourcesByMessageId={sourcesByMessageId}
          pending={isSending}
          loading={isLoadingSession}
          emptyState={<WelcomeScreen onPickQuestion={handlePickQuestion} />}
        />

        <div className="chat-footer">
          <div className="chat-footer-inner">
            {isSignedInWithoutToken ? (
              <Alert tone="warning" title="We couldn't finish signing you in">
                Your Google account is connected, but the research service didn&apos;t respond.
                Sign out and back in to try again.
              </Alert>
            ) : null}

            {quotaError ? (
              <Alert
                tone="warning"
                title="Daily question limit reached"
                onDismiss={() => setQuotaError(null)}
              >
                {quotaError.message}
                {quotaError.retryAfter ? (
                  <> You can ask more questions after {formatDateTime(quotaError.retryAfter)}.</>
                ) : null}
              </Alert>
            ) : null}

            {generalError ? (
              <Alert
                tone="error"
                title="Something went wrong"
                onDismiss={() => setGeneralError(null)}
                action={
                  generalError.retryContent ? (
                    <Button size="sm" variant="secondary" icon={<Icon name="refresh" size={14} />} onClick={handleRetry}>
                      Try again
                    </Button>
                  ) : null
                }
              >
                {generalError.message}
              </Alert>
            ) : null}

            <Composer
              ref={composerRef}
              isAuthenticated={isAuthenticated}
              isSending={isSending}
              disabled={isLoadingSession}
              onSend={handleSend}
              onSignInRequired={handleSignIn}
            />
            <p className="disclaimer">
              AI-generated legal research, not legal advice. Verify against the cited sources before
              relying on an answer.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
