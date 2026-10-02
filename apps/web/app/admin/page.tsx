"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import {
  createCategory,
  listCategories,
  listDocuments,
  processDocument,
  publishDocument,
  renameDocument,
  uploadDocument,
} from "../../lib/api";
import type { LawCategoryData, LawDocumentListItem } from "../../lib/types";
import { isAdminRole } from "../../lib/constants";
import { getDocumentStage } from "../../lib/documents";
import { getErrorMessage } from "../../lib/format";
import { BrandMark, GoogleGlyph } from "../../components/Brand";
import { DocumentsTable, type BusyDocument } from "../../components/admin/DocumentsTable";
import { UploadCard } from "../../components/admin/UploadCard";
import { CategoriesCard } from "../../components/admin/CategoriesCard";
import { Alert } from "../../components/ui/Alert";
import { Button } from "../../components/ui/Button";
import { EmptyState } from "../../components/ui/EmptyState";
import { Icon } from "../../components/ui/Icon";
import { Spinner } from "../../components/ui/Spinner";
import { ToastProvider, useToast } from "../../components/ui/Toast";

function AdminTopbar() {
  return (
    <header className="admin-topbar">
      <div className="admin-topbar-inner">
        <Link href="/" className="admin-brand-link" aria-label="Back to research">
          <BrandMark compact />
        </Link>
        <span className="admin-topbar-divider" aria-hidden="true" />
        <span className="admin-topbar-section">Document library</span>
        <Link href="/" className="btn btn-ghost btn-sm admin-back-link">
          <Icon name="arrowLeft" size={15} />
          <span>Back to research</span>
        </Link>
      </div>
    </header>
  );
}

function PageState({ children }: { children: ReactNode }) {
  return (
    <div className="admin-page">
      <AdminTopbar />
      <main className="page-state">
        <div className="card page-state-card">{children}</div>
      </main>
    </div>
  );
}

const WORKFLOW_STEPS = [
  { title: "Upload", text: "Add a PDF to the library as a draft." },
  { title: "Process", text: "Extract the text and index it into searchable passages." },
  { title: "Publish", text: "Make it available to the research assistant." },
];

function AdminDashboard({ token }: { token: string }) {
  const toast = useToast();

  const [categories, setCategories] = useState<LawCategoryData[]>([]);
  const [documents, setDocuments] = useState<LawDocumentListItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busy, setBusy] = useState<BusyDocument | null>(null);
  const [documentActionError, setDocumentActionError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoadError(null);
    try {
      const [cats, docs] = await Promise.all([listCategories(), listDocuments(token)]);
      setCategories(cats);
      setDocuments(docs);
    } catch (err) {
      setLoadError(getErrorMessage(err, "Failed to load the document library."));
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const stats = useMemo(() => {
    const result = { total: documents.length, published: 0, ready: 0, unprocessed: 0, passages: 0 };
    for (const doc of documents) {
      result[getDocumentStage(doc)] += 1;
      if (doc.status === "PUBLISHED") result.passages += doc.chunkCount;
    }
    return result;
  }, [documents]);

  const handleCreateCategory = useCallback(
    async (name: string, parentId?: string): Promise<string | null> => {
      try {
        await createCategory(name, token, parentId);
        toast(`Category “${name}” created`);
        await refresh();
        return null;
      } catch (err) {
        return getErrorMessage(err, "Failed to create the category.");
      }
    },
    [token, toast, refresh],
  );

  const handleUpload = useCallback(
    async (input: { categoryId: string; title?: string; file: File }): Promise<string | null> => {
      try {
        const doc = await uploadDocument(input, token);
        toast(`“${doc.title}” uploaded. Process it next to make it searchable.`);
        await refresh();
        return null;
      } catch (err) {
        return getErrorMessage(err, "Failed to upload the document.");
      }
    },
    [token, toast, refresh],
  );

  const handleProcess = useCallback(
    async (doc: LawDocumentListItem) => {
      setBusy({ id: doc.id, action: "process" });
      setDocumentActionError(null);
      try {
        const { chunkCount } = await processDocument(doc.id, token);
        toast(`“${doc.title}” processed into ${chunkCount.toLocaleString()} passages`);
        await refresh();
      } catch (err) {
        setDocumentActionError(getErrorMessage(err, `Failed to process “${doc.title}”.`));
      } finally {
        setBusy(null);
      }
    },
    [token, toast, refresh],
  );

  const handlePublish = useCallback(
    async (doc: LawDocumentListItem) => {
      setBusy({ id: doc.id, action: "publish" });
      setDocumentActionError(null);
      try {
        await publishDocument(doc.id, token);
        toast(`“${doc.title}” is now live in research`);
        await refresh();
      } catch (err) {
        setDocumentActionError(getErrorMessage(err, `Failed to publish “${doc.title}”.`));
      } finally {
        setBusy(null);
      }
    },
    [token, toast, refresh],
  );

  const handleRename = useCallback(
    async (doc: LawDocumentListItem, title: string): Promise<boolean> => {
      setBusy({ id: doc.id, action: "rename" });
      setDocumentActionError(null);
      try {
        await renameDocument(doc.id, title, token);
        toast("Document renamed");
        await refresh();
        return true;
      } catch (err) {
        setDocumentActionError(getErrorMessage(err, "Failed to rename the document."));
        return false;
      } finally {
        setBusy(null);
      }
    },
    [token, toast, refresh],
  );

  return (
    <main className="admin-main">
      <div className="page-header">
        <div>
          <h1 className="page-title">Document library</h1>
          <p className="page-description">
            Manage the statutes and legal documents the research assistant draws on.
          </p>
        </div>
      </div>

      {loadError ? (
        <Alert
          tone="error"
          title="Couldn't load the library"
          action={
            <Button size="sm" icon={<Icon name="refresh" size={14} />} onClick={() => void refresh()}>
              Retry
            </Button>
          }
        >
          {loadError}
        </Alert>
      ) : null}

      <dl className="stat-grid">
        <div className="stat">
          <dt>Documents</dt>
          <dd>{isLoading ? "–" : stats.total}</dd>
        </div>
        <div className="stat">
          <dt>Published</dt>
          <dd>{isLoading ? "–" : stats.published}</dd>
          <span className="stat-sub">{stats.passages.toLocaleString()} searchable passages</span>
        </div>
        <div className="stat">
          <dt>Ready to publish</dt>
          <dd>{isLoading ? "–" : stats.ready}</dd>
        </div>
        <div className={`stat${stats.unprocessed > 0 ? " stat-attention" : ""}`}>
          <dt>Needs processing</dt>
          <dd>{isLoading ? "–" : stats.unprocessed}</dd>
        </div>
      </dl>

      <ol className="workflow" aria-label="How documents go live">
        {WORKFLOW_STEPS.map((step, index) => (
          <li key={step.title}>
            <span className="workflow-step">{index + 1}</span>
            <div>
              <p className="workflow-title">{step.title}</p>
              <p className="workflow-text">{step.text}</p>
            </div>
          </li>
        ))}
      </ol>

      <div className="admin-grid">
        <div className="admin-grid-main">
          {documentActionError ? (
            <Alert tone="error" onDismiss={() => setDocumentActionError(null)}>
              {documentActionError}
            </Alert>
          ) : null}
          <DocumentsTable
            documents={documents}
            isLoading={isLoading}
            busy={busy}
            onProcess={handleProcess}
            onPublish={handlePublish}
            onRename={handleRename}
          />
        </div>
        <aside className="admin-grid-side" aria-label="Library tools">
          <div className="admin-upload">
            <UploadCard categories={categories} onUpload={handleUpload} />
          </div>
          <div className="admin-categories">
            <CategoriesCard categories={categories} documents={documents} onCreate={handleCreateCategory} />
          </div>
        </aside>
      </div>
    </main>
  );
}

export default function AdminPage() {
  const { data: authSession, status } = useSession();
  const token = authSession?.nestAccessToken;
  // Client-side check is UX only — the real enforcement is RolesGuard on
  // the API. A non-admin who forces this page open still gets 403s on
  // every request below.
  const isAdmin = isAdminRole(authSession?.nestRole);

  if (status === "loading") {
    return (
      <PageState>
        <div className="page-state-loading">
          <Spinner size={22} label="Loading" />
        </div>
      </PageState>
    );
  }

  if (!authSession) {
    return (
      <PageState>
        <EmptyState
          icon="shield"
          title="Sign in to manage the library"
          description="The document library is available to firm administrators."
          action={
            <div className="button-row">
              <button type="button" className="btn btn-primary btn-md" onClick={() => signIn("google")}>
                <GoogleGlyph />
                Continue with Google
              </button>
              <Link href="/" className="btn btn-ghost btn-md">
                Back to research
              </Link>
            </div>
          }
        />
      </PageState>
    );
  }

  if (!isAdmin || !token) {
    return (
      <PageState>
        <EmptyState
          icon="shield"
          title="You don't have access to this page"
          description={
            <>
              Ask a firm administrator to grant your account admin access. If your role was just
              changed, sign out and back in — roles are applied when you sign in.
            </>
          }
          action={
            <div className="button-row">
              <Link href="/" className="btn btn-primary btn-md">
                Back to research
              </Link>
              <button type="button" className="btn btn-secondary btn-md" onClick={() => signOut()}>
                Sign out
              </button>
            </div>
          }
        />
      </PageState>
    );
  }

  return (
    <ToastProvider>
      <div className="admin-page">
        <AdminTopbar />
        <AdminDashboard token={token} />
      </div>
    </ToastProvider>
  );
}
