import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  // Next.js 15: await cookies() once, then pass it synchronously to Supabase helper
  const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id: idParam } = await params
  const assignmentId = Number(idParam)
  if (Number.isNaN(assignmentId)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  // Ensure the worker can see this assignment via RLS; select with joins
  const { data: assignment, error: aErr } = await supabase
    .from('complaint_assignments')
    .select('id, status, created_at, complaint:complaint_id (id, description, status, created_at)')
    .eq('id', assignmentId)
    .single()

  if (aErr) return NextResponse.json({ error: aErr.message }, { status: 400 })

  // Fetch latest visit for this assignment (may not exist yet)
  const { data: visit } = await supabase
    .from('assignment_visits')
    .select('id, assignment_id, store_id, time_in, time_out, outcome, note')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  // Fetch materials used for latest visit
  const visitId = visit?.id ?? null
  const { data: mats } = visitId
    ? await supabase
        .from('assignment_visit_materials')
        .select('material_id')
        .eq('visit_id', visitId)
    : { data: [] as { material_id: number }[] }

  const matsList = (mats ?? []) as Array<{ material_id: number }>

  // Build visit history: all visits for this assignment, with store names and materials
  const { data: allVisits } = await supabase
    .from('assignment_visits')
  .select('id, assignment_id, store_id, time_in, time_out, outcome, note')
    .eq('assignment_id', assignmentId)
    .order('created_at', { ascending: false })

  const vrows = (allVisits ?? []) as Array<{ id: number; assignment_id: number; store_id: number | null; time_in: string | null; time_out: string | null; outcome: 'completed' | 'revisit' | null }>
  const vIds = vrows.map(v => v.id)

  // Fetch materials for all visits in one query, with names
  const { data: allMats } = vIds.length
    ? await supabase
        .from('assignment_visit_materials')
        .select('visit_id, material_id, materials:material_id (name)')
        .in('visit_id', vIds)
    : { data: [] as Array<{ visit_id: number; material_id: number; materials?: { name?: string | null } | null }> }

  const matsByVisit = new Map<number, { ids: number[]; names: string[] }>()
  for (const m of (allMats ?? []) as Array<{ visit_id: number; material_id: number; materials?: { name?: string | null } | null }>) {
    const ids = matsByVisit.get(m.visit_id)?.ids ?? []
    const names = matsByVisit.get(m.visit_id)?.names ?? []
    ids.push(m.material_id)
    const nm = m.materials?.name ?? null
    if (nm) names.push(nm)
    matsByVisit.set(m.visit_id, { ids, names })
  }

  // Resolve store names for history
  const storeIds = Array.from(new Set(vrows.map(v => v.store_id).filter((s): s is number => typeof s === 'number')))
  const { data: storeRows } = storeIds.length
    ? await supabase.from('stores').select('id, name').in('id', storeIds)
    : { data: [] as { id: number; name: string }[] }
  const storeNameById = new Map<number, string>()
  for (const s of (storeRows ?? []) as { id: number; name: string }[]) storeNameById.set(s.id, s.name)

  const history = vrows.map(v => ({
    visit_id: v.id,
    assignment_id: v.assignment_id,
    store_id: v.store_id,
    store_name: v.store_id != null ? (storeNameById.get(v.store_id) ?? null) : null,
    time_in: v.time_in,
    time_out: v.time_out,
    needs_revisit: v.outcome === 'revisit',
    materials_ids: matsByVisit.get(v.id)?.ids ?? [],
    materials: matsByVisit.get(v.id)?.names ?? [],
  }))

  // Teammates via RPC (respects auth but bypasses overly strict RLS by running as definer)
  let teammates: Array<{ assignment_id: number; worker_id: string; email?: string | null; name?: string | null; is_leader: boolean }> = []
  let teammatesUnavailable = false
  {
    const { data: trows, error: trpcErr } = await supabase
      .rpc('get_teammates_for_assignment', { aid: assignmentId })
    type TRow = { assignment_id: number; worker_id: string; email: string | null; name: string | null; is_leader: boolean }
    if (!trpcErr && (trows?.length ?? 0) > 0) {
      teammates = ((trows ?? []) as TRow[]).map(t => ({
        assignment_id: t.assignment_id,
        worker_id: t.worker_id,
        email: t.email,
        name: t.name,
        is_leader: !!t.is_leader,
      }))
    } else {
      // Fallback: try to resolve complaint_id and select teammates directly (works if RLS policy exists)
      const { data: compRow } = await supabase
        .from('complaint_assignments')
        .select('complaint_id')
        .eq('id', assignmentId)
        .single()
      if (compRow?.complaint_id) {
        type TeamRow = { id: number; worker_id: string; is_leader: boolean | null; profiles?: { email?: string | null; name?: string | null } | null }
        const { data: teamRows } = await supabase
          .from('complaint_assignments')
          .select('id, worker_id, is_leader, profiles:worker_id (email, name)')
          .eq('complaint_id', compRow.complaint_id)
        teammates = ((teamRows ?? []) as TeamRow[]).map((t) => ({
          assignment_id: t.id,
          worker_id: t.worker_id,
          email: t.profiles?.email ?? null,
          name: t.profiles?.name ?? null,
          is_leader: !!t.is_leader,
        }))
      }
      // If fallback returns only self, signal unavailability so UI can display a helpful hint.
      // This typically happens when the secure RPC or RLS policy hasn't been applied yet.
      if (teammates.length <= 1) teammatesUnavailable = true
    }
  }

  return NextResponse.json({
    assignment,
    detail: visit
      ? {
          assignment_id: visit.assignment_id,
          store_id: visit.store_id,
          time_in: visit.time_in,
          time_out: visit.time_out,
          needs_revisit: visit.outcome === 'revisit',
          note: (visit as { note?: string | null }).note ?? null,
        }
      : null,
    materials_used: matsList.map((m) => m.material_id),
    history,
    teammates,
    teammates_unavailable: teammatesUnavailable,
  })
}

export async function PUT(
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

  const body = await request.json().catch(() => null) as {
    store_id?: number | null
    materials?: number[]
    time_in?: string | null
    time_out?: string | null
    needs_revisit?: boolean
    note?: string | null
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const payload: Record<string, unknown> = {}
  if (body.store_id === null || typeof body.store_id === 'number') payload.store_id = body.store_id
  if (body.time_in === null || typeof body.time_in === 'string') payload.time_in = body.time_in
  if (body.time_out === null || typeof body.time_out === 'string') payload.time_out = body.time_out
  if (typeof body.needs_revisit === 'boolean') payload.needs_revisit = body.needs_revisit
  if (body.note === null || typeof body.note === 'string') payload.note = body.note

  // Ensure an open visit exists (time_out is null); if not, create one
  const { data: openVisit } = await supabase
    .from('assignment_visits')
    .select('id')
    .eq('assignment_id', assignmentId)
    .is('time_out', null)
    .maybeSingle()

  let visitId: number | null = openVisit?.id ?? null
  if (!visitId) {
    const { data: created, error: insVisitErr } = await supabase
      .from('assignment_visits')
      .insert([{ assignment_id: assignmentId, time_in: body.time_in ?? new Date().toISOString(), created_by: (await supabase.auth.getUser()).data.user?.id as string }])
      .select('id')
      .single()
    if (insVisitErr) return NextResponse.json({ error: insVisitErr.message }, { status: 400 })
    visitId = created.id as number
  }

  // Update visit fields based on payload
  const visitUpdate: Record<string, unknown> = {}
  if (payload.store_id !== undefined) visitUpdate.store_id = payload.store_id
  if (payload.time_in !== undefined) visitUpdate.time_in = payload.time_in
  if (payload.time_out !== undefined) visitUpdate.time_out = payload.time_out
  if (payload.needs_revisit !== undefined || payload.time_out !== undefined || payload.note !== undefined) {
    const needsRevisit = typeof body.needs_revisit === 'boolean' ? body.needs_revisit : false
    // If revisit is requested and no explicit time_out provided, close the current visit now
    if (needsRevisit && (body.time_out === undefined || body.time_out === null)) {
      visitUpdate.time_out = new Date().toISOString()
    }
    visitUpdate.outcome = needsRevisit ? 'revisit' : (body.time_out ? 'completed' : null)
  }
  if (Object.keys(visitUpdate).length > 0) {
    const { error: upVisitErr } = await supabase
      .from('assignment_visits')
      .update(visitUpdate)
      .eq('id', visitId)
    if (upVisitErr) return NextResponse.json({ error: upVisitErr.message }, { status: 400 })
  }

  // Sync materials list if provided
  if (Array.isArray(body.materials)) {
    // Delete existing
    const { error: delErr } = await supabase
      .from('assignment_visit_materials')
      .delete()
      .eq('visit_id', visitId as number)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

    if (body.materials.length > 0) {
      const rows = body.materials.map((mid) => ({ visit_id: visitId as number, material_id: mid }))
      const { error: insErr } = await supabase
        .from('assignment_visit_materials')
        .insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}
