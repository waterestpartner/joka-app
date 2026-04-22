// /api/dashboard/test-line-connection
// 檢查當前 tenant 的 LINE 設定是否可連線
//
// 檢查項目：
//   1. LIFF ID 格式（regex）
//   2. Channel ID 格式（數字）
//   3. Channel Secret 格式（32 hex chars）
//   4. Channel Access Token 有效性（呼叫 /v2/bot/info）
//
// 只讀操作：不寫入 DB、不修改任何設定。

import { NextResponse } from 'next/server'
import { requireDashboardAuth, isDashboardAuth } from '@/lib/auth-helpers'
import { getTenantById } from '@/repositories/tenantRepository'
import { fetchLineBotInfo } from '@/lib/line-messaging'

type CheckStatus = 'ok' | 'missing' | 'invalid'

interface CheckResult {
  status: CheckStatus
  message: string
  detail?: string
}

interface BotInfoResult extends CheckResult {
  bot?: {
    displayName: string
    basicId: string
    pictureUrl?: string
  }
}

interface TestResult {
  liff_id: CheckResult
  channel_id: CheckResult
  channel_secret: CheckResult
  channel_access_token: BotInfoResult
  all_passed: boolean
}

const LIFF_ID_REGEX = /^\d+-[a-zA-Z0-9]+$/
const CHANNEL_ID_REGEX = /^\d+$/
const CHANNEL_SECRET_REGEX = /^[a-f0-9]{32}$/i

export async function POST() {
  const auth = await requireDashboardAuth()
  if (!isDashboardAuth(auth)) return auth

  const tenant = await getTenantById(auth.tenantId)
  if (!tenant) {
    return NextResponse.json({ error: 'Tenant not found' }, { status: 404 })
  }

  const result: TestResult = {
    liff_id:              checkFormat(tenant.liff_id, LIFF_ID_REGEX, 'LIFF ID', '格式應為 1234567890-abcdefgh'),
    channel_id:           checkFormat(tenant.line_channel_id, CHANNEL_ID_REGEX, 'Channel ID', '應為純數字'),
    channel_secret:       checkFormat(tenant.line_channel_secret, CHANNEL_SECRET_REGEX, 'Channel Secret', '應為 32 位 hex 字串'),
    channel_access_token: await checkAccessToken(tenant.channel_access_token),
    all_passed:           false,
  }

  result.all_passed =
    result.liff_id.status === 'ok' &&
    result.channel_id.status === 'ok' &&
    result.channel_secret.status === 'ok' &&
    result.channel_access_token.status === 'ok'

  return NextResponse.json(result)
}

function checkFormat(
  value: string | null | undefined,
  regex: RegExp,
  label: string,
  formatHint: string
): CheckResult {
  if (!value || !value.trim()) {
    return { status: 'missing', message: `尚未填寫 ${label}` }
  }
  if (!regex.test(value.trim())) {
    return { status: 'invalid', message: `${label} 格式不正確`, detail: formatHint }
  }
  return { status: 'ok', message: `${label} 格式正確` }
}

async function checkAccessToken(token: string | null | undefined): Promise<BotInfoResult> {
  if (!token || !token.trim()) {
    return { status: 'missing', message: '尚未填寫 Channel Access Token' }
  }

  const botInfo = await fetchLineBotInfo(token.trim())
  if (!botInfo) {
    return {
      status: 'invalid',
      message: 'Channel Access Token 無效或已過期',
      detail: '無法向 LINE Messaging API 取得 Bot 資訊，請重新產生 Token',
    }
  }

  return {
    status: 'ok',
    message: `已連線到 LINE OA：${botInfo.displayName}`,
    bot: {
      displayName: botInfo.displayName,
      basicId:     botInfo.basicId,
      pictureUrl:  botInfo.pictureUrl,
    },
  }
}
