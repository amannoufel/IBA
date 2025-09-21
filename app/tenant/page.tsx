'use client'

import { useEffect, useState } from 'react'
import { useSupabase } from '../lib/supabase-client'
import { useRouter } from 'next/navigation'
import { User } from '@supabase/supabase-js'

export default function TenantDashboard() {
  const [user, setUser] = useState<User | null>(null)
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
          <div className="border-4 border-dashed border-gray-200 rounded-lg h-96 p-4">
            <h2 className="text-lg font-medium">Welcome, Tenant!</h2>
            <p className="mt-2">Your content will go here...</p>
          </div>
        </div>
      </main>
    </div>
  )
}