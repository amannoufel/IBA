import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'
import type { Database } from './app/types/supabase'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient<Database>({ req, res })

  try {
    // Get current path and early-allow public routes without touching auth
    const path = req.nextUrl.pathname
    const publicPaths = ['/', '/auth/callback']
    if (publicPaths.includes(path)) {
      return res
    }

    // For protected routes, refresh session if available
    const { data: { session } } = await supabase.auth.getSession()

    // No session, redirect to login
    if (!session) {
      const redirectUrl = new URL('/', req.url)
      redirectUrl.searchParams.set('error', 'Please sign in to access this page')
      return NextResponse.redirect(redirectUrl)
    }

    // Get user role from session
    const role = session.user?.user_metadata?.role?.toLowerCase()
    if (!role) {
      const redirectUrl = new URL('/', req.url)
      redirectUrl.searchParams.set('error', 'No role assigned to user')
      return NextResponse.redirect(redirectUrl)
    }

    // Role-specific path guard
    const requestedPath = path.split('/')[1]
    if (requestedPath && ['tenant', 'worker', 'supervisor'].includes(requestedPath)) {
      if (requestedPath !== role) {
        return NextResponse.redirect(new URL(`/${role}`, req.url))
      }
    }

    return res
  } catch (_error) {
    const redirectUrl = new URL('/', req.url)
    redirectUrl.searchParams.set('error', 'An error occurred during authentication')
    return NextResponse.redirect(redirectUrl)
  }
}

export const config = {
  matcher: [
    '/',
    '/tenant/:path*',
    '/worker/:path*',
    '/supervisor/:path*',
    '/auth/callback'
  ]
}