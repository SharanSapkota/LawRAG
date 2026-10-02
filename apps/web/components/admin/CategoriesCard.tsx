"use client";

import { useId, useMemo, useState, type FormEvent } from "react";
import type { LawCategoryData, LawDocumentListItem } from "../../lib/types";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { EmptyState } from "../ui/EmptyState";
import { Icon } from "../ui/Icon";

interface CategoriesCardProps {
  categories: LawCategoryData[];
  documents: LawDocumentListItem[];
  onCreate: (name: string, parentId?: string) => Promise<string | null>;
}

interface CategoryNode {
  category: LawCategoryData;
  depth: number;
}

/** Flattens the parent/child relationship into display order with depth. */
function flattenTree(categories: LawCategoryData[]): CategoryNode[] {
  const ids = new Set(categories.map((c) => c.id));
  const childrenOf = new Map<string | null, LawCategoryData[]>();
  for (const cat of categories) {
    // Orphans (parent missing from the list) are shown at the top level.
    const parent = cat.parentId && ids.has(cat.parentId) ? cat.parentId : null;
    childrenOf.set(parent, [...(childrenOf.get(parent) ?? []), cat]);
  }

  const result: CategoryNode[] = [];
  const visit = (parentId: string | null, depth: number) => {
    const children = (childrenOf.get(parentId) ?? []).sort((a, b) => a.name.localeCompare(b.name));
    for (const child of children) {
      result.push({ category: child, depth });
      if (depth < 6) visit(child.id, depth + 1);
    }
  };
  visit(null, 0);
  return result;
}

export function CategoriesCard({ categories, documents, onCreate }: CategoriesCardProps) {
  const id = useId();
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tree = useMemo(() => flattenTree(categories), [categories]);
  const documentCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const doc of documents) {
      if (doc.category) counts.set(doc.category.id, (counts.get(doc.category.id) ?? 0) + 1);
    }
    return counts;
  }, [documents]);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) return;

    setIsCreating(true);
    setError(null);
    const createError = await onCreate(trimmed, parentId || undefined);
    setIsCreating(false);

    if (createError) {
      setError(createError);
      return;
    }
    setName("");
    setParentId("");
  };

  return (
    <section className="card" aria-labelledby={`${id}-heading`}>
      <div className="card-header">
        <div>
          <h2 id={`${id}-heading`} className="card-title">
            Categories
          </h2>
          <p className="card-description">Organise documents by area of law.</p>
        </div>
      </div>

      <form className="form-stack" onSubmit={handleSubmit}>
        <div className="field">
          <label htmlFor={`${id}-name`} className="field-label">
            Name
          </label>
          <input
            id={`${id}-name`}
            type="text"
            className="input"
            placeholder="e.g. Corporate law"
            value={name}
            onChange={(event) => setName(event.target.value)}
            disabled={isCreating}
            required
          />
        </div>
        <div className="field">
          <label htmlFor={`${id}-parent`} className="field-label">
            Parent <span className="field-optional">optional</span>
          </label>
          <select
            id={`${id}-parent`}
            className="input"
            value={parentId}
            onChange={(event) => setParentId(event.target.value)}
            disabled={isCreating}
          >
            <option value="">None (top level)</option>
            {tree.map(({ category, depth }) => (
              <option key={category.id} value={category.id}>
                {`${"  ".repeat(depth)}${category.name}`}
              </option>
            ))}
          </select>
        </div>
        {error ? <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert> : null}
        <Button
          type="submit"
          loading={isCreating}
          disabled={!name.trim()}
          icon={<Icon name="plus" size={16} />}
          className="btn-block"
        >
          Add category
        </Button>
      </form>

      <div className="card-divider" />

      {tree.length === 0 ? (
        <EmptyState
          icon="folder"
          title="No categories yet"
          description="You'll need at least one before uploading documents."
          compact
        />
      ) : (
        <ul className="category-list">
          {tree.map(({ category, depth }) => {
            const count = documentCounts.get(category.id) ?? 0;
            return (
              <li key={category.id} style={{ paddingLeft: `${depth * 18}px` }}>
                <Icon name="folder" size={15} />
                <span className="category-name">{category.name}</span>
                <span className="category-count" aria-label={`${count} documents`}>
                  {count}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
