// Thin REST client for Supabase Auth (GoTrue). Uses fetch directly to avoid
// the supabase-js realtime/WebSocket initialisation. Server-only.

// .trim() guards against trailing whitespace pasted into env vars.
const URL_ = () => {
  const u = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  if (!u) throw new Error('NEXT_PUBLIC_SUPABASE_URL is not set')
  return u
}
const ANON = () => (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '').trim()
const SERVICE = () => {
  const k = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim()
  if (!k) throw new Error('SUPABASE_SERVICE_ROLE_KEY is not set')
  return k
}

export type AuthUser = {
  id: string
  email: string
  role: string | null // top-level suite role ('owner'); null for ordinary users
  apps: Record<string, string> // per-tool grants, e.g. { dashboard: 'admin' }
  created_at: string
  last_sign_in_at: string | null
  banned_until: string | null
}

function mapUser(u: any): AuthUser {
  const meta = u.app_metadata ?? {}
  return {
    id: u.id,
    email: u.email,
    role: meta.role ?? null,
    apps: (meta.apps && typeof meta.apps === 'object') ? meta.apps : {},
    created_at: u.created_at,
    last_sign_in_at: u.last_sign_in_at ?? null,
    banned_until: u.banned_until ?? null,
  }
}

export function isBanned(u: AuthUser): boolean {
  if (!u.banned_until) return false
  const t = new Date(u.banned_until).getTime()
  return !isNaN(t) && t > Date.now()
}

// ── Auth (anon key) ───────────────────────────────────────
export async function signInWithPassword(email: string, password: string):
  Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const res = await fetch(`${URL_()}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: ANON(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: body.error_description || body.msg || 'Invalid email or password' }
  return { ok: true, user: mapUser(body.user) }
}

// ── Admin (service-role key) ──────────────────────────────
function adminHeaders() {
  const k = SERVICE()
  return { apikey: k, Authorization: `Bearer ${k}`, 'Content-Type': 'application/json' }
}

export async function adminGetUser(id: string): Promise<AuthUser | null> {
  const res = await fetch(`${URL_()}/auth/v1/admin/users/${id}`, { headers: adminHeaders() })
  if (res.status === 404) return null
  if (!res.ok) throw new Error(`Failed to get user: ${res.status}`)
  return mapUser(await res.json())
}

export async function adminListUsers(): Promise<AuthUser[]> {
  const res = await fetch(`${URL_()}/auth/v1/admin/users?per_page=500`, { headers: adminHeaders() })
  if (!res.ok) throw new Error(`Failed to list users: ${res.status}`)
  const body = await res.json()
  return (body.users ?? []).map(mapUser)
}

export async function adminCreateUser(email: string, password: string, appMetadata: Record<string, unknown>):
  Promise<{ ok: true; user: AuthUser } | { ok: false; error: string }> {
  const res = await fetch(`${URL_()}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(),
    body: JSON.stringify({ email, password, email_confirm: true, app_metadata: appMetadata }),
  })
  const body = await res.json().catch(() => ({}))
  if (!res.ok) return { ok: false, error: body.msg || body.error_description || `Failed (${res.status})` }
  return { ok: true, user: mapUser(body) }
}

export async function adminUpdateUser(id: string, patch: Record<string, unknown>):
  Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${URL_()}/auth/v1/admin/users/${id}`, {
    method: 'PUT',
    headers: adminHeaders(),
    body: JSON.stringify(patch),
  })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: body.msg || `Failed (${res.status})` }
  }
  return { ok: true }
}

export async function adminDeleteUser(id: string): Promise<{ ok: true } | { ok: false; error: string }> {
  const res = await fetch(`${URL_()}/auth/v1/admin/users/${id}`, { method: 'DELETE', headers: adminHeaders() })
  if (!res.ok) {
    const body = await res.json().catch(() => ({}))
    return { ok: false, error: body.msg || `Failed (${res.status})` }
  }
  return { ok: true }
}
