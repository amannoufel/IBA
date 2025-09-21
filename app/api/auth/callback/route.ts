import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'import { createRouteHandlerClient } from '@sup          mobile: user.user_metadata.mobile,

import { cookies } from 'next/headers'          building_name: user.user_metadata.building_name,

import { NextResponse } from 'next/server'          room_number: user.user_metadata.room_numberse/auth-helpers-nextjs'

import { cookies } from 'next/headers'

export async function GET(request: Request) {import { NextResponse } from 'next/server'

  const requestUrl = new URL(request.url)

  const code = requestUrl.searchParams.get('code')export async function GET(request: Request) {

  const requestUrl = new URL(request.url)

  if (!code) {  const code = requestUrl.searchParams.get('code')

    return NextResponse.redirect(new URL('/?error=No authentication code provided', request.url))

  }  if (!code) {

    return NextResponse.redirect(new URL('/?error=No authentication code provided', request.url))

  const supabase = createRouteHandlerClient({ cookies })  }

  

  try {  const supabase = createRouteHandlerClient({ cookies })

    // Exchange the code for a session  

    await supabase.auth.exchangeCodeForSession(code)  try {

        // Exchange the code for a session

    // Get the session to check the user's role    await supabase.auth.exchangeCodeForSession(code)

    const { data: { session }, error: sessionError } = await supabase.auth.getSession()    

        // Get the session to check the user's role

    if (sessionError || !session?.user) {    const { data: { session }, error: sessionError } = await supabase.auth.getSession()

      console.error('Session error:', sessionError)    

      return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))    if (sessionError || !session?.user) {

    }      console.error('Session error:', sessionError)

      return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))

    const { user } = session    }

    const role = user.user_metadata?.role?.toLowerCase()

        const { user } = session

    if (!role) {    const role = user.user_metadata?.role?.toLowerCase()

      console.error('No role found in user metadata')    

      return NextResponse.redirect(new URL('/?error=User role not found', request.url))    if (!role) {

    }      console.error('No role found in user metadata')

      return NextResponse.redirect(new URL('/?error=User role not found', request.url))

    // Create the user profile if it doesn't exist    }

    try {

      const { error: profileError } = await supabase    // Create the user profile if it doesn't exist

        .from('profiles')    try {

        .insert([{      const { error: profileError } = await supabase

          id: user.id,        .from('profiles')

          email: user.email,        .insert([{

          role: user.user_metadata.role,          id: user.id,

          created_at: new Date().toISOString(),          email: user.email,

          updated_at: new Date().toISOString(),          role: user.user_metadata.role,

          // Add tenant-specific fields if present in metadata          created_at: new Date().toISOString(),

          ...(user.user_metadata.mobile ? {          updated_at: new Date().toISOString(),

            mobile: user.user_metadata.mobile,          // Add tenant-specific fields if present in metadata

            building_name: user.user_metadata.building_name,          ...(user.user_metadata.mobile ? {

            room_number: user.user_metadata.room_number            mobile: user.user_metadata.mobile,

          } : {})            building_id: user.user_metadata.building_id,

        }])            room_id: user.user_metadata.room_id

        .single()          } : {})

        }])

      if (profileError && profileError.code !== '23505') { // Ignore unique constraint violations        .single()

        console.error('Profile creation error:', profileError)

        throw profileError      if (profileError && profileError.code !== '23505') { // Ignore unique constraint violations

      }        console.error('Profile creation error:', profileError)

    } catch (error) {        throw profileError

      console.error('Failed to create profile:', error)      }

      return NextResponse.redirect(new URL('/?error=Failed to create user profile', request.url))    } catch (error) {

    }      console.error('Failed to create profile:', error)

      return NextResponse.redirect(new URL('/?error=Failed to create user profile', request.url))

    // Redirect to the role-specific dashboard    }

    return NextResponse.redirect(new URL(`/${role}`, request.url))

  } catch (error) {    // Redirect to the role-specific dashboard

    console.error('Callback error:', error)    return NextResponse.redirect(new URL(`/${role}`, request.url))

    return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))  } catch (error) {

  }    console.error('Callback error:', error)

}    return NextResponse.redirect(new URL('/?error=Authentication failed', request.url))
  }
}