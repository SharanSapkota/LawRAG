"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ApiError,
  createCategory,
  listCategories,
  listDocuments,
  processDocument,
  publishDocument,
  renameDocument,
  uploadDocument,
} from "../../lib/api";
import type { LawCategoryData, LawDocumentListItem } from "../../lib/types";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

export default function AdminPage() {
  const { data: authSession, status } = useSession();
  const token = authSession?.nestAccessToken;
  // Client-side check is UX only — the real enforcement is RolesGuard on
  // the API. A non-admin who forces this page open still gets 403s on
  // every request below.
  const isAdmin = Boolean(authSession?.nestRole && ADMIN_ROLES.has(authSession.nestRole));

  const [categories, setCategories] = useState<LawCategoryData[]>([]);
  const [documents, setDocuments] = useState<LawDocumentListItem[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [newCategoryName, setNewCategoryName] = useState("");
  const [newCategoryParentId, setNewCategoryParentId] = useState("");
  const [categoryActionError, setCategoryActionError] = useState<string | null>(null);
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);

  const [uploadCategoryId, setUploadCategoryId] = useState("");
  const [uploadTitle, setUploadTitle] = useState("");
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const [busyDocumentId, setBusyDocumentId] = useState<string | null>(null);
  const [documentActionError, setDocumentActionError] = useState<string | null>(null);
  const [renamingDocumentId, setRenamingDocumentId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const refresh = useCallback(async () => {
    if (!token) return;
    setLoadError(null);
    try {
      const [cats, docs] = await Promise.all([listCategories(), listDocuments(token)]);
      setCategories(cats);
      setDocuments(docs);
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "Failed to load admin data.");
    }
  }, [token]);

  useEffect(() => {
    if (isAdmin && token) void refresh();
  }, [isAdmin, token, refresh]);

  const handleCreateCategory = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !newCategoryName.trim()) return;

    setIsCreatingCategory(true);
    setCategoryActionError(null);
    try {
      await createCategory(newCategoryName.trim(), token, newCategoryParentId || undefined);
      setNewCategoryName("");
      setNewCategoryParentId("");
      await refresh();
    } catch (err) {
      setCategoryActionError(err instanceof Error ? err.message : "Failed to create category.");
    } finally {
      setIsCreatingCategory(false);
    }
  };

  const handleUpload = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!token || !uploadCategoryId || !uploadFile) return;

    setIsUploading(true);
    setUploadError(null);
    try {
      await uploadDocument(
        { categoryId: uploadCategoryId, title: uploadTitle || undefined, file: uploadFile },
        token,
      );
      setUploadTitle("");
      setUploadFile(null);
      await refresh();
    } catch (err) {
      setUploadError(
        err instanceof ApiError ? err.message : "Failed to upload document.",
      );
    } finally {
      setIsUploading(false);
    }
  };

  const handleProcess = async (id: string) => {
    if (!token) return;
    setBusyDocumentId(id);
    setDocumentActionError(null);
    try {
      await processDocument(id, token);
      await refresh();
    } catch (err) {
      setDocumentActionError(err instanceof Error ? err.message : "Failed to process document.");
    } finally {
      setBusyDocumentId(null);
    }
  };

  const startRename = (doc: LawDocumentListItem) => {
    setRenamingDocumentId(doc.id);
    setRenameValue(doc.title);
    setDocumentActionError(null);
  };

  const cancelRename = () => {
    setRenamingDocumentId(null);
    setRenameValue("");
  };

  const handleRename = async (id: string) => {
    if (!token || !renameValue.trim()) return;
    setBusyDocumentId(id);
    setDocumentActionError(null);
    try {
      await renameDocument(id, renameValue.trim(), token);
      setRenamingDocumentId(null);
      setRenameValue("");
      await refresh();
    } catch (err) {
      setDocumentActionError(err instanceof Error ? err.message : "Failed to rename document.");
    } finally {
      setBusyDocumentId(null);
    }
  };

  const handlePublish = async (id: string) => {
    if (!token) return;
    setBusyDocumentId(id);
    setDocumentActionError(null);
    try {
      await publishDocument(id, token);
      await refresh();
    } catch (err) {
      setDocumentActionError(err instanceof Error ? err.message : "Failed to publish document.");
    } finally {
      setBusyDocumentId(null);
    }
  };

  if (status === "loading") {
    return (
      <main className="admin-shell">
        <p>Loading…</p>
      </main>
    );
  }

  if (!authSession) {
    return (
      <main className="admin-shell">
        <p>Sign in to access the admin panel.</p>
        <Link href="/">Back to chat</Link>
      </main>
    );
  }

  if (!isAdmin) {
    return (
      <main className="admin-shell">
        <p>Your account doesn&apos;t have admin access.</p>
        <p className="admin-hint">
          If your role was just changed, sign out and back in — the role is baked into your
          session token at sign-in time and isn&apos;t re-checked live.
        </p>
        <Link href="/">Back to chat</Link>
      </main>
    );
  }

  return (
    <main className="admin-shell">
      <div className="admin-header">
        <h1>Admin — Law Documents</h1>
        <Link href="/">Back to chat</Link>
      </div>

      {loadError ? <div className="banner banner-error">{loadError}</div> : null}

      <section className="admin-section">
        <h2>Categories</h2>
        <form className="admin-form" onSubmit={handleCreateCategory}>
          <input
            type="text"
            placeholder="Category name (e.g. Companies Act)"
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            required
          />
          <select
            value={newCategoryParentId}
            onChange={(e) => setNewCategoryParentId(e.target.value)}
          >
            <option value="">No parent (top-level)</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <button type="submit" disabled={isCreatingCategory || !newCategoryName.trim()}>
            {isCreatingCategory ? "Creating…" : "Create category"}
          </button>
        </form>
        {categoryActionError ? (
          <div className="banner banner-error">{categoryActionError}</div>
        ) : null}

        {categories.length === 0 ? (
          <p className="admin-hint">No categories yet — create one above before uploading.</p>
        ) : (
          <ul className="admin-list">
            {categories.map((cat) => (
              <li key={cat.id}>{cat.name}</li>
            ))}
          </ul>
        )}
      </section>

      <section className="admin-section">
        <h2>Upload a document</h2>
        <form className="admin-form" onSubmit={handleUpload}>
          <select
            value={uploadCategoryId}
            onChange={(e) => setUploadCategoryId(e.target.value)}
            required
          >
            <option value="">Select a category…</option>
            {categories.map((cat) => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Title (optional, defaults to filename)"
            value={uploadTitle}
            onChange={(e) => setUploadTitle(e.target.value)}
          />
          <input
            type="file"
            accept="application/pdf"
            onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
            required
          />
          <button type="submit" disabled={isUploading || !uploadCategoryId || !uploadFile}>
            {isUploading ? "Uploading…" : "Upload"}
          </button>
        </form>
        <p className="admin-hint">PDF only in v1.</p>
        {uploadError ? <div className="banner banner-error">{uploadError}</div> : null}
      </section>

      <section className="admin-section">
        <h2>Documents</h2>
        {documentActionError ? (
          <div className="banner banner-error">{documentActionError}</div>
        ) : null}
        {documents.length === 0 ? (
          <p className="admin-hint">No documents uploaded yet.</p>
        ) : (
          <table className="admin-table">
            <thead>
              <tr>
                <th>Title</th>
                <th>Category</th>
                <th>Status</th>
                <th>Chunks</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {documents.map((doc) => (
                <tr key={doc.id}>
                  <td>
                    {renamingDocumentId === doc.id ? (
                      <div className="admin-rename-row">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => handleRename(doc.id)}
                          disabled={busyDocumentId === doc.id || !renameValue.trim()}
                        >
                          Save
                        </button>
                        <button type="button" onClick={cancelRename}>
                          Cancel
                        </button>
                      </div>
                    ) : (
                      doc.title
                    )}
                  </td>
                  <td>{doc.category?.name ?? "—"}</td>
                  <td>
                    <span className={`status-badge status-${doc.status.toLowerCase()}`}>
                      {doc.status}
                    </span>
                  </td>
                  <td>{doc.chunkCount}</td>
                  <td className="admin-table-actions">
                    <button type="button" onClick={() => startRename(doc)}>
                      Rename
                    </button>
                    <button
                      type="button"
                      onClick={() => handleProcess(doc.id)}
                      disabled={busyDocumentId === doc.id}
                    >
                      {busyDocumentId === doc.id ? "Working…" : "Process"}
                    </button>
                    <button
                      type="button"
                      onClick={() => handlePublish(doc.id)}
                      disabled={
                        busyDocumentId === doc.id ||
                        doc.status === "PUBLISHED" ||
                        doc.chunkCount === 0
                      }
                    >
                      Publish
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </main>
  );
}
