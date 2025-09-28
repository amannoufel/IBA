'use client'

import React, { useEffect, useState } from 'react'
import { useSupabase } from '../lib/supabase-client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Complaint = {
  id: number
  tenant_id: string
  tenant_email: string
  tenant_name?: string | null
  building: string
  flat: string
  category: string
  description: string
  status: string
  image_url: string | null
  created_at: string
}

export default function SupervisorDashboard() {
  const [complaints, setComplaints] = useState<Complaint[]>([])
  const [selectedComplaint, setSelectedComplaint] = useState<Complaint | null>(null)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [workers, setWorkers] = useState<Array<{ id: string; email: string; name?: string | null }>>([])
  const [assigning, setAssigning] = useState(false)
  const [selectedWorkers, setSelectedWorkers] = useState<string[]>([])
  const [removeAssignmentIds, setRemoveAssignmentIds] = useState<number[]>([])
  const [leaderEdit, setLeaderEdit] = useState<string | null>(null)
  const [assignments, setAssignments] = useState<Array<{
    id: number;
    worker_id: string;
    status: string;
    email?: string;
    name?: string | null;
    is_leader?: boolean;
    detail?: {
      store_id: number | null;
      store_name: string | null;
      time_in: string | null;
      time_out: string | null;
      needs_revisit: boolean;
      materials: string[];
    };
    history?: Array<{ visit_id: number; store_id: number | null; store_name: string | null; time_in: string | null; time_out: string | null; needs_revisit: boolean; materials: string[] }>;
  }>>([])
  const [canAddAssignments, setCanAddAssignments] = useState<boolean>(true)
  const [leaderSelection, setLeaderSelection] = useState<string | null>(null)
  const router = useRouter()
  const supabase = useSupabase()

  useEffect(() => {
    const checkUser = async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser()
        if (!user || user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
          router.replace('/')
          return
        }
        // Attempt to sync profile in case metadata changed
        try { await fetch('/api/profiles/sync', { method: 'POST' }) } catch {}
        await Promise.all([fetchComplaints(), fetchWorkers()])
      } catch (error) {
        console.error('Error:', error)
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }
    
    checkUser()
  }, [router, supabase])

  const fetchWorkers = async () => {
    try {
      const res = await fetch('/api/users/workers')
      if (res.ok) {
        const data = await res.json()
        setWorkers(data)
      }
    } catch (e) {
      console.error('Failed to fetch workers', e)
    }
  }

  const fetchComplaints = async () => {
    try {
      setLoading(true)
      const response = await fetch('/api/complaints/all')
      if (!response.ok) {
        throw new Error('Failed to fetch complaints')
      }
      const data = await response.json()
      setComplaints(data)
    } catch (error) {
      console.error('Error fetching complaints:', error)
    } finally {
      setLoading(false)
    }
  }

  const handleViewComplaint = (complaint: Complaint) => {
    setSelectedComplaint(complaint)
    setIsModalOpen(true)
    // Load current assignments for this complaint
    fetch(`/api/complaints/${complaint.id}/assignments`).then(async (r) => {
      if (!r.ok) return
      const data = await r.json() as { assignments: any[]; can_add_assignments?: boolean } | any[]
      const arr: any[] = Array.isArray(data) ? data : (data?.assignments ?? [])
      setCanAddAssignments(Array.isArray(data) ? true : Boolean(data?.can_add_assignments ?? true))
      type RawAssignment = {
        id: number; worker_id: string; status: string; is_leader?: boolean;
        profiles?: { email?: string | null; name?: string | null } | null;
        detail?: { store_id: number | null; store_name: string | null; time_in: string | null; time_out: string | null; needs_revisit: boolean; materials: string[] }
      }
      const base: Array<{ id: number; worker_id: string; status: string; email?: string; name?: string | null; is_leader?: boolean; detail?: RawAssignment['detail'] }>= (arr as RawAssignment[]).map((a) => ({
        id: a.id,
        worker_id: a.worker_id,
        status: a.status,
        is_leader: !!a.is_leader,
        email: a.profiles?.email ?? undefined,
        name: a.profiles?.name ?? undefined,
        detail: a.detail,
      }))
      // Fetch each assignment's full history in parallel
      const withHistory = await Promise.all(base.map(async (a) => {
        try {
          const res = await fetch(`/api/assignments/${a.id}/detail`)
          if (!res.ok) return { ...a, history: [] }
          const dj = await res.json() as { history?: Array<{ visit_id: number; store_id: number | null; store_name: string | null; time_in: string | null; time_out: string | null; needs_revisit: boolean; materials: string[] }> }
          return { ...a, history: dj.history ?? [] }
        } catch { return { ...a, history: [] } }
      }))
      setAssignments(withHistory)
      // If there is an existing leader set it in local state
      const existingLeader = withHistory.find(i => i.is_leader)
      setLeaderSelection(existingLeader ? existingLeader.worker_id : null)
      setLeaderEdit(existingLeader ? existingLeader.worker_id : null)
      setRemoveAssignmentIds([])
    })
  }

  const handleStatusUpdate = async (id: number, newStatus: string) => {
    try {
      const response = await fetch(`/api/complaints/${id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: newStatus }),
      })
      
      if (!response.ok) {
        throw new Error('Failed to update status')
      }
      
      // Update the complaint in the UI
      setComplaints(complaints.map(c => c.id === id ? { ...c, status: newStatus } : c))
      
      if (selectedComplaint?.id === id) {
        setSelectedComplaint({ ...selectedComplaint, status: newStatus })
      }
    } catch (error) {
      console.error('Error updating status:', error)
    }
  }

  const handleAssign = async () => {
    if (!selectedComplaint || selectedWorkers.length === 0) return
    // Front-end guard: if no assignments yet (first-time assignment), require a leader selection among selected workers
    if (assignments.length === 0 && (!leaderSelection || !selectedWorkers.includes(leaderSelection))) {
      alert('Please select a leader from the chosen workers before assigning.')
      return
    }
    try {
      setAssigning(true)
      const res = await fetch(`/api/complaints/${selectedComplaint.id}/assign`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ worker_ids: selectedWorkers, leader_id: leaderSelection })
      })
      if (!res.ok) throw new Error('Failed to assign workers')
      const data = await res.json()
      // Merge new assignments into list
      type Inserted = { id: number; worker_id: string; status: string; is_leader?: boolean }
      const appended: Inserted[] = (data || []) as Inserted[]
      setAssignments((prev) => {
        const merged = [...prev, ...appended.map((a) => ({ id: a.id, worker_id: a.worker_id, status: a.status, is_leader: !!a.is_leader }))]
        const existingLeader = merged.find(m => m.is_leader)
        setLeaderSelection(existingLeader ? existingLeader.worker_id : leaderSelection)
        return merged
      })
      setSelectedWorkers([])
    } catch (e) {
      console.error(e)
    } finally {
      setAssigning(false)
    }
  }

  const updateAssignmentAction = async (id: number, action: 'approve' | 'reopen', note?: string) => {
    try {
      const res = await fetch(`/api/assignments/${id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, note })
      })
      if (!res.ok) throw new Error('Failed to update')
      // Refresh current complaint view list
      if (selectedComplaint) await handleViewComplaint(selectedComplaint)
    } catch (e) {
      console.error(e)
      alert('Failed to update assignment status')
    }
  }

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-30 backdrop-blur bg-white/70 border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">Supervisor Dashboard</h1>
            <button onClick={handleSignOut} className="px-4 py-2 text-sm rounded-lg border border-red-200 text-red-600 hover:bg-red-50">Sign Out</button>
          </div>
        </div>
      </nav>
      <main className="max-w-7xl mx-auto py-6 sm:px-6 lg:px-8">
        <div className="px-4 py-6 sm:px-0">
          <div className="rounded-xl border border-slate-200 bg-white/80 shadow-sm p-4 overflow-auto">
            <h2 className="text-lg font-medium mb-4">All Tenant Complaints</h2>
            
            {complaints.length === 0 ? (
              <p className="text-gray-500">No complaints found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-slate-200">
                  <thead className="bg-slate-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Tenant
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Date
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Building
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Flat
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Category
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Status
                      </th>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {complaints.map((complaint) => (
                      <tr key={complaint.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                          {complaint.id}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {complaint.tenant_name || complaint.tenant_email}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {new Date(complaint.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {complaint.building}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {complaint.flat}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          {complaint.category}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium border ${
                            complaint.status === 'pending'
                              ? 'bg-yellow-50 text-yellow-800 border-yellow-200'
                              : complaint.status === 'in_progress' || complaint.status === 'attended'
                              ? 'bg-blue-50 text-blue-800 border-blue-200'
                              : complaint.status === 'completed' || complaint.status === 'resolved'
                              ? 'bg-green-50 text-green-800 border-green-200'
                              : 'bg-slate-100 text-slate-700 border-slate-200'
                          }`}>
                            {complaint.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button onClick={() => handleViewComplaint(complaint)} className="text-indigo-600 hover:text-indigo-900">View</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Complaint Detail Modal */}
      {isModalOpen && selectedComplaint && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-auto">
            <div className="p-6">
              <div className="flex justify-between items-center mb-4">
                <h3 className="text-lg font-medium">Complaint #{selectedComplaint.id}</h3>
                <button
                  onClick={() => setIsModalOpen(false)}
                  className="text-gray-500 hover:text-gray-700"
                >
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>

              <div className="grid grid-cols-2 gap-4 mb-4">
                <div>
                  <p className="text-sm font-medium text-gray-500">Date</p>
                  <p>{new Date(selectedComplaint.created_at).toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Status</p>
                  <div className="flex items-center mt-1">
                    <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium mr-2 ${
                      selectedComplaint.status === 'pending'
                        ? 'bg-yellow-100 text-yellow-800'
                        : selectedComplaint.status === 'in_progress' || selectedComplaint.status === 'attended'
                        ? 'bg-blue-100 text-blue-800'
                        : selectedComplaint.status === 'completed' || selectedComplaint.status === 'resolved'
                        ? 'bg-green-100 text-green-800'
                        : 'bg-gray-100 text-gray-800'
                    }`}>
                      {selectedComplaint.status.replace('_', ' ')}
                    </span>
                  </div>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Tenant</p>
                  <p>{selectedComplaint.tenant_name || selectedComplaint.tenant_email}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Location</p>
                  <p>{selectedComplaint.building}, Flat {selectedComplaint.flat}</p>
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-500">Category</p>
                  <p>{selectedComplaint.category}</p>
                </div>
              </div>

              <div className="mb-4">
                <p className="text-sm font-medium text-gray-500">Description</p>
                <p className="mt-1 whitespace-pre-line">{selectedComplaint.description}</p>
              </div>

              {selectedComplaint.image_url && (
                <div className="mb-4">
                  <p className="text-sm font-medium text-gray-500 mb-1">Photo</p>
                  <Image 
                    src={selectedComplaint.image_url} 
                    alt="Complaint" 
                    width={800}
                    height={600}
                    unoptimized
                    className="w-full max-h-60 object-contain rounded border"
                  />
                </div>
              )}

              <div className="mt-6">
                {/* Assign to workers */}
                <p className="text-sm font-medium text-gray-500 mb-2">Assign to Workers</p>
                {canAddAssignments ? (
                  <div className="mb-2 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    <div className="border rounded p-2 min-w-[260px] max-w-[480px] max-h-40 overflow-auto">
                      {workers.length === 0 ? (
                        <p className="text-sm text-gray-500">No workers available</p>
                      ) : (
                        <ul className="space-y-1">
                          {workers.map((w) => {
                            const checked = selectedWorkers.includes(w.id)
                            return (
                              <li key={w.id} className="flex items-center gap-2">
                                <input
                                  id={`w-${w.id}`}
                                  type="checkbox"
                                  className="h-4 w-4"
                                  checked={checked}
                                  onChange={(e) => {
                                    setSelectedWorkers((prev) => {
                                      const next = e.target.checked
                                        ? Array.from(new Set([...prev, w.id]))
                                        : prev.filter((id) => id !== w.id)
                                      // If leader not in next selection, clear leaderSelection (unless already committed in assignments)
                                      if (leaderSelection && !next.includes(leaderSelection)) {
                                        // keep existing leader if already assigned previously
                                        const existingLeaderPersisted = assignments.find(a => a.is_leader)?.worker_id
                                        setLeaderSelection(existingLeaderPersisted && next.includes(existingLeaderPersisted) ? existingLeaderPersisted : null)
                                      }
                                      return next
                                    })
                                  }}
                                />
                                <label htmlFor={`w-${w.id}`} className="flex-1 text-sm cursor-pointer select-none">
                                  {w.name || w.email}
                                </label>
                                <input
                                  type="radio"
                                  name="leader"
                                  title="Leader"
                                  disabled={!checked || !!assignments.find(a => a.is_leader) && leaderSelection !== w.id}
                                  className="h-4 w-4"
                                  checked={leaderSelection === w.id}
                                  onChange={() => setLeaderSelection(w.id)}
                                />
                                <span className="text-[10px] text-gray-500">Leader</span>
                              </li>
                            )
                          })}
                        </ul>
                      )}
                    </div>
                    <div className="flex flex-col gap-2">
                      <button
                        onClick={handleAssign}
                        disabled={assigning || selectedWorkers.length === 0}
                        className={`px-3 py-1 text-xs font-medium rounded bg-indigo-600 text-white ${assigning ? 'opacity-50' : 'hover:bg-indigo-700'}`}
                      >
                        {assigning ? 'Assigning…' : 'Assign'}
                      </button>
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setSelectedWorkers(workers.map((w) => w.id))}
                          className="px-2 py-1 text-xs rounded border bg-white text-gray-700 hover:bg-gray-50"
                          disabled={workers.length === 0}
                        >
                          Select all
                        </button>
                        <button
                          type="button"
                          onClick={() => setSelectedWorkers([])}
                          className="px-2 py-1 text-xs rounded border bg-white text-gray-700 hover:bg-gray-50"
                          disabled={selectedWorkers.length === 0}
                        >
                          Clear
                        </button>
                      </div>
                      <p className="text-xs text-gray-500">Selected: {selectedWorkers.length} {leaderSelection && <span className="ml-2 inline-block px-1.5 py-0.5 bg-indigo-100 text-indigo-700 rounded">Leader chosen</span>}</p>
                    </div>
                  </div>
                  </div>
                ) : (
                  <div className="mb-2 p-2 rounded border border-yellow-200 bg-yellow-50 text-yellow-800 text-xs flex items-center justify-between">
                    <span>Assignments are temporarily locked until the leader saves the first job update.</span>
                    <button
                      type="button"
                      onClick={() => setCanAddAssignments(true)}
                      className="ml-2 px-2 py-1 rounded bg-yellow-600 text-white hover:bg-yellow-700"
                    >
                      Unlock to reassign
                    </button>
                  </div>
                )}
                {assignments.length > 0 && (
                  <div className="mt-2">
                    <div className="flex items-center justify-between mb-1">
                      <p className="text-sm font-medium text-gray-500">Current Assignments</p>
                      <button
                        type="button"
                        onClick={() => selectedComplaint && handleViewComplaint(selectedComplaint)}
                        className="text-xs text-indigo-600 hover:text-indigo-800"
                      >
                        Refresh
                      </button>
                    </div>
                    <ul className="space-y-2">
                      {assignments.map(a => (
                        <li key={a.id} className="text-sm border rounded p-2">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium">{a.name || a.email || a.worker_id}</span>
                            <label className="flex items-center gap-1 text-[11px] ml-2">
                              <input
                                type="radio"
                                name="leader-edit"
                                checked={leaderEdit === a.worker_id}
                                onChange={() => setLeaderEdit(a.worker_id)}
                              />
                              Leader
                            </label>
                            {a.is_leader && leaderEdit !== a.worker_id && (
                              <span className="text-[10px] text-gray-500">(current)</span>
                            )}
                            <span className="text-xs italic">{a.status.replace('_',' ')}</span>
                            <label className="ml-auto flex items-center gap-1 text-[11px] text-red-600">
                              <input
                                type="checkbox"
                                checked={removeAssignmentIds.includes(a.id)}
                                onChange={(e) => setRemoveAssignmentIds(prev => e.target.checked ? Array.from(new Set([...prev, a.id])) : prev.filter(id => id !== a.id))}
                              />
                              Remove
                            </label>
                          </div>
                          {a.is_leader && (
                            <>
                              {a.detail ? (
                                <div className="mt-1 text-xs text-gray-600 space-y-0.5">
                                  <div>
                                    <span className="font-medium">Assigned workers:</span> {assignments.map(w => `${w.name || w.email || w.worker_id}${w.is_leader ? ' (Leader)' : ''}`).join(', ')}
                                  </div>
                                  <div>
                                    <span className="font-medium">Store:</span> {a.detail.store_name || '—'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Materials:</span> {a.detail.materials?.length ? a.detail.materials.join(', ') : '—'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Time:</span> {a.detail.time_in ? new Date(a.detail.time_in).toLocaleString() : '—'} → {a.detail.time_out ? new Date(a.detail.time_out).toLocaleString() : '—'}
                                  </div>
                                  <div>
                                    <span className="font-medium">Revisit:</span> {a.detail.needs_revisit ? 'Yes' : 'No'}
                                  </div>
                                </div>
                              ) : (
                                <div className="mt-1 text-xs text-gray-500">No details saved yet.</div>
                              )}
                              {a.history && a.history.length > 0 && (
                                <div className="mt-2 border-t pt-2">
                                  <p className="text-[11px] font-semibold text-gray-700 mb-1">Job History</p>
                                  <ul className="space-y-1">
                                    {a.history.map(h => (
                                      <li key={h.visit_id} className="text-[11px] text-gray-700 border rounded p-1.5">
                                        <div><span className="font-medium">Store:</span> {h.store_name || '—'}</div>
                                        <div><span className="font-medium">Materials:</span> {h.materials?.length ? h.materials.join(', ') : '—'}</div>
                                        <div><span className="font-medium">Time:</span> {h.time_in ? new Date(h.time_in).toLocaleString() : '—'} → {h.time_out ? new Date(h.time_out).toLocaleString() : '—'}</div>
                                        <div><span className="font-medium">Revisit:</span> {h.needs_revisit ? 'Yes' : 'No'}</div>
                                      </li>
                                    ))}
                                  </ul>
                                </div>
                              )}
                            </>
                          )}
                          {a.is_leader && (
                            <div className="mt-2 flex items-center gap-2">
                              <button
                                className={`px-2 py-1 text-xs rounded ${a.status === 'pending_review' ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                                disabled={a.status !== 'pending_review'}
                                onClick={() => updateAssignmentAction(a.id, 'approve')}
                              >
                                Confirm completion
                              </button>
                              <button
                                className={`px-2 py-1 text-xs rounded ${a.status === 'pending_review' ? 'bg-yellow-600 text-white hover:bg-yellow-700' : 'bg-gray-100 text-gray-400 cursor-not-allowed'}`}
                                disabled={a.status !== 'pending_review'}
                                onClick={() => {
                                  const note = prompt('Reason to reopen?') || ''
                                  updateAssignmentAction(a.id, 'reopen', note)
                                }}
                              >
                                Reopen
                              </button>
                            </div>
                          )}
                        </li>
                      ))}
                    </ul>
                    <div className="mt-2 flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={async () => {
                          if (!selectedComplaint) return
                          try {
                            const res = await fetch(`/api/complaints/${selectedComplaint.id}/assignments`, {
                              method: 'PATCH',
                              headers: { 'Content-Type': 'application/json' },
                              body: JSON.stringify({ leader_id: leaderEdit, remove_assignment_ids: removeAssignmentIds })
                            })
                            if (!res.ok) {
                              const msg = await res.json().catch(() => ({}))
                              throw new Error(msg?.error || 'Failed to save changes')
                            }
                            // Refresh list
                            await handleViewComplaint(selectedComplaint)
                          } catch (e: unknown) {
                            const msg = e instanceof Error ? e.message : 'Failed to save changes'
                            alert(msg)
                          }
                        }}
                        className="px-3 py-1 text-xs font-medium rounded bg-green-600 text-white hover:bg-green-700"
                      >
                        Save changes
                      </button>
                    </div>
                  </div>
                )}

                <p className="text-sm font-medium text-gray-500 mb-2">Update Status</p>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleStatusUpdate(selectedComplaint.id, 'pending')}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      selectedComplaint.status === 'pending' 
                        ? 'bg-yellow-200 text-yellow-800' 
                        : 'bg-yellow-100 text-yellow-800 hover:bg-yellow-200'
                    }`}
                  >
                    Pending
                  </button>
                  <button
                    onClick={() => handleStatusUpdate(selectedComplaint.id, 'attended')}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      selectedComplaint.status === 'attended' 
                        ? 'bg-blue-200 text-blue-800' 
                        : 'bg-blue-100 text-blue-800 hover:bg-blue-200'
                    }`}
                  >
                    Attended
                  </button>
                  <button
                    onClick={() => handleStatusUpdate(selectedComplaint.id, 'completed')}
                    className={`px-3 py-1 text-xs font-medium rounded ${
                      selectedComplaint.status === 'completed' 
                        ? 'bg-green-200 text-green-800' 
                        : 'bg-green-100 text-green-800 hover:bg-green-200'
                    }`}
                  >
                    Completed
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}