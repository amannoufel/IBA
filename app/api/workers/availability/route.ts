import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '../../../types/supabase'

export async function GET(request: Request) {
  try {
    const url = new URL(request.url)
    const day = url.searchParams.get('day') // YYYY-MM-DD
    const ids = (url.searchParams.get('workerIds') || '')
      .split(',').map(s => s.trim()).filter(Boolean)

    if (!day || ids.length === 0) {
      return NextResponse.json({ error: 'day and workerIds are required' }, { status: 400 })
    }

    const cookieStore = await cookies()
    const supabase = createRouteHandlerClient<Database>({ cookies: (() => cookieStore) as unknown as typeof cookies })

    // Ensure requester is a supervisor
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    if (user.user_metadata?.role?.toLowerCase() !== 'supervisor') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { data, error } = await supabase.rpc('get_worker_busy_windows', {
      _worker_ids: ids,
      _day: day,
    } as unknown as { _worker_ids: string[]; _day: string })

    if (error) return NextResponse.json({ error: error.message }, { status: 400 })

    return NextResponse.json({ busy: data ?? [] })
  } catch (e) {
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
  }
}
