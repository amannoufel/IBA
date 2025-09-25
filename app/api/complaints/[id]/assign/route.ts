import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore as any })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const complaintId = Number(id)
  if (Number.isNaN(complaintId)) return NextResponse.json({ error: 'Invalid complaint id' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as { worker_ids?: string[]; leader_id?: string | null } | null
  const workerIds = body?.worker_ids ?? []
  const leaderId = body?.leader_id || null
  if (!Array.isArray(workerIds) || workerIds.length === 0) {
    return NextResponse.json({ error: 'worker_ids is required' }, { status: 400 })
  }

  // If a leader is requested ensure they are part of worker_ids
  const effectiveLeaderId = leaderId && workerIds.includes(leaderId) ? leaderId : null

  // If a leader already exists for this complaint and a new leader is requested in this batch, block to avoid unique violation
  if (effectiveLeaderId) {
    const { data: existingLeader, error: leaderCheckErr } = await supabase
      .from('complaint_assignments')
      .select('id')
      .eq('complaint_id', complaintId)
      .eq('is_leader', true)
      .maybeSingle()
    if (leaderCheckErr) return NextResponse.json({ error: leaderCheckErr.message }, { status: 400 })
    if (existingLeader) {
      return NextResponse.json({ error: 'Leader already set for this complaint. Clear or change leader first.' }, { status: 400 })
    }
  }

  const rows = workerIds.map((wid) => ({ complaint_id: complaintId, worker_id: wid, assigned_by: user.id, is_leader: wid === effectiveLeaderId }))
  const { data, error } = await supabase.from('complaint_assignments').insert(rows).select('id, worker_id, status, is_leader, created_at, updated_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
