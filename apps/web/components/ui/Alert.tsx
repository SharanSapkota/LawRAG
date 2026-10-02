import type { ReactNode } from "react";
import { Icon } from "./Icon";

type AlertTone = "error" | "warning" | "info" | "success";

interface AlertProps {
  tone?: AlertTone;
  title?: string;
  children?: ReactNode;
  action?: ReactNode;
  onDismiss?: () => void;
  className?: string;
}

export function Alert({ tone = "error", title, children, action, onDismiss, className }: AlertProps) {
  return (
    <div
      className={`alert alert-${tone}${className ? ` ${className}` : ""}`}
      role={tone === "error" || tone === "warning" ? "alert" : "status"}
    >
      <Icon name={tone === "success" ? "check" : tone === "info" ? "info" : "alert"} size={18} className="alert-icon" />
      <div className="alert-body">
        {title ? <p className="alert-title">{title}</p> : null}
        {children ? <div className="alert-text">{children}</div> : null}
        {action ? <div className="alert-action">{action}</div> : null}
      </div>
      {onDismiss ? (
        <button type="button" className="alert-dismiss" onClick={onDismiss} aria-label="Dismiss">
          <Icon name="close" size={16} />
        </button>
      ) : null}
    </div>
  );
}
