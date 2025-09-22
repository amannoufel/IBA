import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })

  try {
    // Verify user is authenticated and a supervisor
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Check if user is a supervisor
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('role')
      .eq('id', user.id)
      .single()

    if (profileError || !profile || profile.role.toLowerCase() !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden: Supervisor access required' }, { status: 403 })
    }

    // Fetch all complaints first
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
      return NextResponse.json({ error: complaintsError.message }, { status: 400 })
    }

    // If no complaints, return empty array
    if (!complaints || complaints.length === 0) {
      return NextResponse.json([])
    }

    // Get unique tenant IDs and type IDs
    const tenantIds = [...new Set(complaints.map(c => c.tenant_id))]
    const typeIds = [...new Set(complaints.map(c => c.type_id))]

    // Fetch profiles for all tenants
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('id, email, building_name, room_number')
      .in('id', tenantIds)

    if (profilesError) {
      console.error('Error fetching profiles:', profilesError)
    }

    // Fetch complaint types
    const { data: complaintTypes, error: typesError } = await supabase
      .from('complaint_types')
      .select('id, name')
      .in('id', typeIds)

    if (typesError) {
      console.error('Error fetching complaint types:', typesError)
    }

    // Create lookup maps
    const profilesMap = (profiles || []).reduce((acc, p) => {
      acc[p.id] = p
      return acc
    }, {} as Record<string, any>)

    const typesMap = (complaintTypes || []).reduce((acc, t) => {
      acc[t.id] = t
      return acc
    }, {} as Record<number, any>)

    // Map to include a public URL if available
    const result = (complaints || []).map((c: {
      id: number
      type_id: number
      description: string
      status: string
      image_path: string | null
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