import { memo, useState } from "react";
import type { RetrievedSourceData } from "../lib/types";
import { Icon } from "./ui/Icon";

const COLLAPSED_COUNT = 4;

export function sourceElementId(messageId: string, index: number): string {
  return `source-${messageId}-${index}`;
}

interface SourceListProps {
  messageId: string;
  sources: RetrievedSourceData[];
  highlightedIndex: number | null;
}

export const SourceList = memo(function SourceList({
  messageId,
  sources,
  highlightedIndex,
}: SourceListProps) {
  const [expanded, setExpanded] = useState(false);

  if (sources.length === 0) {
    return (
      <div className="sources sources-empty">
        <Icon name="info" size={15} />
        <span>No matching passages were found in the published library for this question.</span>
      </div>
    );
  }

  const documentCount = new Set(sources.map((s) => s.documentTitle)).size;
  const forceExpanded = highlightedIndex !== null && highlightedIndex >= COLLAPSED_COUNT;
  const visible = expanded || forceExpanded ? sources : sources.slice(0, COLLAPSED_COUNT);
  const hiddenCount = sources.length - visible.length;

  return (
    <section className="sources" aria-label="Retrieved sources">
      <header className="sources-header">
        <Icon name="book" size={15} />
        <span className="sources-heading">Sources</span>
        <span className="sources-meta">
          {sources.length} {sources.length === 1 ? "passage" : "passages"} from {documentCount}{" "}
          {documentCount === 1 ? "document" : "documents"}
        </span>
      </header>
      <ol className="source-list">
        {visible.map((source, index) => (
          <li
            key={index}
            id={sourceElementId(messageId, index)}
            className={`source-item${highlightedIndex === index ? " is-highlighted" : ""}`}
            tabIndex={-1}
          >
            <span className="source-index" aria-hidden="true">
              {index + 1}
            </span>
            <div className="source-text">
              <span className="source-ref">{source.sectionRef ?? "Section not specified"}</span>
              <span className="source-title">{source.documentTitle}</span>
            </div>
          </li>
        ))}
      </ol>
      {hiddenCount > 0 ? (
        <button type="button" className="sources-toggle" onClick={() => setExpanded(true)}>
          Show {hiddenCount} more
          <Icon name="chevronDown" size={14} />
        </button>
      ) : null}
    </section>
  );
});
