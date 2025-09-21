import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (code) {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Exchange the code for a session
    await supabase.auth.exchangeCodeForSession(code)
    
    // Get the session to check the user's role
    const { data: { session } } = await supabase.auth.getSession()
    
    if (session?.user?.user_metadata?.role) {
      const role = session.user.user_metadata.role.toLowerCase()
      // Redirect to the role-specific dashboard
      return NextResponse.redirect(new URL(`/${role}`, request.url))
    }
  }

  // If something goes wrong, redirect to the login page
  return NextResponse.redirect(new URL('/?error=Could not authenticate user', request.url))
}