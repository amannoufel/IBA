import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createRouteHandlerClient<Database>({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const complaintId = Number(id)
  if (Number.isNaN(complaintId)) return NextResponse.json({ error: 'Invalid complaint id' }, { status: 400 })

  const { data, error } = await supabase
    .from('complaint_assignments')
    .select('id, worker_id, status, created_at, updated_at, profiles:worker_id (email)')
    .eq('complaint_id', complaintId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data ?? [])
}
