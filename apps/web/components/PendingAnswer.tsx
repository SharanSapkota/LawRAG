"use client";

import { useEffect, useState } from "react";
import { Icon } from "./ui/Icon";

// The API does retrieval then generation in one request with no progress
// events, so these stages are timed approximations — they tell the user
// what's happening rather than leaving a bare spinner for several seconds.
const STAGES = [
  { afterMs: 0, label: "Searching the published law library…" },
  { afterMs: 2500, label: "Reviewing relevant sections…" },
  { afterMs: 6000, label: "Drafting an answer with citations…" },
];

export function PendingAnswer() {
  const [stage, setStage] = useState(0);

  useEffect(() => {
    const timers = STAGES.slice(1).map((s, index) =>
      window.setTimeout(() => setStage(index + 1), s.afterMs),
    );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, []);

  return (
    <div className="message message-assistant" role="status" aria-live="polite">
      <div className="assistant-avatar" aria-hidden="true">
        <Icon name="scale" size={16} />
      </div>
      <div className="assistant-body">
        <div className="assistant-meta">
          <span className="assistant-name">Research assistant</span>
        </div>
        <div className="pending-answer">
          <span className="typing-dots" aria-hidden="true">
            <span />
            <span />
            <span />
          </span>
          <span className="pending-label">{STAGES[stage].label}</span>
        </div>
      </div>
    </div>
  );
}
