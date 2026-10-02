"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "./Icon";

type ToastTone = "success" | "error" | "info";

interface ToastItem {
  id: number;
  tone: ToastTone;
  message: string;
}

type ShowToast = (message: string, tone?: ToastTone) => void;

const ToastContext = createContext<ShowToast | null>(null);

const TOAST_DURATION_MS = 4500;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const nextId = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const show = useCallback<ShowToast>(
    (message, tone = "success") => {
      const id = nextId.current++;
      setToasts((prev) => [...prev.slice(-2), { id, tone, message }]);
      window.setTimeout(() => dismiss(id), TOAST_DURATION_MS);
    },
    [dismiss],
  );

  const value = useMemo(() => show, [show]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toast-region" aria-live="polite" aria-relevant="additions">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.tone}`}>
            <Icon name={toast.tone === "success" ? "check" : toast.tone === "error" ? "alert" : "info"} size={16} />
            <span>{toast.message}</span>
            <button type="button" onClick={() => dismiss(toast.id)} aria-label="Dismiss notification">
              <Icon name="close" size={14} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast(): ShowToast {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error("useToast must be used inside <ToastProvider>");
  return ctx;
}
