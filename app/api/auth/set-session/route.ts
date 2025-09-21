import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const supabase = createRouteHandlerClient({ cookies })
    
    // Get the session
    const { data: { session }, error } = await supabase.auth.getSession()
    
    if (error) {
      console.error('Session error:', error.message)
      return new NextResponse(JSON.stringify({ error: error.message }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    if (!session) {
      return new NextResponse(JSON.stringify({ error: 'No session found' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      })
    }

    // Set cookie with session
    const response = new NextResponse(
      JSON.stringify({ message: 'Session cookie set' }), 
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    )

    return response
  } catch (error) {
    console.error('Set session error:', error)
    return new NextResponse(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    })
  }
}
