import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'

export async function GET(request: Request) {
  const supabase = createRouteHandlerClient({ cookies })
  const { searchParams } = new URL(request.url)
  const buildingId = searchParams.get('buildingId')

  if (!buildingId) {
    return NextResponse.json(
      { error: 'Building ID is required' },
      { status: 400 }
    )
  }

  try {
    const { data: rooms, error } = await supabase
      .from('rooms')
      .select('*')
      .eq('building_id', buildingId)
      .order('room_number')

    if (error) throw error

    return NextResponse.json(rooms)
  } catch (error) {
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    )
  }
}