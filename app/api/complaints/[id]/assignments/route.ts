import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  // Next.js 15 requires awaiting cookies() when first accessed inside an async handler
  const cookieStore = cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore })
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

  // 2) Fetch details for these assignments (with store name)
  type DetailRow = { assignment_id: number; store_id: number | null; time_in: string | null; time_out: string | null; needs_revisit: boolean | null; stores?: { name?: string | null } | null }
  const { data: details, error: detErr } = await supabase
    .from('assignment_details')
    .select('assignment_id, store_id, time_in, time_out, needs_revisit, stores:store_id (name)')
    .in('assignment_id', assignmentIds)

  if (detErr) return NextResponse.json({ error: detErr.message }, { status: 400 })

  const detailsById = new Map<number, { store_id: number | null; store_name: string | null; time_in: string | null; time_out: string | null; needs_revisit: boolean | null }>()
  for (const d of (details ?? []) as DetailRow[]) {
    detailsById.set(d.assignment_id, {
      store_id: d.store_id ?? null,
      store_name: d.stores?.name ?? null,
      time_in: d.time_in ?? null,
      time_out: d.time_out ?? null,
      needs_revisit: Boolean(d.needs_revisit),
    })
  }

  // 3) Fetch materials used for these assignments and group by assignment_id
  type MaterialRow = { assignment_id: number; material_id: number; materials?: { name?: string | null } | null }
  const { data: mats, error: matsErr } = await supabase
    .from('assignment_materials')
    .select('assignment_id, material_id, materials:material_id (name)')
    .in('assignment_id', assignmentIds)

  if (matsErr) return NextResponse.json({ error: matsErr.message }, { status: 400 })

  const matNamesById = new Map<number, string[]>()
  for (const m of (mats ?? []) as MaterialRow[]) {
    const aid = m.assignment_id
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
