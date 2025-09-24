import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../../types/supabase'

export async function GET(
  _request: NextRequest,
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

  const { data, error } = await supabase
    .from('complaint_assignments')
    .select(`
      id, worker_id, status, created_at, updated_at,
      profiles:worker_id (email, name),
      assignment_details:assignment_details (
        store_id, time_in, time_out, needs_revisit,
        stores:store_id (name)
      ),
      assignment_materials:assignment_materials (
        material_id,
        materials:material_id (name)
      )
    `)
    .eq('complaint_id', complaintId)

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  // Normalize embedded arrays/objects for the UI
  const normalized = (data ?? []).map((row: any) => {
    const detailArr = row.assignment_details as Array<any> | null | undefined
    const detail = Array.isArray(detailArr) && detailArr.length > 0 ? detailArr[0] : null
    const matsArr = (row.assignment_materials as Array<any> | null | undefined) ?? []
    const materials = matsArr
      .map((m) => m?.materials?.name)
      .filter((n: any) => typeof n === 'string')
    return {
      id: row.id as number,
      worker_id: row.worker_id as string,
      status: row.status as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
      profiles: row.profiles ?? null,
      detail: detail
        ? {
            store_id: detail.store_id as number | null,
            store_name: detail.stores?.name ?? null,
            time_in: detail.time_in as string | null,
            time_out: detail.time_out as string | null,
            needs_revisit: Boolean(detail.needs_revisit),
            materials,
          }
        : { store_id: null, store_name: null, time_in: null, time_out: null, needs_revisit: false, materials: materials as string[] },
    }
  })

  return NextResponse.json(normalized)
}
