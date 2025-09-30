import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const url = new URL(request.url)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const worker = url.searchParams.get('worker')
  const format = (url.searchParams.get('format') || 'json').toLowerCase()

  const { data, error } = await supabase
    .rpc('get_worker_report', {
      _start: start ? new Date(start).toISOString() : null,
      _end: end ? new Date(end).toISOString() : null,
      _worker: worker || null,
    })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const rows = (data ?? []) as Array<{
    worker_id: string
    worker_name: string | null
    worker_email: string | null
    assignment_id: number
    complaint_id: number
    is_leader: boolean
    status: string | null
    session_start: string
    session_end: string
    session_minutes: number
    store_id: number | null
    store_name: string | null
    complaint_desc: string | null
  }>

  if (format === 'csv') {
    const header = [
      'worker_id','worker_name','worker_email','assignment_id','complaint_id','is_leader','status','session_start','session_end','session_minutes','store_id','store_name','complaint_desc'
    ].join(',')
    const lines = rows.map(r => [
      r.worker_id,
      JSON.stringify(r.worker_name ?? ''),
      JSON.stringify(r.worker_email ?? ''),
      r.assignment_id,
      r.complaint_id,
      r.is_leader ? 1 : 0,
      JSON.stringify(r.status ?? ''),
      r.session_start,
      r.session_end,
      r.session_minutes,
      r.store_id ?? '',
      JSON.stringify(r.store_name ?? ''),
      JSON.stringify(r.complaint_desc ?? ''),
    ].join(','))
    const csv = [header, ...lines].join('\n')
    return new NextResponse(csv, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="worker-report.csv"',
      }
    })
  }

  return NextResponse.json(rows)
}
