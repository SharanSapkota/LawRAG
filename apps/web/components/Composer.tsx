"use client";

import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent,
} from "react";
import { Icon } from "./ui/Icon";
import { Spinner } from "./ui/Spinner";

export interface ComposerHandle {
  /** Replaces the draft (e.g. from an example question or a failed send) and focuses the input. */
  setDraft: (text: string) => void;
  focus: () => void;
}

interface ComposerProps {
  isAuthenticated: boolean;
  isSending: boolean;
  disabled?: boolean;
  onSend: (content: string) => void;
  onSignInRequired: () => void;
}

const MAX_TEXTAREA_HEIGHT = 220;
const MAX_LENGTH = 4000;
const COUNTER_THRESHOLD = MAX_LENGTH - 500;

export const Composer = forwardRef<ComposerHandle, ComposerProps>(function Composer(
  { isAuthenticated, isSending, disabled = false, onSend, onSignInRequired },
  ref,
) {
  const [value, setValue] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Resize after every value change (typing, programmatic draft, clear).
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, MAX_TEXTAREA_HEIGHT)}px`;
  }, [value]);

  useImperativeHandle(
    ref,
    () => ({
      setDraft: (text: string) => {
        setValue(text.slice(0, MAX_LENGTH));
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (!el) return;
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        });
      },
      focus: () => textareaRef.current?.focus(),
    }),
    [],
  );

  const trimmed = value.trim();
  const canSend = trimmed.length > 0 && !isSending && !disabled;

  // Typing is always allowed, guest or not — only the send action is
  // gated on being signed in (CLAUDE.md "guest read, no write").
  const handleSubmit = useCallback(() => {
    if (!isAuthenticated) {
      onSignInRequired();
      return;
    }
    if (!canSend) return;
    onSend(trimmed);
    setValue("");
  }, [isAuthenticated, canSend, onSend, onSignInRequired, trimmed]);

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    // Don't submit mid-IME composition (Devanagari input methods use it).
    if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      handleSubmit();
    }
  };

  return (
    <form
      className={`composer${disabled ? " composer-disabled" : ""}`}
      onSubmit={(event) => {
        event.preventDefault();
        handleSubmit();
      }}
    >
      <label htmlFor="composer-input" className="sr-only">
        Your legal question
      </label>
      <textarea
        id="composer-input"
        ref={textareaRef}
        className="composer-input"
        value={value}
        onChange={(event) => setValue(event.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="Ask a question about Nepali law…"
        rows={1}
        maxLength={MAX_LENGTH}
        aria-describedby="composer-hint"
      />
      <div className="composer-toolbar">
        <span id="composer-hint" className="composer-hint">
          {value.length >= COUNTER_THRESHOLD ? (
            <span className={value.length >= MAX_LENGTH ? "composer-count-max" : undefined}>
              {value.length.toLocaleString()} / {MAX_LENGTH.toLocaleString()}
            </span>
          ) : isAuthenticated ? (
            <span className="composer-shortcuts">
              <kbd>Enter</kbd> to send · <kbd>Shift</kbd> + <kbd>Enter</kbd> for a new line
            </span>
          ) : (
            "Sign in with Google to ask questions and save your research."
          )}
        </span>
        {isAuthenticated ? (
          <button
            type="submit"
            className="composer-send"
            disabled={!canSend}
            aria-label={isSending ? "Sending" : "Send question"}
            title="Send"
          >
            {isSending ? <Spinner size={15} /> : <Icon name="send" size={17} />}
          </button>
        ) : (
          <button type="submit" className="btn btn-primary btn-sm">
            Sign in to ask
          </button>
        )}
      </div>
    </form>
  );
});
