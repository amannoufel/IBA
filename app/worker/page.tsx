'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '../lib/supabase-client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'

export default function WorkerDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [assignments, setAssignments] = useState<Array<{ id: number; status: string; complaint: { id: number; description: string; status: string; created_at: string } }>>([])
  const router = useRouter()
  const supabase = useSupabase()

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
        await fetchAssignments()
      } catch (error) {
        console.error('Unexpected error:', error)
        router.replace('/')
      }
    }
    checkUser()
  }, [router, supabase])

  const fetchAssignments = async () => {
    try {
      const res = await fetch('/api/assignments/mine')
      if (res.ok) {
        const data = await res.json()
        setAssignments(data)
      }
    } catch (e) {
      console.error('Failed to fetch assignments', e)
    }
  }

  const updateAssignmentStatus = async (id: number, status: string) => {
    try {
      const res = await fetch(`/api/assignments/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status })
      })
      if (!res.ok) throw new Error('Failed to update status')
      await fetchAssignments()
    } catch (e) {
      console.error(e)
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
          <div className="bg-white shadow rounded-lg p-4">
            <h2 className="text-lg font-medium mb-3">My Assignments</h2>
            {assignments.length === 0 ? (
              <p className="text-gray-500">No assignments yet.</p>
            ) : (
              <ul className="divide-y">
                {assignments.map(a => (
                  <li key={a.id} className="py-3">
                    <div className="flex justify-between items-center">
                      <div>
                        <p className="text-sm text-gray-500">Complaint #{a.complaint.id} • {new Date(a.complaint.created_at).toLocaleString()}</p>
                        <p className="font-medium">{a.complaint.description}</p>
                        <p className="text-xs text-gray-500">Complaint status: {a.complaint.status.replace('_',' ')}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        {['accepted','in_progress','completed','rejected'].map(s => (
                          <button
                            key={s}
                            onClick={() => updateAssignmentStatus(a.id, s)}
                            className={`px-2 py-1 text-xs rounded border ${a.status === s ? 'bg-indigo-600 text-white' : 'bg-white text-gray-700 hover:bg-gray-50'}`}
                          >
                            {s.replace('_',' ')}
                          </button>
                        ))}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </main>
    </div>
  )
}