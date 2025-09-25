import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

type ComplaintRow = Database['public']['Tables']['complaints']['Row']
type ComplaintSubset = Pick<ComplaintRow, 'id' | 'type_id' | 'description' | 'status' | 'image_path' | 'created_at'>

export async function GET() {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient({ cookies: () => cookieStore as any })

  try {
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Fetch complaints for this tenant
    const { data: complaints, error: complaintsError } = await supabase
      .from('complaints')
      .select('id, type_id, description, status, image_path, created_at')
      .eq('tenant_id', user.id)
      .order('created_at', { ascending: false })

    if (complaintsError) {
      return NextResponse.json({ error: complaintsError.message }, { status: 400 })
    }

  const list: ComplaintSubset[] = (complaints ?? []) as ComplaintSubset[]
    const typeIds = Array.from(new Set(list.map(c => c.type_id)))

    // Fetch type names
    const typeNameById = new Map<number, string>()
    if (typeIds.length > 0) {
      const { data: types, error: typesError } = await supabase
        .from('complaint_types')
        .select('id, name')
        .in('id', typeIds)
      if (typesError) {
        return NextResponse.json({ error: typesError.message }, { status: 400 })
      }
      for (const t of types ?? []) {
        typeNameById.set(t.id as number, t.name as string)
      }
    }

    // Map to include a public URL and type name
    const result = list.map(c => {
      const pub = c.image_path
        ? supabase.storage.from('complaint-images').getPublicUrl(c.image_path)
        : { data: { publicUrl: null } }
      return {
        id: c.id,
        type_id: c.type_id,
        type_name: typeNameById.get(c.type_id) ?? null,
        description: c.description,
        status: c.status,
        image_path: c.image_path,
        image_url: pub?.data?.publicUrl ?? null,
        created_at: c.created_at,
      }
    })

    return NextResponse.json(result)
  } catch {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
