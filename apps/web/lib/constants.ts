export const APP_NAME = "LawRAG";
export const APP_TAGLINE = "Nepali legal research";

// Client-side role check is UX only — the API's RolesGuard is the real
// enforcement point.
export const ADMIN_ROLES: ReadonlySet<string> = new Set(["ADMIN", "SUPER_ADMIN"]);

export function isAdminRole(role: string | undefined): boolean {
  return Boolean(role && ADMIN_ROLES.has(role));
}

// Mirrors MAX_DOCUMENT_BYTES in apps/api's DocumentsController, so an
// oversized file is rejected before it's sent rather than after.
export const MAX_DOCUMENT_BYTES = 50 * 1024 * 1024;
