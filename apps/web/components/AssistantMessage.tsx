"use client";

import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessageData, RetrievedSourceData } from "../lib/types";
import { formatTime } from "../lib/format";
import { createCitationResolver, dedupeSources } from "../lib/sources";
import { FormattedAnswer } from "./FormattedAnswer";
import { SourceList, sourceElementId } from "./SourceList";
import { Icon } from "./ui/Icon";

interface AssistantMessageProps {
  message: ChatMessageData;
  // undefined = sources unknown (history loaded from the API, which
  // doesn't persist them); [] = retrieval genuinely found nothing.
  sources?: RetrievedSourceData[];
}

const HIGHLIGHT_MS = 1800;

export const AssistantMessage = memo(function AssistantMessage({
  message,
  sources,
}: AssistantMessageProps) {
  const [copied, setCopied] = useState(false);
  const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
  const highlightTimer = useRef<number>();

  const uniqueSources = useMemo(() => (sources ? dedupeSources(sources) : undefined), [sources]);
  const resolveCitation = useMemo(
    () => (uniqueSources && uniqueSources.length > 0 ? createCitationResolver(uniqueSources) : undefined),
    [uniqueSources],
  );

  useEffect(() => () => window.clearTimeout(highlightTimer.current), []);

  const handleCitationClick = useCallback(
    (index: number) => {
      setHighlightedIndex(index);
      window.clearTimeout(highlightTimer.current);
      highlightTimer.current = window.setTimeout(() => setHighlightedIndex(null), HIGHLIGHT_MS);
      // Wait a frame so a collapsed source list can expand first.
      requestAnimationFrame(() => {
        const el = document.getElementById(sourceElementId(message.id, index));
        el?.scrollIntoView({ block: "nearest", behavior: "smooth" });
        el?.focus({ preventScroll: true });
      });
    },
    [message.id],
  );

  const handleCopy = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard unavailable (insecure context / denied) — nothing useful to show.
    }
  }, [message.content]);

  return (
    <article className="message message-assistant" aria-label="Assistant answer">
      <div className="assistant-avatar" aria-hidden="true">
        <Icon name="scale" size={16} />
      </div>
      <div className="assistant-body">
        <div className="assistant-meta">
          <span className="assistant-name">Research assistant</span>
          <time dateTime={message.createdAt}>{formatTime(message.createdAt)}</time>
        </div>

        <FormattedAnswer
          content={message.content}
          resolveCitation={resolveCitation}
          onCitationClick={resolveCitation ? handleCitationClick : undefined}
        />

        {uniqueSources ? (
          <SourceList messageId={message.id} sources={uniqueSources} highlightedIndex={highlightedIndex} />
        ) : null}

        <div className="assistant-actions">
          <button type="button" className="message-action" onClick={handleCopy}>
            <Icon name={copied ? "check" : "copy"} size={14} />
            {copied ? "Copied" : "Copy answer"}
          </button>
        </div>
      </div>
    </article>
  );
});
