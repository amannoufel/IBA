import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

type TeamOverride = { assignment_id: number; start_at?: string | null; end_at?: string | null }

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

  const body = (await request.json().catch(() => null)) as { action?: string; note?: string; overrides?: TeamOverride[] } | null
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

  // If leader is submitting mark_done, normalize teammate times by creating/updating sessions
  if (action === 'mark_done') {
    // Check if requester is leader on this complaint
    const { data: thisAssign } = await supabase
      .from('complaint_assignments')
      .select('id, complaint_id, is_leader')
      .eq('id', assignmentId)
      .single()
    if (thisAssign?.is_leader) {
      // Need latest visit for leader to know the default window
      const { data: latestVisit } = await supabase
        .from('assignment_visits')
        .select('id, time_in, time_out')
        .eq('assignment_id', assignmentId)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      const leaderStart = latestVisit?.time_in ?? null
      const leaderEnd = latestVisit?.time_out ?? null
      if (!leaderStart || !leaderEnd) {
        return NextResponse.json({ error: 'Add job times (time in/out) before submitting for review' }, { status: 400 })
      }

      // Fetch all team assignments for same complaint
      const { data: team } = await supabase
        .from('complaint_assignments')
        .select('id, worker_id')
        .eq('complaint_id', thisAssign.complaint_id!)

      const overrides = (body?.overrides ?? []) as TeamOverride[]
      const oMap = new Map<number, TeamOverride>()
      for (const o of overrides) if (o && typeof o.assignment_id === 'number') oMap.set(o.assignment_id, o)

      // Create or update one session per assignment: if open session exists, set its end; otherwise insert a new session for the window
      if (team) {
        for (const t of team) {
          const ov = oMap.get(t.id)
          const start_at = ov?.start_at ?? leaderStart
          const end_at = ov?.end_at ?? leaderEnd
          // End any open session for this teammate on this assignment
          await supabase
            .from('assignment_work_sessions')
            .update({ end_at })
            .eq('assignment_id', t.id)
            .is('end_at', null)
          // If no session existed, insert a synthetic one for this window
          const { data: hasAny } = await supabase
            .from('assignment_work_sessions')
            .select('id')
            .eq('assignment_id', t.id)
            .limit(1)
          if (!hasAny || hasAny.length === 0) {
            await supabase.from('assignment_work_sessions').insert({ assignment_id: t.id, worker_id: t.worker_id, start_at, end_at })
          }
        }
      }
    }
  }

  const { error: uErr } = await supabase
    .from('complaint_assignments')
    .update({ status: nextStatus })
    .eq('id', assignmentId)

  // No fallback to 'completed' for workers; supervisors finalize via 'approve'.
  if (uErr) return NextResponse.json({ error: uErr.message || 'Update failed' }, { status: 400 })

  return NextResponse.json({ ok: true, status: nextStatus })
}
