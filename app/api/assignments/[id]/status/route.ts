import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: idParam } = await params
  const assignmentId = Number(idParam)
  if (Number.isNaN(assignmentId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = (await request.json().catch(() => null)) as { action?: string; note?: string } | null
  const action = (body?.action || '').toLowerCase()
  if (!['start','mark_done','approve','reopen'].includes(action)) {
    return NextResponse.json({ error: 'Invalid action' }, { status: 400 })
  }

  // Load assignment to validate transitions and ownership
  const { data: assignment, error: aErr } = await supabase
    .from('complaint_assignments')
    .select('id, worker_id, status')
    .eq('id', assignmentId)
    .single()
  if (aErr || !assignment) return NextResponse.json({ error: 'Assignment not found' }, { status: 404 })

  // Worker-side transitions
  if (action === 'start' || action === 'mark_done') {
    if (assignment.worker_id !== user.id) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
  }

  // Determine next status
  let nextStatus = assignment.status
  if (action === 'start') nextStatus = 'in_progress'
  if (action === 'mark_done') nextStatus = 'pending_review'
  if (action === 'approve') nextStatus = 'completed'
  if (action === 'reopen') nextStatus = 'in_progress'

  const { error: uErr } = await supabase
    .from('complaint_assignments')
    .update({ status: nextStatus })
    .eq('id', assignmentId)
  if (uErr) return NextResponse.json({ error: uErr.message }, { status: 400 })

  return NextResponse.json({ ok: true, status: nextStatus })
}
