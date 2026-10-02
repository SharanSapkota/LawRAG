import type { ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

interface EmptyStateProps {
  icon: IconName;
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
}

export function EmptyState({ icon, title, description, action, compact = false }: EmptyStateProps) {
  return (
    <div className={`empty-state${compact ? " empty-state-compact" : ""}`}>
      <span className="empty-state-icon">
        <Icon name={icon} size={compact ? 18 : 22} />
      </span>
      <p className="empty-state-title">{title}</p>
      {description ? <p className="empty-state-description">{description}</p> : null}
      {action ? <div className="empty-state-action">{action}</div> : null}
    </div>
  );
}
