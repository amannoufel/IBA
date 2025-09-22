import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch complaints joined with type name
    const { data, error } = await supabase
      .from('complaints')
      .select('id, type_id, description, status, image_path, created_at, complaint_types!inner(name)')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    // Map to include a public URL if available
    const withUrls = (data || []).map((c: any) => {
      let image_url: string | null = null
      if (c.image_path) {
        const { data: pub } = supabase.storage.from('complaint-images').getPublicUrl(c.image_path)
        image_url = pub?.publicUrl ?? null
      }
      return {
        id: c.id,
        type_id: c.type_id,
        type_name: c.complaint_types?.name ?? null,
        description: c.description,
        status: c.status,
        image_path: c.image_path,
        image_url,
        created_at: c.created_at,
      }
    })

    return NextResponse.json(withUrls)
  } catch (e) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
