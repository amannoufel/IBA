import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any })
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

  // Fetch details (may not exist yet)
  const { data: detail } = await supabase
    .from('assignment_details')
    .select('assignment_id, store_id, time_in, time_out, needs_revisit')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  // Fetch materials used
  const { data: mats } = await supabase
    .from('assignment_materials')
    .select('material_id')
    .eq('assignment_id', assignmentId)

  return NextResponse.json({
    assignment,
    detail: detail ?? null,
    materials_used: (mats ?? []).map((m) => m.material_id)
  })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any })
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
  } | null

  if (!body) return NextResponse.json({ error: 'Invalid payload' }, { status: 400 })

  const payload: Record<string, unknown> = {}
  if (body.store_id === null || typeof body.store_id === 'number') payload.store_id = body.store_id
  if (body.time_in === null || typeof body.time_in === 'string') payload.time_in = body.time_in
  if (body.time_out === null || typeof body.time_out === 'string') payload.time_out = body.time_out
  if (typeof body.needs_revisit === 'boolean') payload.needs_revisit = body.needs_revisit

  // Upsert details row
  const { data: existing } = await supabase
    .from('assignment_details')
    .select('assignment_id')
    .eq('assignment_id', assignmentId)
    .maybeSingle()

  if (existing?.assignment_id) {
    const { error: upErr } = await supabase
      .from('assignment_details')
      .update(payload)
      .eq('assignment_id', assignmentId)
    if (upErr) return NextResponse.json({ error: upErr.message }, { status: 400 })
  } else {
    const { error: insErr } = await supabase
      .from('assignment_details')
      .insert([{ assignment_id: assignmentId, ...payload }])
    if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
  }

  // Sync materials list if provided
  if (Array.isArray(body.materials)) {
    // Delete existing
    const { error: delErr } = await supabase
      .from('assignment_materials')
      .delete()
      .eq('assignment_id', assignmentId)
    if (delErr) return NextResponse.json({ error: delErr.message }, { status: 400 })

    if (body.materials.length > 0) {
      const rows = body.materials.map((mid) => ({ assignment_id: assignmentId, material_id: mid }))
      const { error: insErr } = await supabase
        .from('assignment_materials')
        .insert(rows)
      if (insErr) return NextResponse.json({ error: insErr.message }, { status: 400 })
    }
  }

  return NextResponse.json({ ok: true })
}
