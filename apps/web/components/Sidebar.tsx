"use client";

import Link from "next/link";
import { memo, useEffect, useMemo, useRef } from "react";
import { signIn, signOut, useSession } from "next-auth/react";
import type { ChatSessionSummary } from "../lib/types";
import { isAdminRole } from "../lib/constants";
import { groupSessionsByDate } from "../lib/format";
import { BrandMark, GoogleGlyph } from "./Brand";
import { Icon } from "./ui/Icon";
import { Skeleton } from "./ui/Skeleton";

interface SidebarProps {
  onNewChat: () => void;
  sessions: ChatSessionSummary[];
  isLoadingSessions: boolean;
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
  /** Mobile drawer state; ignored on desktop where the sidebar is always visible. */
  isOpen: boolean;
  onClose: () => void;
}

function HistorySkeleton() {
  return (
    <div className="sidebar-history-skeleton" aria-hidden="true">
      {[70, 90, 55, 80].map((width, index) => (
        <Skeleton key={index} width={`${width}%`} height={10} />
      ))}
    </div>
  );
}

export const Sidebar = memo(function Sidebar({
  onNewChat,
  sessions,
  isLoadingSessions,
  activeSessionId,
  onSelectSession,
  isOpen,
  onClose,
}: SidebarProps) {
  const { data: session, status } = useSession();
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const groups = useMemo(() => groupSessionsByDate(sessions), [sessions]);

  useEffect(() => {
    if (isOpen) closeButtonRef.current?.focus();
  }, [isOpen]);

  return (
    <>
      <div
        className={`sidebar-backdrop${isOpen ? " is-visible" : ""}`}
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        id="app-sidebar"
        className={`sidebar${isOpen ? " sidebar-open" : ""}`}
        aria-label="Research history"
      >
        <div className="sidebar-top">
          <BrandMark />
          <button
            ref={closeButtonRef}
            type="button"
            className="sidebar-close"
            onClick={onClose}
            aria-label="Close menu"
          >
            <Icon name="close" size={18} />
          </button>
        </div>

        <button type="button" className="new-chat-button" onClick={onNewChat}>
          <Icon name="plus" size={17} />
          New research
        </button>

        <nav className="sidebar-history" aria-label="Previous conversations">
          {status === "loading" || (session && isLoadingSessions && sessions.length === 0) ? (
            <HistorySkeleton />
          ) : !session ? (
            <div className="sidebar-note">
              <p>Your research history will appear here once you sign in.</p>
            </div>
          ) : groups.length === 0 ? (
            <div className="sidebar-note">
              <Icon name="message" size={16} />
              <p>No conversations yet. Questions you ask are saved here automatically.</p>
            </div>
          ) : (
            groups.map((group) => (
              <div key={group.label} className="sidebar-group">
                <h2 className="sidebar-group-label">{group.label}</h2>
                <ul>
                  {group.sessions.map((s) => {
                    const isActive = s.id === activeSessionId;
                    return (
                      <li key={s.id}>
                        <button
                          type="button"
                          className={`sidebar-history-item${isActive ? " is-active" : ""}`}
                          aria-current={isActive ? "page" : undefined}
                          onClick={() => onSelectSession(s.id)}
                          title={s.title ?? "Untitled conversation"}
                        >
                          {s.title ?? "Untitled conversation"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))
          )}
        </nav>

        <div className="sidebar-footer">
          {status === "loading" ? (
            <div className="sidebar-user" aria-hidden="true">
              <Skeleton width={32} height={32} style={{ borderRadius: "50%" }} />
              <Skeleton width="60%" height={10} />
            </div>
          ) : session ? (
            <>
              {isAdminRole(session.nestRole) ? (
                <Link href="/admin" className="sidebar-link">
                  <Icon name="document" size={16} />
                  Document library
                </Link>
              ) : null}
              <div className="sidebar-user">
                {session.user?.image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={session.user.image}
                    alt=""
                    className="avatar"
                    width={32}
                    height={32}
                    referrerPolicy="no-referrer"
                  />
                ) : (
                  <span className="avatar avatar-fallback" aria-hidden="true">
                    {(session.user?.name ?? session.user?.email ?? "?").charAt(0).toUpperCase()}
                  </span>
                )}
                <div className="sidebar-user-info">
                  <span className="sidebar-user-name">{session.user?.name ?? "Signed in"}</span>
                  {session.user?.email ? (
                    <span className="sidebar-user-email">{session.user.email}</span>
                  ) : null}
                </div>
                <button
                  type="button"
                  className="sidebar-icon-button"
                  onClick={() => signOut()}
                  aria-label="Sign out"
                  title="Sign out"
                >
                  <Icon name="logout" size={17} />
                </button>
              </div>
            </>
          ) : (
            <div className="sidebar-signin-card">
              <p>Sign in to ask questions and keep a history of your research.</p>
              <button type="button" className="sidebar-signin" onClick={() => signIn("google")}>
                <GoogleGlyph />
                Continue with Google
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
});
