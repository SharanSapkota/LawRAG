"use client";

import Link from "next/link";
import { signIn, signOut, useSession } from "next-auth/react";
import type { ChatSessionSummary } from "../lib/types";

const ADMIN_ROLES = new Set(["ADMIN", "SUPER_ADMIN"]);

interface SidebarProps {
  onNewChat: () => void;
  sessions: ChatSessionSummary[];
  activeSessionId: string | null;
  onSelectSession: (id: string) => void;
}

function NewChatIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </svg>
  );
}

export function Sidebar({ onNewChat, sessions, activeSessionId, onSelectSession }: SidebarProps) {
  const { data: session, status } = useSession();

  return (
    <aside className="sidebar">
      <div className="sidebar-brand">Law Firm Platform</div>

      <button type="button" className="new-chat-button" onClick={onNewChat}>
        <NewChatIcon />
        New chat
      </button>

      {session ? (
        <nav className="sidebar-history" aria-label="Chat history">
          {sessions.length === 0 ? (
            <p className="sidebar-history-empty">No past chats yet</p>
          ) : (
            <ul>
              {sessions.map((s) => (
                <li key={s.id}>
                  <button
                    type="button"
                    className={
                      s.id === activeSessionId
                        ? "sidebar-history-item sidebar-history-item-active"
                        : "sidebar-history-item"
                    }
                    onClick={() => onSelectSession(s.id)}
                  >
                    {s.title ?? "New chat"}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </nav>
      ) : null}

      <div className="sidebar-footer">
        {status === "loading" ? null : session ? (
          <div className="sidebar-user">
            {session.user?.image ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={session.user.image} alt="" className="sidebar-avatar" />
            ) : (
              <div className="sidebar-avatar sidebar-avatar-fallback" aria-hidden="true" />
            )}
            <div className="sidebar-user-info">
              <span className="sidebar-user-name">{session.user?.name ?? "Signed in"}</span>
              <div className="sidebar-user-links">
                {session.nestRole && ADMIN_ROLES.has(session.nestRole) ? (
                  <Link href="/admin" className="sidebar-admin-link">
                    Admin
                  </Link>
                ) : null}
                <button type="button" className="sidebar-signout" onClick={() => signOut()}>
                  Sign out
                </button>
              </div>
            </div>
          </div>
        ) : (
          <button type="button" className="sidebar-signin" onClick={() => signIn("google")}>
            Sign in with Google
          </button>
        )}
      </div>
    </aside>
  );
}
