import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({
    cookies: (() => cookieStore) as unknown as typeof cookies,
  })

  try {
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is supervisor via helper function first
    let isSupervisor = false
    try {
      const { data: helperResult, error: helperError } = await supabase
        .rpc('is_supervisor', { uid: user.id })
      if (!helperError && helperResult === true) {
        isSupervisor = true
      }
    } catch {
      // Helper function might not exist yet, try JWT fallback
    }
    
    // Fallback to JWT user_metadata.role if helper failed
    if (!isSupervisor) {
      const meta = user.user_metadata as Record<string, unknown> | null | undefined
      let jwtRole = ''
      if (meta && typeof (meta as Record<string, unknown>).role === 'string') {
        jwtRole = String((meta as { role: string }).role).toLowerCase()
      }
      if (jwtRole === 'supervisor') isSupervisor = true
    }
    
    if (!isSupervisor) {
      return NextResponse.json({ error: 'Forbidden: Not a supervisor' }, { status: 403 })
    }

    // Fetch complaints; RLS should now allow due to supervisor policies
    const { data: complaints, error: complaintsError } = await supabase
      .from('complaints')
      .select(`
        id, 
        type_id,
        description, 
        status, 
        image_path,
        created_at,
        tenant_id
      `)
      .order('created_at', { ascending: false })

    if (complaintsError) {
      console.error('Complaints fetch error:', complaintsError)
      const maybeErr = complaintsError as unknown as { status?: number; message: string }
      const status = typeof maybeErr.status === 'number' ? maybeErr.status : 400
      return NextResponse.json({ error: complaintsError.message }, { status })
    }

    // If no complaints, return empty array
    if (!complaints || complaints.length === 0) {
      return NextResponse.json([])
    }

    // Get unique tenant IDs and type IDs
    const tenantIds = [...new Set(complaints.map(c => c.tenant_id))]
    const typeIds = [...new Set(complaints.map(c => c.type_id))]

    // Fetch profiles for all tenants (only if we have IDs)
    let profiles: Array<{ id: string; email: string; name?: string | null; building_name?: string | null; room_number?: string | null }> | null = []
    if (tenantIds.length > 0) {
      const { data: p, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, name, building_name, room_number')
        .in('id', tenantIds)
      if (profilesError) {
        console.error('Error fetching profiles:', profilesError)
        profiles = []
      } else {
        profiles = p
      }
    }

  // Fetch complaint types (only if we have IDs)
    let complaintTypes: Array<{ id: number; name: string }> | null = []
    if (typeIds.length > 0) {
      const { data: t, error: typesError } = await supabase
        .from('complaint_types')
        .select('id, name')
        .in('id', typeIds)
      if (typesError) {
        console.error('Error fetching complaint types:', typesError)
        complaintTypes = []
      } else {
        complaintTypes = t
      }
    }

    // Create lookup maps
    const profilesMap = (profiles || []).reduce((acc, p) => {
      acc[p.id] = p
      return acc
  }, {} as Record<string, { id: string; email: string; name?: string | null; building_name?: string | null; room_number?: string | null }>)

    const typesMap = (complaintTypes || []).reduce((acc, t) => {
      acc[t.id] = t
      return acc
    }, {} as Record<number, { id: number; name: string }>)

    // Map to include a public URL if available
    const result = (complaints || []).map((c: {
      id: number
      type_id: number
      description: string
      status: string
      image_path?: string | null
      created_at: string
      tenant_id: string
    }) => {
      let image_url = null
      if (c.image_path) {
        const { data: pub } = supabase.storage.from('complaint-images').getPublicUrl(c.image_path)
        image_url = pub?.publicUrl ?? null
      }

      const profile = profilesMap[c.tenant_id]
      const complaintType = typesMap[c.type_id]

      return {
        id: c.id,
        tenant_id: c.tenant_id,
  tenant_email: profile?.email || 'Unknown',
  tenant_name: profile?.name || null,
        building: profile?.building_name || 'Unknown',
        flat: profile?.room_number || 'Unknown',
        type_id: c.type_id,
        category: complaintType?.name || 'Unknown',
        description: c.description,
        status: c.status,
        image_path: c.image_path,
        image_url,
        created_at: c.created_at,
      }
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}