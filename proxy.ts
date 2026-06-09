import { NextResponse, type NextRequest } from 'next/server'
import { SESSION_COOKIE, verifySession } from '@/lib/session'

const HUB_LOGIN = 'https://clubf1.tech/login'

// Mission Control is fully gated. Unauthenticated users go to the hub's single
// login screen (per-tool 'mc' access is then enforced in the page/actions).
// The intake + clickup webhooks are excluded (they carry their own secret).
export async function proxy(req: NextRequest) {
  const user = await verifySession(req.cookies.get(SESSION_COOKIE)?.value)
  if (user) return NextResponse.next()

  const login = new URL(HUB_LOGIN)
  login.searchParams.set('next', req.nextUrl.href)
  return NextResponse.redirect(login)
}

export const config = {
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|svg|ico|webp|gif)$).*)'],
}
