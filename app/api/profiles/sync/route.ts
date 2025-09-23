import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function POST() {
  const supabase = createRouteHandlerClient({ cookies })
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

  const meta = user.user_metadata || {}
  type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
  const payload: ProfileUpdate = { updated_at: new Date().toISOString() }
    if (meta.role) payload.role = meta.role
    if (meta.mobile) payload.mobile = meta.mobile
    if (Object.prototype.hasOwnProperty.call(meta, 'building_name')) payload.building_name = meta.building_name ?? null
    if (Object.prototype.hasOwnProperty.call(meta, 'room_number')) payload.room_number = meta.room_number ?? null

    if (Object.keys(payload).length === 1) {
      return NextResponse.json({ message: 'No metadata to sync' })
    }

    const { error: upErr } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 })
    }

    return NextResponse.json({ message: 'Profile synced' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal Server Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
