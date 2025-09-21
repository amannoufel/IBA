import { createMiddlewareClient } from '@supabase/auth-helpers-nextjs'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(req: NextRequest) {
  const res = NextResponse.next()
  const supabase = createMiddlewareClient({ req, res })

  try {
    // Refresh session if it exists
    const { data: { session }, error } = await supabase.auth.getSession()
    if (error) {
      console.error('Middleware session error:', error)
    }

    // Get current path
    const path = req.nextUrl.pathname

    // Allow these paths regardless of auth status
    if (path === '/' || path === '/auth/callback') {
      return res
    }

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

    // Get the requested path section
    const requestedPath = path.split('/')[1]

    // If trying to access a role-specific path
    if (requestedPath && ['tenant', 'worker', 'supervisor'].includes(requestedPath)) {
      // Redirect if trying to access wrong role's path
      if (requestedPath !== role) {
        return NextResponse.redirect(new URL(`/${role}`, req.url))
      }
    }

    // Allow the request to proceed
    return res
  } catch (error) {
    console.error('Middleware error:', error)
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