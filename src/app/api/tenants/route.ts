// 租戶 API 路由

import { NextRequest, NextResponse } from 'next/server'
import {
  getTenantBySlug,
  getTenantById,
  updateTenant,
} from '@/repositories/tenantRepository'
import type { Tenant } from '@/types/tenant'

// Omit sensitive field before returning to client
function sanitizeTenant(
  tenant: Tenant
): Omit<Tenant, 'line_channel_secret'> {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const { line_channel_secret, ...safe } = tenant
  return safe
}

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const slug = searchParams.get('slug')
  const id = searchParams.get('id')
  const liffId = searchParams.get('liffId')

  if (!slug && !id && !liffId) {
    return NextResponse.json(
      { error: 'slug, id, or liffId is required' },
      { status: 400 }
    )
  }

  try {
    let tenant: Tenant | null = null

    if (liffId) {
      // liffId 查詢需要 service role key（RLS 不允許匿名讀取 tenants）
      const { createServerClient } = await import('@supabase/ssr')
      const supabase = createServerClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!,
        { cookies: { getAll: () => [], setAll: () => {} } }
      )
      const { data } = await supabase
        .from('tenants')
        .select('*')
        .eq('liff_id', liffId)
        .single()
      tenant = data as Tenant | null
    } else {
      tenant = slug
        ? await getTenantBySlug(slug)
        : await getTenantById(id!)
    }

    if (!tenant) {
      return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
    }

    return NextResponse.json(sanitizeTenant(tenant))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json()
    const { id, ...updateFields } = body

    if (!id) {
      return NextResponse.json({ error: 'id is required' }, { status: 400 })
    }

    // Prevent updating sensitive fields via this public route
    delete updateFields.line_channel_secret

    const updated = await updateTenant(id, updateFields as Partial<Tenant>)

    if (!updated) {
      return NextResponse.json(
        { error: 'Tenant not found or update failed' },
        { status: 404 }
      )
    }

    return NextResponse.json(sanitizeTenant(updated))
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Internal server error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
