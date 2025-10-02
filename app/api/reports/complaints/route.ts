import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function GET(request: NextRequest) {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }

  const url = new URL(request.url)
  const start = url.searchParams.get('start')
  const end = url.searchParams.get('end')
  const format = (url.searchParams.get('format') || 'json').toLowerCase()

  const { data, error } = await supabase.rpc('get_complaint_report', {
    _start: start ? new Date(start).toISOString() : null,
    _end: end ? new Date(end).toISOString() : null,
  } as unknown as { _start: string | null; _end: string | null })

  if (error) return NextResponse.json({ error: error.message }, { status: 400 })

  const rows = (data ?? []) as Array<{
    complaint_id: number
    created_at: string
    tenant_id: string
    tenant_name: string | null
    tenant_email: string | null
    building: string | null
    flat: string | null
    description: string | null
    staff: string | null
    work_details: any[]
  }>

  if (format === 'xlsx') {
    const ExcelJS = await import('exceljs')
    const wb = new ExcelJS.Workbook()
    wb.creator = 'IBA Reports'
    wb.created = new Date()

    const ws = wb.addWorksheet('Complaints')
    ws.columns = [
      { header: 'Date', key: 'date', width: 22 },
      { header: 'Complaint ID', key: 'complaint_id', width: 14 },
      { header: 'Tenant Name', key: 'tenant_name', width: 20 },
      { header: 'Tenant Email', key: 'tenant_email', width: 24 },
      { header: 'Tenant ID', key: 'tenant_id', width: 36 },
      { header: 'Building', key: 'building', width: 18 },
      { header: 'Room', key: 'flat', width: 10 },
      { header: 'Description', key: 'description', width: 40 },
      { header: 'Staff Assigned', key: 'staff', width: 30 },
      { header: 'Work Details', key: 'work', width: 60 },
    ]

    for (const r of rows) {
      const workSummary = Array.isArray(r.work_details) && r.work_details.length
        ? r.work_details.map((w: any) => {
            const who = w.worker_name || w.worker_email || w.worker_id
            const time = `${w.time_in ? new Date(w.time_in).toLocaleString() : '—'} → ${w.time_out ? new Date(w.time_out).toLocaleString() : '—'}`
            const store = w.store_name || '—'
            const mats = Array.isArray(w.materials) && w.materials.length ? w.materials.join(', ') : '—'
            const revisit = w.needs_revisit ? 'Revisit' : 'Completed'
            return `(${who}) Store: ${store}; Time: ${time}; Materials: ${mats}; ${revisit}`
          }).join('\n')
        : ''
      ws.addRow({
        date: new Date(r.created_at).toLocaleString(),
        complaint_id: r.complaint_id,
        tenant_name: r.tenant_name || '',
        tenant_email: r.tenant_email || '',
        tenant_id: r.tenant_id,
        building: r.building || '',
        flat: r.flat || '',
        description: r.description || '',
        staff: r.staff || '',
        work: workSummary,
      })
    }

    // Wrap text for Description and Work Details
    ws.getColumn('description').alignment = { wrapText: true, vertical: 'top' }
    ws.getColumn('work').alignment = { wrapText: true, vertical: 'top' }

    const buf = await wb.xlsx.writeBuffer()
    return new NextResponse(Buffer.from(buf), {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="complaint-report-${Date.now()}.xlsx"`,
      }
    })
  }

  return NextResponse.json(rows)
}
