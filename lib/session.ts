// Edge-safe signed session token (HMAC-SHA256 via Web Crypto).
// No next/* imports here so the Edge middleware can verify tokens.

export const SESSION_COOKIE = 'f1_session'
export const SESSION_MAX_AGE = 60 * 60 * 24 * 7 // 7 days

export type SessionUser = { sub: string; email: string; role: string }

const enc = new TextEncoder()
const dec = new TextDecoder()

function bytesToB64url(bytes: Uint8Array): string {
  let bin = ''
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i])
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

function b64urlToBytes(s: string): Uint8Array<ArrayBuffer> {
  s = s.replace(/-/g, '+').replace(/_/g, '/')
  const pad = s.length % 4 ? 4 - (s.length % 4) : 0
  s += '='.repeat(pad)
  const bin = atob(s)
  const out = new Uint8Array(bin.length)
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i)
  return out
}

async function importKey(): Promise<CryptoKey> {
  const secret = process.env.SESSION_SECRET
  if (!secret) throw new Error('SESSION_SECRET is not set')
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign', 'verify'])
}

export async function signSession(user: SessionUser): Promise<string> {
  const payload = { ...user, exp: Math.floor(Date.now() / 1000) + SESSION_MAX_AGE }
  const data = bytesToB64url(enc.encode(JSON.stringify(payload)))
  const key = await importKey()
  const sig = new Uint8Array(await crypto.subtle.sign('HMAC', key, enc.encode(data)))
  return `${data}.${bytesToB64url(sig)}`
}

export async function verifySession(token: string | undefined | null): Promise<SessionUser | null> {
  if (!token) return null
  const [data, sig] = token.split('.')
  if (!data || !sig) return null
  try {
    const key = await importKey()
    const ok = await crypto.subtle.verify('HMAC', key, b64urlToBytes(sig), enc.encode(data))
    if (!ok) return null
    const payload = JSON.parse(dec.decode(b64urlToBytes(data)))
    if (typeof payload.exp === 'number' && payload.exp < Math.floor(Date.now() / 1000)) return null
    if (!payload.sub || !payload.email) return null
    return { sub: payload.sub, email: payload.email, role: payload.role ?? 'member' }
  } catch {
    return null
  }
}
