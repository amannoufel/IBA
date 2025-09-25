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
  const [saving, setSaving] = useState(false)
  const [detail, setDetail] = useState<{ store_id: number | null; materials: number[]; time_in: string | null; time_out: string | null; needs_revisit: boolean } | null>(null)
  const router = useRouter()
  const supabase = useSupabase()

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

  

  const updateAssignmentStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (!res.ok) throw new Error('Failed to update status')
      await fetchAssignments()
      // Update local detail view if same assignment
      if (selected?.id === id) {
        setSelected((prev) => (prev ? { ...prev, status } : prev))
        setSelected((prev) => prev ? { ...prev, complaint: { ...prev.complaint, status } } : prev)
      }
    } catch (e) {
      console.error(e)
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

    // load existing detail
    try {
      const dRes = await fetch(`/api/assignments/${a.id}/detail`)
      if (dRes.ok) {
        const d = await dRes.json() as { detail: { store_id: number | null; time_in: string | null; time_out: string | null; needs_revisit: boolean } | null; materials_used: number[] }
        setDetail({
          store_id: d.detail?.store_id ?? null,
          materials: d.materials_used ?? [],
          time_in: d.detail?.time_in ?? null,
          time_out: d.detail?.time_out ?? null,
          needs_revisit: d.detail?.needs_revisit ?? false,
        })
      } else {
        setDetail({ store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false })
      }
    } catch {
      setDetail({ store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false })
    }
  }

  const saveDetail = async () => {
    if (!selected || !detail) return
    try {
      setSaving(true)
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
      if (!res.ok) throw new Error('Failed to save details')
      // optional: refresh assignments list
      await fetchAssignments()
      alert('Saved')
    } catch (e) {
      console.error(e)
      alert('Failed to save')
    } finally {
      setSaving(false)
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (!user) return <div>Loading...</div>

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">Worker Dashboard</h1>
            <button
              onClick={handleSignOut}
              className="px-4 py-2 text-sm text-red-600 hover:text-red-700"
            >
              Sign Out
            </button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="bg-white shadow rounded-lg p-4 lg:col-span-2">
              <h2 className="text-lg font-medium mb-3">My Assignments</h2>
              {assignments.length === 0 ? (
                <p className="text-gray-500">No assignments yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="min-w-full divide-y divide-gray-200">
                    <thead className="bg-gray-50">
                      <tr>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">ID</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Created</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Description</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Leader</th>
                        <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-gray-200">
                      {assignments.map((a) => (
                        <tr key={a.id} className="hover:bg-gray-50">
                          <td className="px-4 py-2 text-sm">{a.complaint.id}</td>
                          <td className="px-4 py-2 text-sm">{new Date(a.complaint.created_at).toLocaleString()}</td>
                          <td className="px-4 py-2 text-sm">{a.complaint.description}</td>
                          <td className="px-4 py-2 text-sm">
                            <span className="px-2 py-1 rounded text-xs bg-gray-100 text-gray-800">{a.status.replace('_',' ')}</span>
                          </td>
                          <td className="px-4 py-2 text-sm">
                            {a.is_leader ? <span className="text-green-600 font-semibold text-xs">Yes</span> : <span className="text-gray-400 text-xs">No</span>}
                          </td>
                          <td className="px-4 py-2 text-sm">
                            <button
                              onClick={() => openDetail(a)}
                              className="text-indigo-600 hover:text-indigo-800"
                            >
                              View / Update
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
            <div className="bg-white shadow rounded-lg p-4">
              <h2 className="text-lg font-medium mb-3">Job Details</h2>
              {!selected ? (
                <p className="text-gray-500 text-sm">Select a job from the table to view and update details.</p>
              ) : (
                <div className="space-y-4">
                  <div>
                    <p className="text-sm text-gray-500">Complaint #{selected.complaint.id}</p>
                    <p className="font-medium">{selected.complaint.description}</p>
                  </div>
                  {!selected.is_leader && (
                    <div className="p-2 text-xs bg-yellow-50 border border-yellow-200 text-yellow-700 rounded">
                      Only the designated leader can edit job details. You can still update assignment status.
                    </div>
                  )}
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Store</label>
                    <select
                      value={detail?.store_id ?? ''}
                      disabled={!selected.is_leader}
                      onChange={(e) => setDetail((d) => ({ ...(d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }), store_id: e.target.value ? Number(e.target.value) : null }))}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md disabled:opacity-60"
                    >
                      <option value="">Select store</option>
                      {stores.map((s) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">Materials used</label>
                    <div className="border rounded p-2 max-h-32 overflow-auto">
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
                      <label className="block text-sm font-medium text-gray-700">Time In</label>
                      <input
                        type="datetime-local"
                        disabled={!selected.is_leader}
                        value={detail?.time_in ? new Date(detail.time_in).toISOString().slice(0,16) : ''}
                        onChange={(e) => setDetail((d) => ({ ...(d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }), time_in: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                        className="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md disabled:opacity-60"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700">Time Out</label>
                      <input
                        type="datetime-local"
                        disabled={!selected.is_leader}
                        value={detail?.time_out ? new Date(detail.time_out).toISOString().slice(0,16) : ''}
                        onChange={(e) => setDetail((d) => ({ ...(d ?? { store_id: null, materials: [], time_in: null, time_out: null, needs_revisit: false }), time_out: e.target.value ? new Date(e.target.value).toISOString() : null }))}
                        className="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md disabled:opacity-60"
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
                    <label htmlFor="needs-revisit" className="text-sm">Attended once but need to revisit</label>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={saveDetail}
                      disabled={saving || !selected.is_leader}
                      className={`px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white ${saving || !selected.is_leader ? 'opacity-50 cursor-not-allowed' : 'hover:bg-indigo-700'}`}
                    >
                      {saving ? 'Saving…' : 'Save'}
                    </button>
                    <div className="ml-auto flex items-center gap-2">
                      {['accepted','in_progress','completed','rejected'].map(s => (
                        <button
                          key={s}
                          onClick={() => selected && updateAssignmentStatus(selected.id, s)}
                          className={`px-2 py-1 text-xs rounded border ${selected.status === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                        >
                          {s.replace('_',' ')}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      </main>
    </div>
  )
}