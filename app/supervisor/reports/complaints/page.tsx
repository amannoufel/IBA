'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSupabase } from '../../../lib/supabase-client'
import { useRouter } from 'next/navigation'

type WorkDetail = {
  assignment_id: number
  worker_id: string
  worker_name: string | null
  worker_email: string | null
  store_id: number | null
  store_name: string | null
  time_in: string | null
  time_out: string | null
  needs_revisit: boolean
  materials: string[] | null
}

type ComplaintRow = {
  complaint_id: number
  created_at: string
  tenant_id: string
  tenant_name: string | null
  tenant_email: string | null
  building: string | null
  flat: string | null
  description: string | null
  staff: string | null
  work_details: WorkDetail[] | null
}

export default function ComplaintReportsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')
  const [rows, setRows] = useState<ComplaintRow[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ensureSupervisor = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || (user.user_metadata?.role?.toLowerCase?.() !== 'supervisor')) {
        router.replace('/')
        return
      }
    }
    ensureSupervisor()
  }, [router, supabase])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (start) p.set('start', new Date(start).toISOString())
    if (end) p.set('end', new Date(end).toISOString())
    return p.toString()
  }, [start, end])

  const load = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports/complaints${query ? `?${query}` : ''}`)
      const j = await r.json()
      setRows(j)
    } finally {
      setLoading(false)
    }
  }

  const downloadXlsx = () => {
    const url = `/api/reports/complaints${query ? `?${query}&format=xlsx` : '?format=xlsx'}`
    window.open(url, '_blank')
  }

  // CSV export can be added similarly to the worker report if needed.

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-xl font-semibold">Complaint Reports</h1>
        <a href="/supervisor/reports" className="text-sm text-indigo-600 hover:underline">Worker Reports</a>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-4">
        <div>
          <label className="text-sm text-slate-600">Start</label>
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-sm text-slate-600">End</label>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
        </div>
        <div className="flex items-end gap-2">
          <button onClick={load} disabled={loading} className="px-3 py-2 border rounded bg-white hover:bg-slate-50">{loading ? 'Loading…' : 'Load'}</button>
          <button onClick={downloadXlsx} className="px-3 py-2 border rounded bg-white hover:bg-slate-50">Download Excel</button>
          {/* <button onClick={downloadCsv} className="px-3 py-2 border rounded bg-white hover:bg-slate-50">Download CSV</button> */}
        </div>
      </div>

      {rows && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Date</th>
                <th className="px-3 py-2 text-left">Tenant</th>
                <th className="px-3 py-2 text-left">Location</th>
                <th className="px-3 py-2 text-left">Description</th>
                <th className="px-3 py-2 text-left">Staff Assigned</th>
                <th className="px-3 py-2 text-left">Work Details</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t align-top">
                  <td className="px-3 py-2 whitespace-nowrap">{new Date(r.created_at).toLocaleString()}</td>
                  <td className="px-3 py-2">
                    <div>{r.tenant_name || r.tenant_email || r.tenant_id}</div>
                    <div className="text-xs text-slate-500">ID: {r.tenant_id}</div>
                  </td>
                  <td className="px-3 py-2">{r.building}, Room {r.flat}</td>
                  <td className="px-3 py-2 max-w-xs whitespace-pre-wrap">{r.description}</td>
                  <td className="px-3 py-2 max-w-xs">{r.staff || '—'}</td>
                  <td className="px-3 py-2">
                    {Array.isArray(r.work_details) && r.work_details.length > 0 ? (
                      <ul className="space-y-1">
                        {r.work_details.map((w: WorkDetail, idx: number) => (
                          <li key={idx} className="border rounded p-2 bg-slate-50">
                            <div className="text-xs text-slate-600 mb-1">{w.worker_name || w.worker_email || w.worker_id}</div>
                            <div><span className="font-medium">Store:</span> {w.store_name || '—'}</div>
                            <div><span className="font-medium">Time:</span> {w.time_in ? new Date(w.time_in).toLocaleString() : '—'} → {w.time_out ? new Date(w.time_out).toLocaleString() : '—'}</div>
                            <div><span className="font-medium">Revisit:</span> {w.needs_revisit ? 'Yes' : 'No'}</div>
                            <div><span className="font-medium">Materials:</span> {Array.isArray(w.materials) && w.materials.length ? w.materials.join(', ') : '—'}</div>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <span className="text-slate-500">—</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
