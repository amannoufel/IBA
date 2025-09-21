import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')

  if (!code) {
    return NextResponse.redirect(new URL('/?error=No authentication code provided', request.url))
  }

  const supabase = createRouteHandlerClient({ cookies })
  
  try {
    // Exchange the code for a session
    await supabase.auth.exchangeCodeForSession(code)
    
    // Get the session to check the user's role
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    
    if (sessionError || !session?.user) {
      console.error('Session error:', sessionError)
      return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))
    }

    const { user } = session
    const role = user.user_metadata?.role?.toLowerCase()
    
    if (!role) {
      console.error('No role found in user metadata')
      return NextResponse.redirect(new URL('/?error=User role not found', request.url))
    }

    // Create the user profile if it doesn't exist
    try {
      const { error: profileError } = await supabase
        .from('profiles')
        .insert([{
          id: user.id,
          email: user.email,
          role: user.user_metadata.role,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
          // Add tenant-specific fields if present in metadata
          ...(user.user_metadata.mobile ? {
            mobile: user.user_metadata.mobile,
            building_name: user.user_metadata.building_name,
            room_number: user.user_metadata.room_number
          } : {})
        }])
        .single()

      if (profileError && profileError.code !== '23505') { // Ignore unique constraint violations
        console.error('Profile creation error:', profileError)
        throw profileError
      }
    } catch (error) {
      console.error('Failed to create profile:', error)
      return NextResponse.redirect(new URL('/?error=Failed to create user profile', request.url))
    }

    // Redirect to the role-specific dashboard
    return NextResponse.redirect(new URL(`/${role}`, request.url))
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))
  }
}