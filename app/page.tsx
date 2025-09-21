'use client'

import { useState, useEffect } from 'react'
import { useSupabase } from './lib/supabase-client'
import type { Database } from './types/supabase'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [role, setRole] = useState('TENANT')
  const [mobile, setMobile] = useState('')
  const [buildingName, setBuildingName] = useState('')
  const [roomNumber, setRoomNumber] = useState('')
  const [isSignUp, setIsSignUp] = useState(false)
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  const supabase = useSupabase()

  // Check URL parameters for errors on component mount
  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const errorMsg = params.get('error')
    if (errorMsg) {
      setError(decodeURIComponent(errorMsg))
    }
  }, [])

  const handleAuth = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!supabase) {
      console.error('Supabase client is not initialized')
      setError('Authentication is not initialized. Please try again.')
      return
    }
    
    setError('')
    setLoading(true)
    
    try {
      // Validate form fields for tenant signup
      if (isSignUp && role === 'TENANT') {
        if (!mobile?.trim()) {
          setError('Mobile number is required')
          setLoading(false)
          return
        }
        if (!buildingName?.trim()) {
          setError('Building name is required')
          setLoading(false)
          return
        }
        if (!roomNumber?.trim()) {
          setError('Room number is required')
          setLoading(false)
          return
        }
      }
      
      if (isSignUp) {
        // Validate tenant-specific fields
        if (role === 'TENANT') {
          if (!mobile?.trim()) {
            throw new Error('Mobile number is required for tenants')
          }
          if (!buildingName?.trim() || !roomNumber?.trim()) {
            throw new Error('Building name and Room number are required for tenants')
          }
        }

        const redirectTo = `${window.location.origin}/auth/callback`
        const { data, error } = await supabase.auth.signUp({
          email,
          password,
          options: {
            data: {
              role: role,
              // Store tenant details in metadata for use during confirmation
              ...(role === 'TENANT' ? {
                mobile,
                building_name: buildingName,
                room_number: roomNumber
              } : {})
            },
            emailRedirectTo: redirectTo
          }
        })
        
        if (error) throw error
        if (!data.user) throw new Error('No user returned from signup')

        alert('Please check your email for the confirmation link!')
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email,
          password,
        })

        if (error) throw error

        if (!data.user || !data.session) {
          throw new Error('Sign in successful but no user or session returned')
        }

        // Get role from user metadata
        const role = data.user.user_metadata?.role?.toLowerCase()
        console.log('User role:', role)
        
        if (role && ['tenant', 'worker', 'supervisor'].includes(role)) {
          console.log('Navigating to dashboard:', role)
          // Force a hard redirect
          window.location.href = `/${role}`
        } else {
          console.error('Invalid or missing role:', role)
          throw new Error('User role not found or invalid')
        }
      }
    } catch (error) {
      console.error('Auth error:', error)
      if (error instanceof Error) {
        if (error.message.includes('User already registered')) {
          setError('An account with this email already exists. Please check your email for the confirmation link or try signing in.')
        } else if (error.message.includes('row-level security')) {
          setError('Permission denied. Please try again.')
        } else {
          setError(error.message)
        }
      } else {
        setError('An unexpected error occurred. Please try again.')
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-gray-900">
            {isSignUp ? 'Create your account' : 'Sign in to your account'}
          </h2>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleAuth}>
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <input
                type="email"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-t-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Email address"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
              />
            </div>
            <div>
              <input
                type="password"
                required
                className="appearance-none rounded-none relative block w-full px-3 py-2 border border-gray-300 placeholder-gray-500 text-gray-900 rounded-b-md focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                disabled={loading}
              />
            </div>
          </div>

          {isSignUp && (
            <>
              <div>
                <label className="block text-sm font-medium text-gray-700">Role</label>
                <select
                  value={role}
                  onChange={(e) => setRole(e.target.value)}
                  className="mt-1 block w-full py-2 px-3 border border-gray-300 bg-white rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                  disabled={loading}
                >
                  <option value="TENANT">Tenant</option>
                  <option value="WORKER">Worker</option>
                  <option value="SUPERVISOR">Supervisor</option>
                </select>
              </div>

              {/* Additional fields for tenant role */}
              {isSignUp && role === 'TENANT' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Mobile Number
                    </label>
                    <input
                      type="tel"
                      value={mobile}
                      onChange={(e) => setMobile(e.target.value)}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter your mobile number"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Building Name
                    </label>
                    <input
                      type="text"
                      value={buildingName}
                      onChange={(e) => setBuildingName(e.target.value)}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter building name"
                      required
                      disabled={loading}
                    />
                  </div>

                  <div>
                    <label className="block text-sm font-medium text-gray-700">
                      Room Number
                    </label>
                    <input
                      type="text"
                      value={roomNumber}
                      onChange={(e) => setRoomNumber(e.target.value)}
                      className="mt-1 block w-full py-2 px-3 border border-gray-300 rounded-md shadow-sm focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 sm:text-sm"
                      placeholder="Enter room number"
                      required
                      disabled={loading}
                    />
                  </div>
                </>
              )}
            </>
          )}

          {error && (
            <div className="p-4 mb-4 text-sm text-red-700 bg-red-100 rounded-lg dark:bg-red-200 dark:text-red-800" role="alert">
              <span className="font-medium">Error:</span> {error}
            </div>
          )}

          <div>
            <button
              type="submit"
              className={`group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 ${loading ? 'opacity-50 cursor-not-allowed' : ''}`}
              disabled={loading}
            >
              {loading ? (
                <span className="absolute left-0 inset-y-0 flex items-center pl-3">
                  <svg className="animate-spin h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                </span>
              ) : null}
              {isSignUp ? 'Sign Up' : 'Sign In'}
            </button>
          </div>
        </form>

        <div className="text-center">
          <button
            onClick={() => setIsSignUp(!isSignUp)}
            className="text-indigo-600 hover:text-indigo-500"
            disabled={loading}
          >
            {isSignUp
              ? 'Already have an account? Sign in'
              : 'Don\'t have an account? Sign up'}
          </button>
        </div>
      </div>
    </div>
  )
}