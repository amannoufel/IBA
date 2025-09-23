import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Try a minimal select to see exact error
  const { data, error } = await supabase
    .from('complaints')
    .select('id')
    .limit(1)

  return NextResponse.json({ data, error }, { status: error ? 400 : 200 })
}
