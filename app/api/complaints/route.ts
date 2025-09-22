import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../types/supabase'

export async function POST(request: Request) {
  const supabase = createRouteHandlerClient<Database>({ cookies })

  try {
    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser()
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Try to detect multipart form
    const contentType = request.headers.get('content-type') || ''
    let type_id: number
    let description: string
    let imagePath: string | null = null

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      const typeStr = form.get('type_id')?.toString() || ''
      type_id = Number(typeStr)
      description = form.get('description')?.toString() || ''

      const file = form.get('image') as File | null
      if (file && file.size > 0) {
        // Validate file type and size (<= 5MB and image/*)
        const maxBytes = 5 * 1024 * 1024
        if (!file.type.startsWith('image/')) {
          return NextResponse.json({ error: 'Only image files are allowed' }, { status: 400 })
        }
        if (file.size > maxBytes) {
          return NextResponse.json({ error: 'Image must be 5MB or smaller' }, { status: 400 })
        }
        // Generate a storage path: `${user.id}/${timestamp}_${filename}`
        const timestamp = Date.now()
        const sanitizedName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_')
        const path = `${user.id}/${timestamp}_${sanitizedName}`

        const arrayBuffer = await file.arrayBuffer()
        const { error: uploadError } = await supabase.storage
          .from('complaint-images')
          .upload(path, arrayBuffer, {
            contentType: file.type || 'application/octet-stream',
            upsert: false,
          })

        if (uploadError) {
          return NextResponse.json({ error: `Image upload failed: ${uploadError.message}` }, { status: 400 })
        }

        imagePath = path
      }
    } else {
      // Fallback to JSON body
      const body = await request.json()
      type_id = Number(body.type_id)
      description = String(body.description || '')
    }

    if (!type_id || !description) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
    }

    // Create the complaint
    const { data, error } = await supabase
      .from('complaints')
      .insert([
        {
          tenant_id: user.id,
          type_id,
          description,
          status: 'pending',
          image_path: imagePath,
        }
      ])
      .select()
      .single()

    if (error) {
      // Roll back uploaded image if DB insert fails
      if (imagePath) {
        await supabase.storage.from('complaint-images').remove([imagePath])
      }
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}

export async function GET() {
  const supabase = createRouteHandlerClient({ cookies })

  try {
    // Get complaint types
    const { data, error } = await supabase
      .from('complaint_types')
      .select('*')
      .order('name')

    if (error) throw error

    return NextResponse.json(data)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}