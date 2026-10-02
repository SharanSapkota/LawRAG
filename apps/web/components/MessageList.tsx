"use client";

import { memo, useEffect, useRef, type ReactNode } from "react";
import type { ChatMessageData, RetrievedSourceData } from "../lib/types";
import { AssistantMessage } from "./AssistantMessage";
import { PendingAnswer } from "./PendingAnswer";
import { Skeleton } from "./ui/Skeleton";

interface MessageListProps {
  messages: ChatMessageData[];
  sourcesByMessageId: Record<string, RetrievedSourceData[]>;
  pending: boolean;
  loading: boolean;
  emptyState: ReactNode;
}

const UserMessage = memo(function UserMessage({ message }: { message: ChatMessageData }) {
  return (
    <div className="message message-user">
      <div className="user-bubble">
        <p>{message.content}</p>
      </div>
    </div>
  );
});

function ConversationSkeleton() {
  return (
    <div className="conversation-skeleton" aria-busy="true" aria-label="Loading conversation">
      <div className="skeleton-user">
        <Skeleton width="45%" height={38} style={{ borderRadius: 14 }} />
      </div>
      <div className="skeleton-assistant">
        <Skeleton width={30} height={30} style={{ borderRadius: 8 }} />
        <div className="skeleton-lines">
          <Skeleton width="30%" />
          <Skeleton width="95%" />
          <Skeleton width="88%" />
          <Skeleton width="60%" />
        </div>
      </div>
    </div>
  );
}

export function MessageList({
  messages,
  sourcesByMessageId,
  pending,
  loading,
  emptyState,
}: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const previousCount = useRef(0);

  // Follow the conversation as it grows. A jump of several messages at
  // once means a chat was just opened from history — snap instead of
  // animating through the whole thread.
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const delta = messages.length - previousCount.current;
    previousCount.current = messages.length;
    el.scrollTo({ top: el.scrollHeight, behavior: delta > 2 ? "auto" : "smooth" });
  }, [messages.length, pending]);

  const isEmpty = messages.length === 0 && !pending && !loading;

  return (
    <div ref={scrollRef} className="message-scroll" tabIndex={-1}>
      <div className={`message-column${isEmpty ? " message-column-empty" : ""}`}>
        {loading ? (
          <ConversationSkeleton />
        ) : isEmpty ? (
          emptyState
        ) : (
          <div className="message-thread" aria-label="Conversation">
            {messages.map((message) =>
              message.role === "ASSISTANT" ? (
                <AssistantMessage
                  key={message.id}
                  message={message}
                  sources={sourcesByMessageId[message.id]}
                />
              ) : (
                <UserMessage key={message.id} message={message} />
              ),
            )}
            {pending ? <PendingAnswer /> : null}
          </div>
        )}
      </div>
    </div>
  );
}
