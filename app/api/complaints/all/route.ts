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

    // Fetch all complaints with tenant profiles and complaint types
    const { data: complaints, error: complaintsError } = await supabase
      .from('complaints')
      .select(`
        id, 
        type_id,
        description, 
        status, 
        image_path, 
        created_at,
        tenant_id,
        profiles:tenant_id (
          email,
          building_name,
          room_number
        ),
        complaint_types:type_id (
          name
        )
      `)
      .order('created_at', { ascending: false })

    if (complaintsError) {
      return NextResponse.json({ error: complaintsError.message }, { status: 400 })
    }

    // Map to include a public URL if available
    const result = (complaints || []).map((c: {
      id: number
      type_id: number
      description: string
      status: string
      image_path: string | null
      created_at: string
      tenant_id: string
      profiles: { email: string; building_name: string; room_number: string }[]
      complaint_types: { name: string }[]
    }) => {
      let image_url = null
      if (c.image_path) {
        const { data: pub } = supabase.storage.from('complaint-images').getPublicUrl(c.image_path)
        image_url = pub?.publicUrl ?? null
      }

      return {
        id: c.id,
        tenant_id: c.tenant_id,
        tenant_email: c.profiles?.[0]?.email || 'Unknown',
        building: c.profiles?.[0]?.building_name || 'Unknown',
        flat: c.profiles?.[0]?.room_number || 'Unknown',
        type_id: c.type_id,
        category: c.complaint_types?.[0]?.name || 'Unknown',
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