'use client'

import { createClientComponentClient } from '@supabase/auth-helpers-nextjs'
import { type Database } from '../types/supabase'

export const createClient = () => {
  return createClientComponentClient<Database>()
}

export function useSupabase() {
  const supabase = createClientComponentClient<Database>()
  return supabase
}

export type UserRole = 'TENANT' | 'WORKER' | 'SUPERVISOR'

import type { User as AuthUser } from '@supabase/supabase-js'

export interface User extends Omit<AuthUser, 'user_metadata'> {
  user_metadata: {
    role: UserRole
  }
}