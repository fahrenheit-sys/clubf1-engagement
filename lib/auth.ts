import { cookies } from 'next/headers'
import { SESSION_COOKIE, SESSION_MAX_AGE, signSession, verifySession, type SessionUser } from './session'
import { adminGetUser, isBanned } from './gotrue'
import { accessFor, TOOL } from './access'

export type { SessionUser } from './session'

export type LiveUser = {
  sub: string
  email: string
  role: string | null
  apps: Record<string, string>
}

export async function getSessionUser(): Promise<SessionUser | null> {
  const store = await cookies()
  return verifySession(store.get(SESSION_COOKIE)?.value)
}

export async function getLiveSessionUser(): Promise<LiveUser | null> {
  const session = await getSessionUser()
  if (!session) return null
  const live = await adminGetUser(session.sub)
  if (!live || isBanned(live)) return null
  return { sub: live.id, email: live.email, role: live.role, apps: live.apps }
}

export async function clearSessionCookie(): Promise<void> {
  const store = await cookies()
  const domain = process.env.SESSION_COOKIE_DOMAIN
  store.delete({ name: SESSION_COOKIE, path: '/', ...(domain ? { domain } : {}) })
}

// Unused signing helper kept for parity (sessions are minted by the hub).
export async function setSessionCookie(user: SessionUser): Promise<void> {
  const token = await signSession(user)
  const store = await cookies()
  const domain = process.env.SESSION_COOKIE_DOMAIN
  store.set(SESSION_COOKIE, token, {
    httpOnly: true, secure: process.env.NODE_ENV === 'production', sameSite: 'lax',
    path: '/', maxAge: SESSION_MAX_AGE, ...(domain ? { domain } : {}),
  })
}

// Guard for MC server actions — live, active, with an 'mc' grant.
export async function requireEngagementAccess(level: 'admin' | 'member' = 'member'): Promise<LiveUser> {
  const user = await getLiveSessionUser()
  if (!user) throw new Error('Not authenticated')
  const role = accessFor(user, TOOL)
  if (!role) throw new Error('No access to the Engagement Monitor')
  if (level === 'admin' && role !== 'admin') throw new Error('Admin access required')
  return user
}
