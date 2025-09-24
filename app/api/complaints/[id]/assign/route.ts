import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function POST(
  request: NextRequest,
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

  const body = (await request.json().catch(() => null)) as { worker_ids?: string[] } | null
  const workerIds = body?.worker_ids ?? []
  if (!Array.isArray(workerIds) || workerIds.length === 0) {
    return NextResponse.json({ error: 'worker_ids is required' }, { status: 400 })
  }

  const rows = workerIds.map((wid) => ({ complaint_id: complaintId, worker_id: wid, assigned_by: user.id }))
  const { data, error } = await supabase.from('complaint_assignments').insert(rows).select('*')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
