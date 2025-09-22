import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextRequest, NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createRouteHandlerClient<Database>({ cookies })
    
    // Check if user is authenticated and is supervisor
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    // Verify user is a supervisor
    if (user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const complaintId = params.id
    const { status } = await request.json()
    
    if (!['pending', 'attended', 'completed'].includes(status)) {
      return NextResponse.json(
        { error: 'Invalid status. Must be "pending", "attended", or "completed"' }, 
        { status: 400 }
      )
    }

    // Update the complaint status
    const { error } = await supabase
      .from('complaints')
      .update({ status })
      .eq('id', complaintId)

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