'use client'

import { useEffect } from 'react'

// 當 DashboardLayout 偵測到 env_updated_at 更新時，此元件負責把新值寫入
// non-httpOnly cookie，供下次 server render 比對用。
export default function EnvVersionSync({ envVer }: { envVer: string | null }) {
  useEffect(() => {
    if (!envVer) return
    document.cookie = `joka-env-ver=${encodeURIComponent(envVer)}; path=/dashboard; SameSite=Lax; max-age=86400`
  }, [envVer])
  return null
}
