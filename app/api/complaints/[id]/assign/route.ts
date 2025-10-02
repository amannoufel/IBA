import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const { id } = await params
  const complaintId = Number(id)
  if (Number.isNaN(complaintId)) return NextResponse.json({ error: 'Invalid complaint id' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as { worker_ids?: string[]; leader_id?: string | null; scheduled_start?: string | null; scheduled_end?: string | null } | null
  const workerIds = body?.worker_ids ?? []
  const leaderId = body?.leader_id || null
  let scheduledStart = body?.scheduled_start ?? null
  let scheduledEnd = body?.scheduled_end ?? null
  // Normalize schedule: if both provided and end < start, reject
  if (scheduledStart && scheduledEnd) {
    try {
      const s = new Date(scheduledStart)
      const e = new Date(scheduledEnd)
      if (e < s) {
        return NextResponse.json({ error: 'scheduled_end must be after scheduled_start' }, { status: 400 })
      }
    } catch {}
  }
  if (!Array.isArray(workerIds) || workerIds.length === 0) {
    return NextResponse.json({ error: 'worker_ids is required' }, { status: 400 })
  }

  // Check if a leader already exists for this complaint
  const { data: existingLeaderRow, error: leaderCheckErr } = await supabase
    .from('complaint_assignments')
    .select('id, worker_id')
    .eq('complaint_id', complaintId)
    .eq('is_leader', true)
    .maybeSingle()
  if (leaderCheckErr) return NextResponse.json({ error: leaderCheckErr.message }, { status: 400 })

  // If no leader exists yet, require a leader_id in this request and it must be one of worker_ids
  if (!existingLeaderRow) {
    if (!leaderId || !workerIds.includes(leaderId)) {
      return NextResponse.json({ error: 'leader_id is required and must be one of worker_ids when assigning the first time.' }, { status: 400 })
    }
  } else {
    // A leader already exists; disallow passing a different leader_id in this request to avoid conflicts
    if (leaderId && leaderId !== existingLeaderRow.worker_id) {
      return NextResponse.json({ error: 'Leader already set for this complaint. Cannot set a different leader in this assignment.' }, { status: 400 })
    }
  }

  // Effective leader for this batch: only when there is no existing leader and the provided leader is among worker_ids
  const effectiveLeaderId = !existingLeaderRow && leaderId && workerIds.includes(leaderId) ? leaderId : null

  const rows = workerIds.map((wid) => ({
    complaint_id: complaintId,
    worker_id: wid,
    assigned_by: user.id,
    is_leader: wid === effectiveLeaderId,
    scheduled_start: scheduledStart,
    scheduled_end: scheduledEnd,
  }))
  const { data, error } = await supabase.from('complaint_assignments').insert(rows).select('id, worker_id, status, is_leader, created_at, updated_at')
  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
