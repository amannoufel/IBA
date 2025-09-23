import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  
  try {
    // Test 1: Basic connection
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    
    // Test 2: Try a simple query that should work (complaint_types has open read policy)
    const { data: types, error: typesError } = await supabase
      .from('complaint_types')
      .select('*')
      .limit(3)
    
    // Test 3: Try to read from profiles without RLS constraints
    let profileTest = null
    if (user) {
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id, email, role')
        .eq('id', user.id)
        .single()
      profileTest = { data: profile, error: profileError }
    }
    
    // Test 4: Raw SQL to check database connection
    let rawTest = null
    try {
      const { data: rawData, error: rawError } = await supabase
        .rpc('version')  // PostgreSQL version function
      rawTest = { data: rawData, error: rawError }
    } catch (e) {
      rawTest = { error: `Raw SQL failed: ${e}` }
    }

    return NextResponse.json({
      timestamp: new Date().toISOString(),
      auth: {
        user: user ? {
          id: user.id,
          email: user.email,
          user_metadata: user.user_metadata
        } : null,
        error: authError
      },
      complaintTypes: {
        data: types,
        error: typesError
      },
      profileTest,
      rawTest
    })
  } catch (error) {
    return NextResponse.json({
      error: `Server error: ${error}`,
      timestamp: new Date().toISOString()
    }, { status: 500 })
  }
}