'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'

export const supabase = createClientComponentClient()

export function useSupabase() {
  return supabase
}

export type UserRole = 'TENANT' | 'WORKER' | 'SUPERVISOR'

export interface User {
  id: string
  user_metadata: {
    role: UserRole
  }
  email?: string
}