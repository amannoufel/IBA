'use client'

import { useEffect, useMemo, useState } from 'react'
import { useSupabase } from '../../lib/supabase-client'
import { useRouter } from 'next/navigation'

type Worker = { id: string; name: string | null; email: string | null }
type Row = {
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
}

export default function ReportsPage() {
  const supabase = useSupabase()
  const router = useRouter()
  const [workers, setWorkers] = useState<Worker[]>([])
  const [selectedWorker, setSelectedWorker] = useState<string>('')
  const [start, setStart] = useState<string>('')
  const [end, setEnd] = useState<string>('')
  const [rows, setRows] = useState<Row[] | null>(null)
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const ensureSupervisor = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user || (user.user_metadata?.role?.toLowerCase?.() !== 'supervisor')) {
        router.replace('/')
        return
      }
      try {
        const r = await fetch('/api/users/workers')
        if (r.ok) setWorkers(await r.json())
      } catch {}
    }
    ensureSupervisor()
  }, [router, supabase])

  const query = useMemo(() => {
    const p = new URLSearchParams()
    if (start) p.set('start', new Date(start).toISOString())
    if (end) p.set('end', new Date(end).toISOString())
    if (selectedWorker) p.set('worker', selectedWorker)
    return p.toString()
  }, [start, end, selectedWorker])

  const fetchJson = async () => {
    setLoading(true)
    try {
      const r = await fetch(`/api/reports/workers${query ? `?${query}` : ''}`)
      const j = await r.json()
      setRows(j)
    } finally {
      setLoading(false)
    }
  }

  const downloadCsv = () => {
    const url = `/api/reports/workers${query ? `?${query}&format=csv` : '?format=csv'}`
    window.open(url, '_blank')
  }

  return (
    <div className="max-w-6xl mx-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Worker Reports</h1>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 mb-4">
        <div>
          <label className="text-sm text-slate-600">Start</label>
          <input type="datetime-local" value={start} onChange={e => setStart(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-sm text-slate-600">End</label>
          <input type="datetime-local" value={end} onChange={e => setEnd(e.target.value)} className="mt-1 w-full border rounded px-2 py-1" />
        </div>
        <div>
          <label className="text-sm text-slate-600">Worker</label>
          <select value={selectedWorker} onChange={e => setSelectedWorker(e.target.value)} className="mt-1 w-full border rounded px-2 py-1">
            <option value="">All workers</option>
            {workers.map(w => (
              <option key={w.id} value={w.id}>{w.name || w.email || w.id}</option>
            ))}
          </select>
        </div>
        <div className="flex items-end gap-2">
          <button onClick={fetchJson} disabled={loading} className="px-3 py-2 border rounded bg-white hover:bg-slate-50">{loading ? 'Loading…' : 'Preview JSON'}</button>
          <button onClick={downloadCsv} className="px-3 py-2 border rounded bg-white hover:bg-slate-50">Download CSV</button>
        </div>
      </div>
      {rows && (
        <div className="overflow-x-auto border rounded">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-3 py-2 text-left">Worker</th>
                <th className="px-3 py-2 text-left">Complaint</th>
                <th className="px-3 py-2 text-left">Store</th>
                <th className="px-3 py-2 text-left">Start</th>
                <th className="px-3 py-2 text-left">End</th>
                <th className="px-3 py-2 text-left">Minutes</th>
                <th className="px-3 py-2 text-left">Leader</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i} className="border-t">
                  <td className="px-3 py-2">{r.worker_name || r.worker_email || r.worker_id}</td>
                  <td className="px-3 py-2">#{r.complaint_id} – {r.complaint_desc}</td>
                  <td className="px-3 py-2">{r.store_name || '—'}</td>
                  <td className="px-3 py-2">{new Date(r.session_start).toLocaleString()}</td>
                  <td className="px-3 py-2">{new Date(r.session_end).toLocaleString()}</td>
                  <td className="px-3 py-2">{r.session_minutes}</td>
                  <td className="px-3 py-2">{r.is_leader ? 'Yes' : 'No'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
