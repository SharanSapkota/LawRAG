"use client";

import { useId, useRef, useState, type DragEvent, type FormEvent } from "react";
import type { LawCategoryData } from "../../lib/types";
import { MAX_DOCUMENT_BYTES } from "../../lib/constants";
import { formatBytes } from "../../lib/format";
import { Alert } from "../ui/Alert";
import { Button } from "../ui/Button";
import { Icon } from "../ui/Icon";

interface UploadCardProps {
  categories: LawCategoryData[];
  onUpload: (input: { categoryId: string; title?: string; file: File }) => Promise<string | null>;
}

function validateFile(file: File): string | null {
  const isPdf = file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
  if (!isPdf) return "Only PDF files are supported.";
  if (file.size > MAX_DOCUMENT_BYTES) {
    return `This file is ${formatBytes(file.size)}. The maximum size is ${formatBytes(MAX_DOCUMENT_BYTES)}.`;
  }
  return null;
}

export function UploadCard({ categories, onUpload }: UploadCardProps) {
  const id = useId();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [categoryId, setCategoryId] = useState("");
  const [title, setTitle] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const hasCategories = categories.length > 0;

  const selectFile = (next: File | null) => {
    setError(null);
    if (!next) {
      setFile(null);
      return;
    }
    const validationError = validateFile(next);
    if (validationError) {
      setError(validationError);
      setFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }
    setFile(next);
  };

  const clearFile = () => {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleDrop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setIsDragging(false);
    selectFile(event.dataTransfer.files?.[0] ?? null);
  };

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!categoryId || !file) return;

    setIsUploading(true);
    setError(null);
    const uploadError = await onUpload({ categoryId, title: title.trim() || undefined, file });
    setIsUploading(false);

    if (uploadError) {
      setError(uploadError);
      return;
    }
    setTitle("");
    clearFile();
  };

  return (
    <section className="card" aria-labelledby={`${id}-heading`}>
      <div className="card-header">
        <div>
          <h2 id={`${id}-heading`} className="card-title">
            Upload a document
          </h2>
          <p className="card-description">Add a PDF to the library as a draft.</p>
        </div>
      </div>

      <form className="form-stack" onSubmit={handleSubmit} noValidate>
        <label
          className={`dropzone${isDragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={handleDrop}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept="application/pdf,.pdf"
            className="sr-only"
            onChange={(event) => selectFile(event.target.files?.[0] ?? null)}
            disabled={isUploading}
          />
          {file ? (
            <span className="dropzone-file">
              <span className="document-icon" aria-hidden="true">
                <Icon name="document" size={18} />
              </span>
              <span className="dropzone-file-text">
                <span className="dropzone-file-name">{file.name}</span>
                <span className="dropzone-file-size">{formatBytes(file.size)} · Click to replace</span>
              </span>
            </span>
          ) : (
            <>
              <span className="dropzone-icon" aria-hidden="true">
                <Icon name="upload" size={20} />
              </span>
              <span className="dropzone-title">
                <span className="link-text">Choose a PDF</span> or drag it here
              </span>
              <span className="dropzone-hint">PDF only · up to {formatBytes(MAX_DOCUMENT_BYTES)}</span>
            </>
          )}
        </label>
        {file && !isUploading ? (
          <button type="button" className="text-button" onClick={clearFile}>
            Remove file
          </button>
        ) : null}

        <div className="field">
          <label htmlFor={`${id}-category`} className="field-label">
            Category <span className="required" aria-hidden="true">*</span>
          </label>
          <select
            id={`${id}-category`}
            className="input"
            value={categoryId}
            onChange={(event) => setCategoryId(event.target.value)}
            disabled={!hasCategories || isUploading}
            required
            aria-describedby={hasCategories ? undefined : `${id}-category-hint`}
          >
            <option value="">{hasCategories ? "Select a category" : "No categories yet"}</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          {hasCategories ? null : (
            <p id={`${id}-category-hint`} className="field-hint">
              Create a category below before uploading.
            </p>
          )}
        </div>

        <div className="field">
          <label htmlFor={`${id}-title`} className="field-label">
            Title <span className="field-optional">optional</span>
          </label>
          <input
            id={`${id}-title`}
            type="text"
            className="input"
            placeholder="e.g. Companies Act, 2063"
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            disabled={isUploading}
            aria-describedby={`${id}-title-hint`}
          />
          <p id={`${id}-title-hint`} className="field-hint">
            Defaults to the file name.
          </p>
        </div>

        {error ? <Alert tone="error" onDismiss={() => setError(null)}>{error}</Alert> : null}

        <Button
          type="submit"
          variant="primary"
          loading={isUploading}
          disabled={!categoryId || !file}
          icon={<Icon name="upload" size={16} />}
          className="btn-block"
        >
          {isUploading ? "Uploading…" : "Upload document"}
        </Button>
      </form>
    </section>
  );
}
