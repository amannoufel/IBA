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
  const supabase = createRouteHandlerClient<Database>({ cookies: () => cookieStore as any })
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
    .select(`
      id, worker_id, status, created_at, updated_at, is_leader,
      profiles:worker_id (email, name),
      assignment_details:assignment_details (
        store_id, time_in, time_out, needs_revisit,
        stores:store_id (name),
        assignment_materials:assignment_materials (
          material_id,
          materials:material_id (name)
        )
      )
    `)
    .eq('complaint_id', complaintId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Types for safe normalization
  type Profile = { email?: string | null; name?: string | null } | null
  type DetailRow = {
    store_id: number | null
    time_in: string | null
    time_out: string | null
    needs_revisit: boolean | null
    stores?: { name?: string | null } | null
  }
  type MaterialRow = { material_id: number; materials?: { name?: string | null } | null }
  type Row = {
    id: number
    worker_id: string
    status: string
    created_at: string
    updated_at: string
    is_leader?: boolean | null
    profiles?: Profile
    assignment_details?: (DetailRow & { assignment_materials?: MaterialRow[] | null })[] | null
  }

  // Normalize embedded arrays/objects for the UI
  const normalized = (data as Row[] | null | undefined ?? []).map((row) => {
    const detailArr = row.assignment_details ?? []
    const detail = Array.isArray(detailArr) && detailArr.length > 0 ? detailArr[0] : null
    const matsArr = detail?.assignment_materials ?? []
    const materials = (matsArr as MaterialRow[])
      .map((m) => m.materials?.name ?? null)
      .filter((n): n is string => typeof n === 'string')
    return {
      id: row.id,
      worker_id: row.worker_id,
      status: row.status,
      created_at: row.created_at,
      updated_at: row.updated_at,
      profiles: row.profiles ?? null,
      is_leader: !!row.is_leader,
      detail: detail
        ? {
            store_id: detail.store_id,
            store_name: detail.stores?.name ?? null,
            time_in: detail.time_in,
            time_out: detail.time_out,
            needs_revisit: Boolean(detail.needs_revisit),
            materials,
          }
        : { store_id: null, store_name: null, time_in: null, time_out: null, needs_revisit: false, materials },
    }
  })

  return NextResponse.json(normalized)
}
