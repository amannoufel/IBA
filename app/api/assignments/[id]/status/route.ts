import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

type TeamOverride = { assignment_id: number; start_at?: string | null; end_at?: string | null }
type Interval = { start_at: string; end_at: string }
type SessionInsert = { assignment_id: number; worker_id: string; start_at: string; end_at: string; visit_id?: number | null }
type SessionOverride = { worker_id: string; intervals: Interval[] }

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

  const body = (await request.json().catch(() => null)) as { action?: string; note?: string; overrides?: TeamOverride[] | { sessions?: SessionOverride[] } } | null
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
        .select('id, worker_id, is_leader')
        .eq('complaint_id', thisAssign.complaint_id!)

      const hasSessionsShape = body && typeof body.overrides === 'object' && !Array.isArray(body.overrides)
      const sessions: SessionOverride[] = hasSessionsShape && (body!.overrides as { sessions?: SessionOverride[] })?.sessions
        ? (body!.overrides as { sessions?: SessionOverride[] }).sessions!.filter(Boolean)
        : []

      const oMapByWorker = new Map<string, Interval[]>()
      for (const s of sessions) {
        const cleaned = (s.intervals || [])
          .filter(iv => iv && iv.start_at && iv.end_at)
          .map(iv => ({ start_at: new Date(iv.start_at).toISOString(), end_at: new Date(iv.end_at).toISOString() }))
          .filter(iv => iv.start_at < iv.end_at)
        if (cleaned.length) oMapByWorker.set(s.worker_id, cleaned)
      }

      // Back-compat: also accept the previous simple override list
      const simpleOverrides = Array.isArray(body?.overrides) ? (body!.overrides as TeamOverride[]) : []
      const oMapByAssignment = new Map<number, TeamOverride>()
      for (const o of simpleOverrides) if (o && typeof o.assignment_id === 'number') oMapByAssignment.set(o.assignment_id, o)

      // For each teammate, replace sessions for this visit & worker with provided intervals (or default leader window)
      if (team) {
        for (const t of team) {
          const workerIntervals = oMapByWorker.get(t.worker_id)
          const defaultStart = oMapByAssignment.get(t.id)?.start_at ?? leaderStart
          const defaultEnd = oMapByAssignment.get(t.id)?.end_at ?? leaderEnd
          const intervals: Interval[] = workerIntervals && workerIntervals.length > 0
            ? workerIntervals
            : [{ start_at: defaultStart!, end_at: defaultEnd! }]

          // Clean slate: remove any sessions tied to this visit for this worker, then insert the intervals
          await supabase
            .from('assignment_work_sessions')
            .delete()
            .eq('visit_id', latestVisit!.id)
            .eq('worker_id', t.worker_id)

          const rows: SessionInsert[] = intervals.map(iv => ({
            assignment_id: t.id,
            worker_id: t.worker_id,
            start_at: iv.start_at,
            end_at: iv.end_at,
            visit_id: latestVisit!.id,
          }))
          const { error: insErr } = await supabase
            .from('assignment_work_sessions')
            .insert(rows)
          if (insErr) return NextResponse.json({ error: `Failed to save sessions: ${insErr.message}` }, { status: 400 })
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
