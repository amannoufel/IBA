'use client'

import React, { useEffect, useState } from 'react'
import { useSupabase } from '../lib/supabase-client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'
import Image from 'next/image'
import { Database } from '../types/supabase'

type ComplaintType = Database['public']['Tables']['complaint_types']['Row']

export default function TenantDashboard() {
  const [user, setUser] = useState<User | null>(null)
  const [complaintTypes, setComplaintTypes] = useState<ComplaintType[]>([])
  const [selectedType, setSelectedType] = useState<number>(0)
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState<File | null>(null)
  const [imagePreview, setImagePreview] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [myComplaints, setMyComplaints] = useState<Array<{
    id: number
    type_id: number
    type_name: string | null
    description: string
    status: string
    image_url: string | null
    created_at: string
  }>>([])
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

        // Sync profile fields from user metadata (mobile, building_name, room_number)
        try {
          await fetch('/api/profiles/sync', { method: 'POST' })
        } catch (e) {
          console.warn('Profile sync skipped:', e)
        }

        // Fetch complaint types
        const response = await fetch('/api/complaints')
        const types = await response.json()
        if (Array.isArray(types)) {
          setComplaintTypes(types)
          if (types.length > 0) {
            setSelectedType(types[0].id)
          }
        }

        // Fetch my complaints
        const mineRes = await fetch('/api/complaints/mine')
        if (mineRes.ok) {
          const mine = await mineRes.json()
          if (Array.isArray(mine)) setMyComplaints(mine)
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

  const handleSubmitComplaint = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault()
    setSubmitting(true)
    setError(null)

    try {
      const formData = new FormData()
      formData.append('type_id', String(selectedType))
      formData.append('description', description)
      if (imageFile) {
        formData.append('image', imageFile)
      }

      const response = await fetch('/api/complaints', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const data = await response.json()
        throw new Error(data.error || 'Failed to submit complaint')
      }

      // Reset form
      setDescription('')
      setImageFile(null)
      setImagePreview(null)
      alert('Complaint submitted successfully!')

      // Refresh my complaints
      const mineRes = await fetch('/api/complaints/mine', { cache: 'no-store' })
      if (mineRes.ok) {
        const mine = await mineRes.json()
        if (Array.isArray(mine)) setMyComplaints(mine)
      }
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
                  onChange={(e: React.ChangeEvent<HTMLSelectElement>) => setSelectedType(Number(e.target.value))}
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
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDescription(e.target.value)}
                  rows={4}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Please describe your complaint in detail..."
                  required
                />
              </div>

              <div>
                <label htmlFor="image" className="block text-sm font-medium text-gray-700">
                  Photo (optional)
                </label>
                <input
                  id="image"
                  type="file"
                  accept="image/*"
                  onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                    const file = e.target.files?.[0] || null
                    setImageFile(file)
                    if (file) {
                      const url = URL.createObjectURL(file)
                      setImagePreview(url)
                    } else {
                      setImagePreview(null)
                    }
                  }}
                  className="mt-1 block w-full text-sm text-gray-700 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-semibold file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100"
                />
                {imagePreview && (
                  <div className="mt-2">
                    <Image src={imagePreview} alt="Preview" width={200} height={128} unoptimized className="h-32 rounded-md object-cover border" />
                  </div>
                )}
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

          <div className="bg-white shadow rounded-lg p-6 mt-8">
            <h2 className="text-2xl font-semibold mb-4">My Complaints</h2>
            {myComplaints.length === 0 ? (
              <p className="text-gray-600">You haven&apos;t submitted any complaints yet.</p>
            ) : (
              <ul className="divide-y divide-gray-200">
                {myComplaints.map((c) => (
                  <li key={c.id} className="py-4 flex items-start gap-4">
                    {c.image_url ? (
                      <Image
                        src={c.image_url}
                        alt="Complaint"
                        width={80}
                        height={80}
                        unoptimized
                        className="w-20 h-20 object-cover rounded border"
                      />
                    ) : (
                      <div className="w-20 h-20 flex items-center justify-center bg-gray-100 text-gray-400 rounded border text-xs">
                        No Image
                      </div>
                    )}
                    <div className="flex-1">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="text-sm text-gray-500">{new Date(c.created_at).toLocaleString()}</p>
                          <h3 className="text-lg font-medium">{c.type_name ?? 'Complaint'} </h3>
                        </div>
                        <span
                          className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            c.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : c.status === 'in_progress'
                              ? 'bg-blue-100 text-blue-800'
                              : c.status === 'resolved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}
                        >
                          {c.status.replace('_', ' ')}
                        </span>
                      </div>
                      <p className="text-gray-700 mt-2 whitespace-pre-line">{c.description}</p>
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