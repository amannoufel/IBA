'use client'

import React, { useEffect, useState } from 'react'
import { useSupabase } from '../lib/supabase-client'
import { useRouter } from 'next/navigation'
import Image from 'next/image'

type Complaint = {
  id: number
  tenant_id: string
  tenant_email: string
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
        await fetchComplaints()
      } catch (error) {
        console.error('Error:', error)
        router.replace('/')
      } finally {
        setLoading(false)
      }
    }
    
    checkUser()
  }, [router, supabase])

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

  const handleSignOut = async () => {
    await supabase.auth.signOut()
    router.replace('/')
  }

  if (loading) return <div className="flex items-center justify-center min-h-screen">Loading...</div>

  return (
    <div className="min-h-screen bg-gray-100">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex justify-between items-center">
            <h1 className="text-xl font-semibold">Supervisor Dashboard</h1>
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
          <div className="bg-white shadow rounded-lg p-4 overflow-auto">
            <h2 className="text-lg font-medium mb-4">All Tenant Complaints</h2>
            
            {complaints.length === 0 ? (
              <p className="text-gray-500">No complaints found.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        ID
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
                          <span className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-medium ${
                            complaint.status === 'pending'
                              ? 'bg-yellow-100 text-yellow-800'
                              : complaint.status === 'in_progress' || complaint.status === 'attended'
                              ? 'bg-blue-100 text-blue-800'
                              : complaint.status === 'completed' || complaint.status === 'resolved'
                              ? 'bg-green-100 text-green-800'
                              : 'bg-gray-100 text-gray-800'
                          }`}>
                            {complaint.status.replace('_', ' ')}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                          <button
                            onClick={() => handleViewComplaint(complaint)}
                            className="text-indigo-600 hover:text-indigo-900"
                          >
                            View
                          </button>
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
                  <p>{selectedComplaint.tenant_email}</p>
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