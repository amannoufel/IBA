import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function POST() {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })
  try {
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

  const meta = user.user_metadata || {}
  type ProfileUpdate = Database['public']['Tables']['profiles']['Update']
  const payload: ProfileUpdate = { updated_at: new Date().toISOString() }
    if (meta.role) payload.role = meta.role
    if (Object.prototype.hasOwnProperty.call(meta, 'name')) payload.name = meta.name ?? null
    if (meta.mobile) payload.mobile = meta.mobile
    if (Object.prototype.hasOwnProperty.call(meta, 'building_name')) payload.building_name = meta.building_name ?? null
    if (Object.prototype.hasOwnProperty.call(meta, 'room_number')) payload.room_number = meta.room_number ?? null

    if (Object.keys(payload).length === 1) {
      return NextResponse.json({ message: 'No metadata to sync' })
    }

    // Try update first
    const { data: updated, error: upErr } = await supabase
      .from('profiles')
      .update(payload)
      .eq('id', user.id)
      .select('id')
      .maybeSingle()

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 400 })
    }

    // If no row was updated, insert a new profile row
    if (!updated?.id) {
      const now = new Date().toISOString()
      type ProfileInsert = Database['public']['Tables']['profiles']['Insert']
      const insertPayload: ProfileInsert = {
        id: user.id,
        email: user.email ?? '',
        role: (meta.role as string) || 'supervisor',
  name: (Object.prototype.hasOwnProperty.call(meta, 'name') ? (meta.name as string | null) : null) ?? null,
        mobile: (meta.mobile as string | undefined) ?? null,
        building_name: (Object.prototype.hasOwnProperty.call(meta, 'building_name') ? (meta.building_name as string | null) : null) ?? null,
        room_number: (Object.prototype.hasOwnProperty.call(meta, 'room_number') ? (meta.room_number as string | null) : null) ?? null,
        created_at: now,
        updated_at: now,
      }
      const { error: insErr } = await supabase
        .from('profiles')
        .insert([insertPayload])
      if (insErr) {
        return NextResponse.json({ error: insErr.message }, { status: 400 })
      }
    }

    return NextResponse.json({ message: 'Profile synced' })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Internal Server Error'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
