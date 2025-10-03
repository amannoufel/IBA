import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
  const cookieStore = await cookies()
  const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })
    const { id } = await params
    
    // Check if user is authenticated and is supervisor
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a supervisor
    if (user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = await request.json().catch(() => ({} as Record<string, unknown>))
    const updates: { status?: string; priority?: 'low' | 'medium' | 'high' } = {}

    if (typeof body.status === 'string') {
      return NextResponse.json({ error: 'Complaint status is derived from assignments. Approve or reopen assignments to change overall status.' }, { status: 400 })
    }

    if (typeof body.priority === 'string') {
      const p = body.priority.toLowerCase()
      if (p !== 'low' && p !== 'medium' && p !== 'high') {
        return NextResponse.json(
          { error: 'Invalid priority. Must be "low", "medium", or "high"' },
          { status: 400 }
        )
      }
      updates.priority = p as 'low' | 'medium' | 'high'
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
    }

    // Update the complaint fields
    const { error } = await supabase
      .from('complaints')
      .update(updates)
      .eq('id', id)

    if (error) {
      console.error('Error updating complaint status:', error)
      return NextResponse.json({ error: 'Failed to update complaint status' }, { status: 500 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error('Error:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}