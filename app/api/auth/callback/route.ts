import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

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
    
    // Get the session to check the user's role (refresh session to ensure latest metadata)
    const { data: { session }, error: sessionError } = await supabase.auth.getSession()
    if (!sessionError) {
      await supabase.auth.refreshSession()
    }
    
    if (sessionError || !session?.user) {
      console.error('Session error:', sessionError)
      return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))
    }

  // Re-read the session after refresh to pick up metadata
  const { data: { session: fresh } } = await supabase.auth.getSession()
  const { user } = fresh ?? session
    const role = user.user_metadata?.role?.toLowerCase()
    
    if (!role) {
      console.error('No role found in user metadata')
      return NextResponse.redirect(new URL('/?error=User role not found', request.url))
    }

    // Upsert the user profile with tenant fields when available
    try {
      const now = new Date().toISOString()
      type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
      const payload: ProfileUpdate = {
        id: user.id,
        email: user.email ?? '',
        role: user.user_metadata.role,
        updated_at: now,
      }
      if (Object.prototype.hasOwnProperty.call(user.user_metadata ?? {}, 'mobile')) {
        payload.mobile = (user.user_metadata as Record<string, unknown>).mobile as string | null
      }
      if (Object.prototype.hasOwnProperty.call(user.user_metadata ?? {}, 'name')) {
        payload.name = (user.user_metadata as Record<string, unknown>).name as string | null
      }
      if (Object.prototype.hasOwnProperty.call(user.user_metadata ?? {}, 'building_name')) {
        payload.building_name = (user.user_metadata as Record<string, unknown>).building_name as string | null
      }
      if (Object.prototype.hasOwnProperty.call(user.user_metadata ?? {}, 'room_number')) {
        payload.room_number = (user.user_metadata as Record<string, unknown>).room_number as string | null
      }

      // Try update first; if no row, insert
      const { data: existing } = await supabase
        .from('profiles')
        .select('id')
        .eq('id', user.id)
        .maybeSingle()

      if (existing?.id) {
        const { error: updateErr } = await supabase
          .from('profiles')
          .update(payload)
          .eq('id', user.id)
        if (updateErr) throw updateErr
      } else {
        const { error: insertErr } = await supabase
          .from('profiles')
          .insert([{ ...payload, created_at: now }])
        if (insertErr) throw insertErr
      }
    } catch (error) {
      console.error('Failed to upsert profile:', error)
      return NextResponse.redirect(new URL('/?error=Failed to create user profile', request.url))
    }

    // Redirect to the role-specific dashboard
    return NextResponse.redirect(new URL(`/${role}`, request.url))
  } catch (error) {
    console.error('Callback error:', error)
    return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))
  }
}