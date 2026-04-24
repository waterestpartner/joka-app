// GET  /api/branches  — 取得目前 tenant 的所有門市（含非啟用）
// POST /api/branches  — 新增門市（owner only）

import { NextRequest, NextResponse, after } from 'next/server'
import { requireDashboardAuth, isDashboardAuth, requireOwnerAuth } from '@/lib/auth-helpers'
import { getBranchesForTenant, createBranch } from '@/repositories/branchRepository'
import { logAudit } from '@/lib/audit'

export async function GET() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  try {
    const branches = await getBranchesForTenant(auth.tenantId)
    return NextResponse.json(branches)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '載入失敗' }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  const auth = await requireOwnerAuth()
  if (!isDashboardAuth(auth)) return auth

  let body: unknown
  try { body = await req.json() } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { name, address, phone } = body as Record<string, unknown>

  if (!name || typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: '門市名稱為必填' }, { status: 400 })
  }

  try {
    const branch = await createBranch(auth.tenantId, {
      name: name.trim(),
      address: typeof address === 'string' ? address.trim() || null : null,
      phone: typeof phone === 'string' ? phone.trim() || null : null,
    })

    after(() => logAudit({
      tenant_id: auth.tenantId,
      operator_email: auth.email,
      action: 'branch.created',
      target_type: 'branch',
      target_id: branch.id,
      payload: { name: branch.name },
    }))

    return NextResponse.json(branch, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : '新增失敗' }, { status: 500 })
  }
}
