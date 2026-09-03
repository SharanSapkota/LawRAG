"use client";

import { useRef, useState, type KeyboardEvent } from "react";

interface ComposerProps {
  isAuthenticated: boolean;
  isSending: boolean;
  onSend: (content: string) => void;
  onSignInRequired: () => void;
}

function SendIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3 20l18-8L3 4v6l12 2-12 2v6z" />
    </svg>
  );
}

const MAX_TEXTAREA_HEIGHT = 200;

export function Composer({ isAuthenticated, isSending, onSend, onSignInRequired }: ComposerProps) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const resize = () => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  };

  // Typing is always allowed, guest or not — only the send action is
  // gated on being signed in (CLAUDE.md "guest read, no write").
  const handleSubmit = () => {
    if (!isAuthenticated) {
      onSignInRequired();
      return;
    }

    const trimmed = value.trim();
    if (!trimmed || isSending) return;

    onSend(trimmed);
    setValue("");
    requestAnimationFrame(resize);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="composer">
      <textarea
        ref={textareaRef}
        className="composer-input"
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
          resize();
        }}
        onKeyDown={handleKeyDown}
        placeholder={
          isAuthenticated ? "Ask a legal question…" : "Sign in with Google to send a message…"
        }
        rows={1}
      />
      <button
        type="button"
        className="composer-send"
        onClick={handleSubmit}
        disabled={isAuthenticated && (isSending || value.trim().length === 0)}
        aria-label={isAuthenticated ? "Send message" : "Sign in to send a message"}
        title={isAuthenticated ? "Send" : "Sign in to send a message"}
      >
        <SendIcon />
      </button>
    </div>
  );
}
