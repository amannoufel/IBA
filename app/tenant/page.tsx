'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '../lib/supabase-client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import { Database } from '../types/supabase'

type ComplaintType = Database['public']['Tables']['complaint_types']['Row']

export default function TenantDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([])
  const [selectedType, setSelectedType] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
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

        if (profile.role.toLowerCase() !== 'tenant') {
          console.error('Invalid role:', profile.role)
          router.replace('/')
          return
        }

        setUser(user)

        // Fetch complaint types
        const response = await fetch('/api/complaints')
        const types = await response.json()
        if (Array.isArray(types)) {
          setComplaintTypes(types)
          if (types.length > 0) {
            setSelectedType(types[0].id)
          }
        }
      } catch (error) {
        console.error('Unexpected error:', error)
        router.replace('/')
      }
    }

    checkUser()
  }, [router, supabase])

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  const handleSubmitComplaint = async (e: React.FormEvent) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const response = await fetch('/api/complaints', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          type_id: selectedType,
          description,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit complaint')
      }

      // Reset form
      setDescription('')
      alert('Complaint submitted successfully!')
    } catch (error) {
      setError(error instanceof Error ? error.message : 'Failed to submit complaint')
    } finally {
      setSubmitting(false)
    }
  }

  if (!user) return <div>Loading...</div>

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">Tenant Dashboard</h1>
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
          <div className="bg-white shadow rounded-lg p-6">
            <h2 className="text-2xl font-semibold mb-6">Submit a Complaint</h2>
            
            {error && (
              <div className="mb-4 p-4 text-red-700 bg-red-100 rounded-md">
                {error}
              </div>
            )}

            <form onSubmit={handleSubmitComplaint} className="space-y-6">
              <div>
                <label htmlFor="complaintType" className="block text-sm font-medium text-gray-700">
                  Complaint Type
                </label>
                <select
                  id="complaintType"
                  value={selectedType}
                  onChange={(e) => setSelectedType(Number(e.target.value))}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  required
                >
                  {complaintTypes.map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label htmlFor="description" className="block text-sm font-medium text-gray-700">
                  Description
                </label>
                <textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Please describe your complaint in detail..."
                  required
                />
              </div>

              <div>
                <button
                  type="submit"
                  disabled={submitting}
                  className={`w-full flex justify-center py-2 px-4 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${
                    submitting ? 'opacity-50 cursor-not-allowed' : ''
                  }`}
                >
                  {submitting ? 'Submitting...' : 'Submit Complaint'}
                </button>
              </div>
            </form>
          </div>
        </div>
      </main>
    </div>
  )
}