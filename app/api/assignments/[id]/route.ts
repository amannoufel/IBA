import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function PATCH(request: Request, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const id = Number(params.id)
  if (Number.isNaN(id)) return NextResponse.json({ error: 'Invalid id' }, { status: 400 })

  const body = await request.json().catch(() => null) as { status?: string } | null
  const status = body?.status?.toLowerCase()
  if (!status) return NextResponse.json({ error: 'status is required' }, { status: 400 })

  const allowed = ['assigned','accepted','in_progress','completed','rejected']
  if (!allowed.includes(status)) return NextResponse.json({ error: 'invalid status' }, { status: 400 })

  const { data, error } = await supabase
    .from('complaint_assignments')
    .update({ status })
    .eq('id', id)
    .select('*')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })
  return NextResponse.json(data)
}
