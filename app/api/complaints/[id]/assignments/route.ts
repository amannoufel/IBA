import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next.js 15 requires awaiting cookies() when first accessed inside an async handler
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

  // 1) Fetch assignments (no deep embeds to avoid PostgREST relationship edge cases)
  const { data: base, error: baseErr } = await supabase
    .from('complaint_assignments')
    .select(`
      id, worker_id, status, created_at, updated_at, is_leader,
      profiles:worker_id (email, name)
    `)
    .eq('complaint_id', complaintId)

  if (baseErr) return NextResponse.json({ error: baseErr.message }, { status: 400 })

  const rows = (base ?? []) as Array<{
    id: number
    worker_id: string
    status: string
    created_at: string
    updated_at: string
    is_leader?: boolean | null
    profiles?: { email?: string | null; name?: string | null } | null
  }>

  if (rows.length === 0) return NextResponse.json([])

  const assignmentIds = rows.map(r => r.id)

  // 2) Fetch latest-visit details for these assignments (with store name) using the visits view
  type LatestRow = { visit_id: number; assignment_id: number; store_id: number | null; time_in: string | null; time_out: string | null; needs_revisit: boolean | null }
  const { data: details, error: detErr } = await supabase
    .from('assignment_visits_latest')
    .select('visit_id, assignment_id, store_id, time_in, time_out, needs_revisit')
    .in('assignment_id', assignmentIds)

  if (detErr) return NextResponse.json({ error: detErr.message }, { status: 400 })

  // Resolve store names separately (views may not support FK-based joins reliably)
  const latestRows = (details ?? []) as LatestRow[]
  const storeIds = Array.from(new Set(latestRows.map(r => r.store_id).filter((v): v is number => typeof v === 'number')))
  const { data: storeRows } = storeIds.length > 0
    ? await supabase.from('stores').select('id, name').in('id', storeIds)
    : { data: [] as { id: number; name: string }[] }
  const storeNameById = new Map<number, string>()
  for (const s of (storeRows ?? []) as { id: number; name: string }[]) storeNameById.set(s.id, s.name)

  const detailsById = new Map<number, { visit_id: number | null; store_id: number | null; store_name: string | null; time_in: string | null; time_out: string | null; needs_revisit: boolean | null }>()
  for (const d of latestRows) {
    detailsById.set(d.assignment_id, {
      visit_id: d.visit_id ?? null,
      store_id: d.store_id ?? null,
      store_name: d.store_id != null ? (storeNameById.get(d.store_id) ?? null) : null,
      time_in: d.time_in ?? null,
      time_out: d.time_out ?? null,
      needs_revisit: Boolean(d.needs_revisit),
    })
  }

  // 3) Fetch materials used for the latest visit of these assignments and group by assignment_id
  const visitIds: number[] = (details ?? [])
    .map((d) => (d as LatestRow).visit_id)
    .filter((v): v is number => typeof v === 'number' && !Number.isNaN(v))
  type MaterialRow = { visit_id: number; material_id: number; materials?: { name?: string | null } | null }
  const { data: mats, error: matsErr } = visitIds.length > 0
    ? await supabase
        .from('assignment_visit_materials')
        .select('visit_id, material_id, materials:material_id (name)')
        .in('visit_id', visitIds)
    : { data: [] as MaterialRow[], error: null }

  if (matsErr) return NextResponse.json({ error: matsErr.message }, { status: 400 })

  const matNamesById = new Map<number, string[]>() // key by assignment_id
  for (const m of (mats ?? []) as MaterialRow[]) {
    // find assignment_id for this visit_id
    const entry = Array.from(detailsById.entries()).find(([, v]) => v.visit_id === m.visit_id)
    if (!entry) continue
    const [aid] = entry
    const name = m.materials?.name ?? null
    if (name) {
      const arr = matNamesById.get(aid) ?? []
      arr.push(name)
      matNamesById.set(aid, arr)
    }
  }

  // 4) Merge and return
  const result = rows.map((row) => {
    const d = detailsById.get(row.id)
    const materials = matNamesById.get(row.id) ?? []
    return {
      id: row.id,
      worker_id: row.worker_id,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      profiles: row.profiles ?? null,
      is_leader: !!row.is_leader,
      detail: {
        store_id: d?.store_id ?? null,
        store_name: d?.store_name ?? null,
        time_in: d?.time_in ?? null,
        time_out: d?.time_out ?? null,
        needs_revisit: Boolean(d?.needs_revisit ?? false),
        materials,
      },
    }
  })

  return NextResponse.json(result)
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Auth as supervisor
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

  const body = await request.json().catch(() => null) as {
    leader_id?: string | null
    remove_assignment_ids?: number[]
  } | null
  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const removeIds = Array.isArray(body.remove_assignment_ids) ? body.remove_assignment_ids : []
  const newLeaderId = body.leader_id ?? null

  // Load current assignments
  const { data: current, error: curErr } = await supabase
    .from('complaint_assignments')
    .select('id, worker_id, is_leader')
    .eq('complaint_id', complaintId)
  if (curErr) return NextResponse.json({ error: curErr.message }, { status: 400 })
  const currentRows = (current ?? []) as Array<{ id: number; worker_id: string; is_leader: boolean | null }>

  // Compute remaining after removals
  const remaining = currentRows.filter(r => !removeIds.includes(r.id))
  const remainingWorkerIds = new Set(remaining.map(r => r.worker_id))
  const hadLeader = currentRows.some(r => r.is_leader)
  const remainingHasLeader = remaining.some(r => r.is_leader)

  // Validation: if there are assignments remaining, ensure a leader remains or is set among remaining
  if (remaining.length > 0) {
    if (newLeaderId) {
      if (!remainingWorkerIds.has(newLeaderId)) {
        return NextResponse.json({ error: 'leader_id must be among remaining assigned workers.' }, { status: 400 })
      }
    } else if (!remainingHasLeader) {
      return NextResponse.json({ error: 'A leader must be designated among remaining workers.' }, { status: 400 })
    }
  }

  // 1) Delete requested assignments
  if (removeIds.length > 0) {
    const { error: delErr } = await supabase
      .from('complaint_assignments')
      .delete()
      .in('id', removeIds)
      .eq('complaint_id', complaintId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })
  }

  // 2) If leader change requested, clear existing leader and set new one
  if (newLeaderId) {
    // Clear current leader flags for this complaint
    const { error: clearErr } = await supabase
      .from('complaint_assignments')
      .update({ is_leader: false })
      .eq('complaint_id', complaintId)
      .eq('is_leader', true)
    if (clearErr) return NextResponse.json({ error: clearErr.message }, { status: 400 })

    // Find the assignment row for the new leader
    const { data: leaderRow, error: findErr } = await supabase
      .from('complaint_assignments')
      .select('id')
      .eq('complaint_id', complaintId)
      .eq('worker_id', newLeaderId)
      .maybeSingle()
    if (findErr) return NextResponse.json({ error: findErr.message }, { status: 400 })
    if (!leaderRow) return NextResponse.json({ error: 'leader_id not found among assignments.' }, { status: 400 })

    const { error: setErr } = await supabase
      .from('complaint_assignments')
      .update({ is_leader: true })
      .eq('id', leaderRow.id)
    if (setErr) return NextResponse.json({ error: setErr.message }, { status: 400 })
  }

  return NextResponse.json({ ok: true })
}
