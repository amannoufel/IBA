'use client'

import { useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useSupabase } from '../lib/supabase-client'

export default function TenantLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const router = useRouter()
  const supabase = useSupabase()

  useEffect(() => {
    const checkSession = async () => {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error || !session) {
        router.replace('/')
      }
    }
    checkSession()
  }, [router, supabase])

  return <div className="min-h-screen bg-gray-100">{children}</div>
}