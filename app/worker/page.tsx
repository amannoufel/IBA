'use client'

import { useCallback, useEffect, useState } from 'react'
import { useSupabase } from '../lib/supabase-client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'

export default function WorkerDashboard() {
  const [user, setUser] = useState<User | null>(null)
  type Assignment = { id: number; status: string; created_at: string; is_leader?: boolean; complaint: { id: number; description: string; status: string; created_at: string } }
  const [assignments, setAssignments] = useState<Assignment[]>([])
  const [selected, setSelected] = useState<Assignment | null>(null)
  const [stores, setStores] = useState<Array<{ id: number; name: string }>>([])
  const [materials, setMaterials] = useState<Array<{ id: number; name: string }>>([])
  const [submitting, setSubmitting] = useState(false)
  const [detail, setDetail] = useState<{ store_id: number | null; materials: number[]; time_in: string | null; time_out: string | null; needs_revisit: boolean } | null>(null)
  const [history, setHistory] = useState<Array<{ visit_id: number; store_id: number | null; store_name: string | null; time_in: string | null; time_out: string | null; needs_revisit: boolean; materials: string[] }>>([])
  const [teammates, setTeammates] = useState<Array<{ assignment_id: number; worker_id: string; email?: string | null; name?: string | null; is_leader: boolean }>>([])
  const [teammatesUnavailable, setTeammatesUnavailable] = useState(false)
  // Multi-interval session overrides per teammate (keyed by worker_id)
  type IntervalEdit = { start: string; end: string }
  const [teamSessions, setTeamSessions] = useState<Record<string, IntervalEdit[]>>({})
  const router = useRouter()
  const supabase = useSupabase()

  // Format an ISO timestamp (UTC or with zone) to a local datetime-local input value (YYYY-MM-DDTHH:mm)
  const toLocalInput = (iso?: string | null) => {
    if (!iso) return ''
    const d = new Date(iso)
    if (isNaN(d.getTime())) return ''
    const tzOffset = d.getTimezoneOffset() // minutes
    const local = new Date(d.getTime() - tzOffset * 60000)
    return local.toISOString().slice(0, 16)
  }

  const fetchAssignments = useCallback(async () => {
    try {
      const res = await fetch('/api/assignments/mine')
      if (res.ok) {
        const data = await res.json() as Assignment[]
        setAssignments(data)
      }
    } catch (e) {
      console.error('Failed to fetch assignments', e)
    }
  }, [])

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user }, error } = await supabase.auth.getUser()
        
        if (error || !user) {
          console.error('Auth error:', error)
          router.replace('/')
          return
        }

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('role')
          .eq('id', user.id)
          .single()

        if (profileError || !profile) {
          console.error('Profile error:', profileError)
          router.replace('/')
          return
        }

        if (profile.role.toLowerCase() !== 'worker') {
          router.replace('/')
          return
        }

        setUser(user)
        // Sync profile fields from user metadata (e.g., name) after sign-in
        try { await fetch('/api/profiles/sync', { method: 'POST' }) } catch {}
  await fetchAssignments()
      } catch (error) {
        console.error('Unexpected error:', error)
        router.replace('/')
      }
    }
    checkUser()
  }, [router, supabase, fetchAssignments])

  

  const updateAssignmentAction = async (id: number, action: 'start' | 'mark_done') => {
    try {
      const res = await fetch(`/api/assignments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action })
      })
      if (!res.ok) {
        // Try to surface server error for easier diagnosis
        let serverMsg = ''
        try {
          const err = await res.json()
          serverMsg = err?.error || JSON.stringify(err)
        } catch {
          try { serverMsg = await res.text() } catch {}
        }
        throw new Error(`Failed to update status${serverMsg ? `: ${serverMsg}` : ''}`)
      }
      const dj = await res.json().catch(() => ({} as { status?: string }))
      await fetchAssignments()
      // Update local detail view if same assignment
      if (selected?.id === id && dj?.status) {
        setSelected((prev) => (prev ? { ...prev, status: dj.status! } : prev))
        setSelected((prev) => prev ? { ...prev, complaint: { ...prev.complaint, status: dj.status! } } : prev)
      }
    } catch (e) {
      console.error(e)
      alert((e as Error).message || 'Failed to update status')
    }
  }

  const openDetail = async (a: Assignment) => {
    setSelected(a)
    // load lookups once
    try {
      const [sRes, mRes] = await Promise.all([
        stores.length ? Promise.resolve({ ok: true, json: async () => stores }) : fetch('/api/lookups/stores'),
        materials.length ? Promise.resolve({ ok: true, json: async () => materials }) : fetch('/api/lookups/materials'),
      ])
      if (sRes.ok) setStores(await sRes.json())
      if (mRes.ok) setMaterials(await mRes.json())
    } catch (e) { console.warn(e) }

    // load existing detail + history + teammates
    try {
      const dRes = await fetch(`/api/assignments/${a.id}/detail`)
      if (dRes.ok) {
        const d = await dRes.json() as { detail: { store_id: number | null; time_in: string | null; time_out: string | null; needs_revisit: boolean } | null; materials_used: number[]; history?: Array<{ visit_id: number; store_id: number | null; store_name: string | null; time_in: string | null; time_out: string | null; needs_revisit: boolean; materials: string[] }>; teammates?: Array<{ assignment_id: number; worker_id: string; email?: string | null; name?: string | null; is_leader: boolean }>; teammates_unavailable?: boolean }
        setDetail({
          store_id: d.detail?.store_id ?? null,
          materials: d.materials_used ?? [],
          time_in: d.detail?.time_in ?? null,
          time_out: d.detail?.time_out ?? null,
          needs_revisit: d.detail?.needs_revisit ?? false,
        })
        setHistory(d.history ?? [])
  setTeammates(d.teammates ?? [])
  setTeamSessions({})
        setTeammatesUnavailable(!!d.teammates_unavailable)
      } else {
        setDetail({ store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false })
        setHistory([])
  setTeammates([])
  setTeamSessions({})
  setTeammatesUnavailable(false)
      }
    } catch {
      setDetail({ store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false })
      setHistory([])
  setTeammates([])
  setTeamSessions({})
  setTeammatesUnavailable(false)
    }
  }

  const submitForReview = async () => {
    if (!selected) return
    try {
      setSubmitting(true)
      // If leader, save details first
      if (selected.is_leader && detail) {
        const res = await fetch(`/api/assignments/${selected.id}/detail`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            store_id: detail.store_id,
            materials: detail.materials,
            time_in: detail.time_in,
            time_out: detail.time_out,
            needs_revisit: detail.needs_revisit,
          })
        })
        if (!res.ok) {
          let msg = 'Failed to save details'
          try { const j = await res.json(); msg = j?.error || msg } catch {}
          throw new Error(msg)
        }
      }
      // Build multi-interval overrides (leader only)
      const sessionsPayload = selected.is_leader ? Object.entries(teamSessions).map(([worker_id, intervals]) => ({
        worker_id,
        intervals: intervals
          .filter(iv => iv.start && iv.end)
          .map(iv => ({ start_at: new Date(iv.start).toISOString(), end_at: new Date(iv.end).toISOString() })),
      })).filter(s => s.intervals.length > 0) : []

      // Then submit status for review with overrides
      const res2 = await fetch(`/api/assignments/${selected.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'mark_done', overrides: { sessions: sessionsPayload } })
      })
      if (!res2.ok) {
        let msg = 'Failed to submit for review'
        try { const j = await res2.json(); msg = j?.error || msg } catch {}
        throw new Error(msg)
      }
      await fetchAssignments()
    } catch (e) {
      console.error(e)
      alert((e as Error).message || 'Failed to submit for review')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (!user) return <div className="min-h-screen flex items-center justify-center text-slate-600">Loading...</div>

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">Worker Dashboard</h1>
            <button onClick={handleSignOut} className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Sign Out</button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
            <div className="rounded-xl border border-slate-200 bg-white/80 shadow-sm p-4 lg:col-span-2">
              <h2 className="text-lg font-medium mb-3">My Assignments</h2>
              {assignments.length === 0 ? (
                <p className="text-slate-500">No assignments yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-slate-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Created</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Leader</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-slate-600 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-100">
                      {assignments.map((a) => (
                        <tr key={a.id} className="hover:bg-slate-50">
                          <td className="px-4 py-2 text-sm">{a.complaint.id}</td>
                          <td className="px-4 py-2 text-sm">{new Date(a.complaint.created_at).toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm">{a.complaint.description}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${a.status === 'completed' ? 'bg-green-50 text-green-700 border-green-200' : a.status === 'in_progress' ? 'bg-blue-50 text-blue-700 border-blue-200' : a.status === 'pending_review' ? 'bg-yellow-50 text-yellow-800 border-yellow-200' : 'bg-slate-100 text-slate-700 border-slate-200'}`}>{a.status.replace('_',' ')}</span>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {a.is_leader ? <span className="inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border bg-green-50 text-green-700 border-green-200">Leader</span> : <span className="text-slate-400 text-xs">—</span>}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <button onClick={() => openDetail(a)} className="inline-flex items-center text-indigo-600 hover:text-indigo-800">View / Update</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 bg-white/80 shadow-sm p-4">
              <h2 className="text-lg font-medium mb-3">Job Details</h2>
              {!selected ? (
                <p className="text-slate-500 text-sm">Select a job from the table to view and update details.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-slate-500">Complaint #{selected.complaint.id}</p>
                    <p className="font-medium text-slate-900">{selected.complaint.description}</p>
                  </div>
                  {!selected.is_leader && (
                    <div className="p-2 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 rounded">
                      Only the designated leader can edit job details. You can still update assignment status.
                    </div>
                  )}
                  <div>
                    {teammates.length > 0 && (
                      <div className="mb-2 text-xs text-gray-600">
                        <span className="font-medium">Assigned workers:</span> {teammates.map(t => `${t.name || t.email || t.worker_id}${t.is_leader ? ' (Leader)' : ''}`).join(', ')}
                      </div>
                    )}
                    <label className="block text-sm font-medium text-slate-700">Store</label>
                    <select
                      value={detail?.store_id ?? ''}
                      disabled={!selected.is_leader}
                      onChange={(e) => setDetail((d) => ({ ...(d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }), store_id: e.target.value ? Number(e.target.value) : null }))}
                      className="mt-1 block w-full disabled:opacity-60"
                    >
                      <option value="">Select store</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700">Materials used</label>
                    <div className="border border-slate-200 rounded p-2 max-h-32 overflow-auto bg-white">
                      {materials.map((m) => {
                        const checked = detail?.materials?.includes(m.id) ?? false
                        return (
                          <label key={m.id} className={`flex items-center gap-2 text-sm ${!selected.is_leader ? 'opacity-60' : ''}`}>
                            <input
                              type="checkbox"
                              disabled={!selected.is_leader}
                              checked={checked}
                              onChange={(e) => setDetail((d) => {
                                const base = d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }
                                const set = new Set(base.materials)
                                if (e.target.checked) set.add(m.id); else set.delete(m.id)
                                return { ...base, materials: Array.from(set) }
                              })}
                            />
                            {m.name}
                          </label>
                        )
                      })}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Time In</label>
                      <input
                        type="datetime-local"
                        disabled={!selected.is_leader}
                        value={toLocalInput(detail?.time_in)}
                        onChange={(e) => setDetail((d) => ({ ...(d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }), time_in: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                        className="mt-1 block w-full disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-slate-700">Time Out</label>
                      <input
                        type="datetime-local"
                        disabled={!selected.is_leader}
                        value={toLocalInput(detail?.time_out)}
                        onChange={(e) => setDetail((d) => ({ ...(d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }), time_out: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                        className="mt-1 block w-full disabled:opacity-60"
                      />
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      id="needs-revisit"
                      type="checkbox"
                      disabled={!selected.is_leader}
                      checked={detail?.needs_revisit ?? false}
                      onChange={(e) => setDetail((d) => ({ ...(d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }), needs_revisit: e.target.checked }))}
                    />
                    <label htmlFor="needs-revisit" className="text-sm text-slate-700">Attended once but need to revisit</label>
                  </div>
                  <div className="flex items-center gap-2">
                        <div className="ml-auto flex items-center gap-2 w-full justify-end">
                      <button
                        onClick={() => selected && updateAssignmentAction(selected.id, 'start')}
                        disabled={selected.status === 'in_progress' || selected.status === 'pending_review' || selected.status === 'completed'}
                        className={`px-2 py-1 text-xs rounded border ${selected.status === 'in_progress' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${selected.status === 'in_progress' || selected.status === 'pending_review' || selected.status === 'completed' ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        in progress
                      </button>
                      <button
                        onClick={submitForReview}
                        disabled={submitting || selected.status === 'pending_review' || selected.status === 'completed'}
                        className={`px-2 py-1 text-xs rounded border ${selected.status === 'pending_review' ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'} ${(submitting || selected.status === 'pending_review' || selected.status === 'completed') ? 'opacity-50 cursor-not-allowed' : ''}`}
                      >
                        {submitting ? 'Submitting…' : 'Submit for review'}
                      </button>
                    </div>
                  </div>
                      {selected?.is_leader && (
                        <div className="mt-3 border-t border-slate-200 pt-3">
                          <div className="flex items-center justify-between mb-2">
                            <h4 className="text-xs font-semibold text-slate-700">Team sessions (optional)</h4>
                            <button
                              type="button"
                              onClick={() => selected && openDetail(selected)}
                              className="text-[11px] text-indigo-600 hover:text-indigo-800"
                            >Refresh</button>
                          </div>
                          <p className="text-xs text-slate-500 mb-2">If a worker left and later rejoined, add multiple in/out intervals. Others inherit your visit time.</p>
                          {teammates.length > 0 ? (
                            <div className="space-y-3">
                              {teammates.map(t => (
                                <div key={t.worker_id} className="">
                                  <div className="text-xs font-medium mb-1">{t.name || t.email || t.worker_id}{t.is_leader ? ' (Leader)' : ''}</div>
                                  {(teamSessions[t.worker_id] ?? []).map((iv, idx) => (
                                    <div key={idx} className="flex items-center gap-2 mb-2">
                                      <input
                                        type="datetime-local"
                                        className="border rounded px-2 py-1 text-xs"
                                        value={iv.start}
                                        onChange={(e) => setTeamSessions(prev => {
                                          const list = [...(prev[t.worker_id] ?? [])]
                                          list[idx] = { ...list[idx], start: e.target.value }
                                          return { ...prev, [t.worker_id]: list }
                                        })}
                                      />
                                      <span className="text-xs">to</span>
                                      <input
                                        type="datetime-local"
                                        className="border rounded px-2 py-1 text-xs"
                                        value={iv.end}
                                        onChange={(e) => setTeamSessions(prev => {
                                          const list = [...(prev[t.worker_id] ?? [])]
                                          list[idx] = { ...list[idx], end: e.target.value }
                                          return { ...prev, [t.worker_id]: list }
                                        })}
                                      />
                                      <button type="button" className="text-[11px] text-red-600" onClick={() => setTeamSessions(prev => {
                                        const list = [...(prev[t.worker_id] ?? [])]
                                        list.splice(idx, 1)
                                        return { ...prev, [t.worker_id]: list }
                                      })}>Remove</button>
                                    </div>
                                  ))}
                                  <button
                                    type="button"
                                    className="text-[11px] text-indigo-600"
                                    onClick={() => setTeamSessions(prev => ({ ...prev, [t.worker_id]: [...(prev[t.worker_id] ?? []), { start: '', end: '' }] }))}
                                  >Add interval</button>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="text-[11px] text-slate-500">
                              {teammatesUnavailable ? 'Team list is temporarily unavailable. Apply migrations and refresh.' : 'No teammates found for this job.'}
                            </div>
                          )}
                        </div>
                      )}
                  {selected?.status === 'pending_review' && (
                    <div className="text-xs text-slate-500">Awaiting supervisor confirmation…</div>
                  )}
                  {history.length > 0 && (
                    <div className="mt-4 border-t border-slate-200 pt-3">
                      <h3 className="text-sm font-medium mb-2">Job History</h3>
                      <ul className="space-y-2 text-xs text-slate-700">
                        {history.map(h => (
                          <li key={h.visit_id} className="border border-slate-200 rounded p-2 bg-white">
                            <div><span className="font-semibold">Store:</span> {h.store_name || '—'}</div>
                            <div><span className="font-semibold">Materials:</span> {h.materials?.length ? h.materials.join(', ') : '—'}</div>
                            <div><span className="font-semibold">Time:</span> {h.time_in ? new Date(h.time_in).toLocaleString() : '—'} → {h.time_out ? new Date(h.time_out).toLocaleString() : '—'}</div>
                            <div><span className="font-semibold">Revisit:</span> {h.needs_revisit ? 'Yes' : 'No'}</div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}