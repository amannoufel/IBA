import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function GET(request: Request) {
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

    // Parse optional filter params
    const url = new URL(request.url)
  const priorityFilter = url.searchParams.get('priority')?.toLowerCase()
  const statusFilterRaw = url.searchParams.get('status')?.toLowerCase() || ''
  const from = url.searchParams.get('from') // ISO string expected
  const to = url.searchParams.get('to') // ISO string expected
  const areaFilter = url.searchParams.get('area')?.toLowerCase() || ''
  const buildingFilter = url.searchParams.get('building')?.toLowerCase() || ''
  const categoryFilter = url.searchParams.get('category')?.toLowerCase() || ''
  const search = url.searchParams.get('search')?.toLowerCase() || ''

    let query = supabase
      .from('complaints')
      .select(`
        id, 
        type_id,
        description, 
        status, 
        image_path,
        priority,
        created_at,
        tenant_id
      `)
      .order('created_at', { ascending: false })

    if (priorityFilter === 'low' || priorityFilter === 'medium' || priorityFilter === 'high') {
      query = query.eq('priority', priorityFilter)
    }
    if (statusFilterRaw && statusFilterRaw !== 'all') {
      const statuses = statusFilterRaw.split(',').map(s => s.trim()).filter(Boolean)
      if (statuses.length === 1) query = query.eq('status', statuses[0])
      else if (statuses.length > 1) query = query.in('status', statuses)
    }
    if (from) {
      query = query.gte('created_at', from)
    }
    if (to) {
      query = query.lte('created_at', to)
    }

    // Fetch complaints; RLS should now allow due to supervisor policies
    const { data: complaints, error: complaintsError } = await query

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
    let profiles: Array<{ id: string; email: string; name?: string | null; building_name?: string | null; room_number?: string | null; area?: string | null }> | null = []
    if (tenantIds.length > 0) {
      const { data: p, error: profilesError } = await supabase
        .from('profiles')
        .select('id, email, name, building_name, room_number, area')
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
  }, {} as Record<string, { id: string; email: string; name?: string | null; building_name?: string | null; room_number?: string | null; area?: string | null }>)

    const typesMap = (complaintTypes || []).reduce((acc, t) => {
      acc[t.id] = t
      return acc
    }, {} as Record<number, { id: number; name: string }>)

    // Map to include a public URL if available
    let result = (complaints || []).map((c: {
      id: number
      type_id: number
      description: string
      status: string
      priority: 'low' | 'medium' | 'high'
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
        area: profile?.area || null,
        type_id: c.type_id,
        category: complaintType?.name || 'Unknown',
        description: c.description,
        status: c.status,
        priority: c.priority,
        image_path: c.image_path,
        image_url,
        created_at: c.created_at,
      }
    })

    // Apply profile/type based filters post mapping (area, building, category, search)
    if (areaFilter) {
      result = result.filter(r => (r.area || '').toLowerCase() === areaFilter)
    }
    if (buildingFilter) {
      result = result.filter(r => r.building.toLowerCase() === buildingFilter)
    }
    if (categoryFilter) {
      result = result.filter(r => r.category.toLowerCase() === categoryFilter)
    }
    if (search) {
      result = result.filter(r => {
        const hay = [r.description, r.tenant_email, r.tenant_name || '', r.building, r.flat, r.category].join(' ').toLowerCase()
        return hay.includes(search)
      })
    }

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}