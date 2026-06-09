// Per-tool access model for the Club F1 suite.
// Lives here for now; will move into the shared `clubf1-auth` package.
//
// A user's authorization is stored in Supabase Auth `app_metadata`:
//   { role?: 'owner', apps?: { dashboard: 'admin'|'member', mc: 'admin'|'member', ... } }
//
//   - role: 'owner'  → super-admin of the whole suite (every tool, admin).
//   - apps[tool]     → per-tool grant. Presence = access; value = role in that tool.
//   - (legacy) role: 'admin' is treated as owner during the transition.

export type AppRole = 'admin' | 'member'

// This tool's key. Each app in the suite sets its own (mc → 'mc', etc.).
export const TOOL = 'engagement'

export type AccessUser = { role?: string | null; apps?: Record<string, string> | null }

export function isSuperAdmin(u: AccessUser): boolean {
  return u.role === 'owner' || u.role === 'admin' // 'admin' = legacy owner
}

// Returns the user's role within `tool`, or null if they have no access.
export function accessFor(u: AccessUser, tool: string): AppRole | null {
  if (isSuperAdmin(u)) return 'admin'
  const a = u.apps?.[tool]
  if (a === 'admin' || a === 'member') return a
  if (u.role === 'member') return 'member' // legacy single-role member
  return null
}

export function canAccess(u: AccessUser, tool: string): boolean {
  return accessFor(u, tool) !== null
}
