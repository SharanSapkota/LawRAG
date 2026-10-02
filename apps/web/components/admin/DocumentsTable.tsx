"use client";

import { memo, useMemo, useState, type KeyboardEvent } from "react";
import type { LawDocumentListItem } from "../../lib/types";
import { formatDate } from "../../lib/format";
import { getDocumentStage, STAGE_LABELS, type DocumentStage } from "../../lib/documents";
import { Badge } from "../ui/Badge";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";
import { Skeleton } from "../ui/Skeleton";

export type DocumentAction = "process" | "publish" | "rename";

export interface BusyDocument {
  id: string;
  action: DocumentAction;
}

interface DocumentsTableProps {
  documents: LawDocumentListItem[];
  isLoading: boolean;
  busy: BusyDocument | null;
  onProcess: (doc: LawDocumentListItem) => void;
  onPublish: (doc: LawDocumentListItem) => void;
  onRename: (doc: LawDocumentListItem, title: string) => Promise<boolean>;
}

type Filter = "all" | DocumentStage;

const FILTERS: { value: Filter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "unprocessed", label: "Needs processing" },
  { value: "ready", label: "Ready" },
  { value: "published", label: "Published" },
];

const STAGE_TONES = {
  unprocessed: "warning",
  ready: "info",
  published: "success",
} as const;

function TableSkeleton() {
  return (
    <div className="table-skeleton" aria-busy="true" aria-label="Loading documents">
      {Array.from({ length: 4 }, (_, index) => (
        <div key={index} className="table-skeleton-row">
          <Skeleton width="35%" />
          <Skeleton width="15%" />
          <Skeleton width="12%" />
          <Skeleton width="18%" />
        </div>
      ))}
    </div>
  );
}

export const DocumentsTable = memo(function DocumentsTable({
  documents,
  isLoading,
  busy,
  onProcess,
  onPublish,
  onRename,
}: DocumentsTableProps) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const counts = useMemo(() => {
    const result: Record<Filter, number> = { all: documents.length, unprocessed: 0, ready: 0, published: 0 };
    for (const doc of documents) result[getDocumentStage(doc)] += 1;
    return result;
  }, [documents]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return documents.filter((doc) => {
      if (filter !== "all" && getDocumentStage(doc) !== filter) return false;
      if (!q) return true;
      return [doc.title, doc.fileName ?? "", doc.category?.name ?? ""].some((field) =>
        field.toLowerCase().includes(q),
      );
    });
  }, [documents, query, filter]);

  const startRename = (doc: LawDocumentListItem) => {
    setRenamingId(doc.id);
    setRenameValue(doc.title);
  };

  const cancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
  };

  const submitRename = async (doc: LawDocumentListItem) => {
    const title = renameValue.trim();
    if (!title) return;
    if (title === doc.title) {
      cancelRename();
      return;
    }
    if (await onRename(doc, title)) cancelRename();
  };

  const handleRenameKeyDown = (event: KeyboardEvent<HTMLInputElement>, doc: LawDocumentListItem) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void submitRename(doc);
    } else if (event.key === "Escape") {
      cancelRename();
    }
  };

  return (
    <section className="card documents-card" aria-labelledby="documents-heading">
      <div className="card-header">
        <div>
          <h2 id="documents-heading" className="card-title">
            Documents
          </h2>
          <p className="card-description">
            Only published documents are searched when answering questions.
          </p>
        </div>
      </div>

      <div className="table-toolbar">
        <div className="search-field">
          <Icon name="search" size={16} />
          <label htmlFor="document-search" className="sr-only">
            Search documents
          </label>
          <input
            id="document-search"
            type="search"
            className="input"
            placeholder="Search by title, file or category"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="segmented" role="group" aria-label="Filter by status">
          {FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              className={filter === option.value ? "is-active" : undefined}
              aria-pressed={filter === option.value}
              onClick={() => setFilter(option.value)}
            >
              {option.label}
              <span className="segmented-count">{counts[option.value]}</span>
            </button>
          ))}
        </div>
      </div>

      {isLoading && documents.length === 0 ? (
        <TableSkeleton />
      ) : documents.length === 0 ? (
        <EmptyState
          icon="document"
          title="No documents yet"
          description="Upload a PDF of an act or regulation to start building the research library."
        />
      ) : visible.length === 0 ? (
        <EmptyState
          icon="search"
          title="No matching documents"
          description="Try a different search term or status filter."
          action={
            <Button
              size="sm"
              onClick={() => {
                setQuery("");
                setFilter("all");
              }}
            >
              Clear filters
            </Button>
          }
          compact
        />
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th scope="col">Document</th>
                <th scope="col">Category</th>
                <th scope="col">Status</th>
                <th scope="col" className="actions-col">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {visible.map((doc) => {
                const stage = getDocumentStage(doc);
                const rowBusy = busy?.id === doc.id ? busy.action : null;
                const isRenaming = renamingId === doc.id;

                return (
                  <tr key={doc.id} className={rowBusy ? "is-busy" : undefined}>
                    <td data-label="Document" className="document-cell">
                      {isRenaming ? (
                        <div className="rename-row">
                          <label htmlFor={`rename-${doc.id}`} className="sr-only">
                            New title for {doc.title}
                          </label>
                          <input
                            id={`rename-${doc.id}`}
                            type="text"
                            className="input input-sm"
                            value={renameValue}
                            onChange={(event) => setRenameValue(event.target.value)}
                            onKeyDown={(event) => handleRenameKeyDown(event, doc)}
                            autoFocus
                          />
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => void submitRename(doc)}
                            loading={rowBusy === "rename"}
                            disabled={!renameValue.trim()}
                          >
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" onClick={cancelRename} disabled={rowBusy === "rename"}>
                            Cancel
                          </Button>
                        </div>
                      ) : (
                        <div className="document-name">
                          <span className="document-icon" aria-hidden="true">
                            <Icon name="document" size={16} />
                          </span>
                          <div className="document-text">
                            <span className="document-title">{doc.title}</span>
                            <span className="document-sub">
                              {doc.fileName ? <span className="document-file">{doc.fileName}</span> : null}
                              <span>Uploaded {formatDate(doc.createdAt)}</span>
                            </span>
                          </div>
                        </div>
                      )}
                    </td>
                    <td data-label="Category">{doc.category?.name ?? <span className="muted">Uncategorised</span>}</td>
                    <td data-label="Status">
                      <div className="status-cell">
                        <Badge tone={STAGE_TONES[stage]}>{STAGE_LABELS[stage]}</Badge>
                        {doc.chunkCount > 0 ? (
                          <span className="status-sub">{doc.chunkCount.toLocaleString()} passages</span>
                        ) : null}
                      </div>
                    </td>
                    <td className="actions-cell">
                      <div className="row-actions">
                        {stage === "unprocessed" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onProcess(doc)}
                            loading={rowBusy === "process"}
                            disabled={Boolean(rowBusy)}
                          >
                            {rowBusy === "process" ? "Processing…" : "Process"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => onProcess(doc)}
                            loading={rowBusy === "process"}
                            disabled={Boolean(rowBusy)}
                            title="Re-extract and re-index this document"
                          >
                            {rowBusy === "process" ? "Processing…" : "Reprocess"}
                          </Button>
                        )}
                        {stage === "ready" ? (
                          <Button
                            size="sm"
                            variant="primary"
                            onClick={() => onPublish(doc)}
                            loading={rowBusy === "publish"}
                            disabled={Boolean(rowBusy)}
                          >
                            Publish
                          </Button>
                        ) : null}
                        <Button
                          size="sm"
                          variant="ghost"
                          iconOnly
                          icon={<Icon name="edit" size={15} />}
                          onClick={() => startRename(doc)}
                          disabled={Boolean(rowBusy) || isRenaming}
                          aria-label={`Rename ${doc.title}`}
                          title="Rename"
                        />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
});
