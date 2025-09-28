import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient({ cookies: async () => cookieStore })
  
  // Get user info
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized', authError }, { status: 401 })
  }

  // Get user profile
  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .single()

  // Test helper function if it exists
  let helperResult = null
  try {
    const { data: helperData, error: helperError } = await supabase
      .rpc('is_supervisor', { uid: user.id })
    helperResult = { data: helperData, error: helperError }
  } catch (e) {
    helperResult = { error: `Helper function error: ${e}` }
  }

  // Try complaints query
  const { data: complaints, error: complaintsError } = await supabase
    .from('complaints')
    .select('id')
    .limit(1)

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      user_metadata: user.user_metadata
    },
    profile: { data: profile, error: profileError },
    helperFunction: helperResult,
    complaintsQuery: { data: complaints, error: complaintsError },
    timestamp: new Date().toISOString()
  })
}
