'use client'

// 當前 tenant 資訊 Hook

import { useEffect, useState } from 'react'
import type { Tenant } from '@/types/tenant'

interface UseTenantReturn {
  tenant: Tenant | null
  isLoading: boolean
  error: string | null
}

export function useTenant(slug: string): UseTenantReturn {
  const [tenant, setTenant] = useState<Tenant | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!slug) {
      setIsLoading(false)
      setError('Tenant slug is required')
      return
    }

    let cancelled = false

    async function fetchTenant() {
      setIsLoading(true)
      setError(null)

      try {
        const res = await fetch(`/api/tenants?slug=${encodeURIComponent(slug)}`)

        if (!res.ok) {
          throw new Error(
            `Failed to fetch tenant: ${res.status} ${res.statusText}`,
          )
        }

        const data: Tenant = await res.json()

        if (!cancelled) {
          setTenant(data)
        }
      } catch (err) {
        if (!cancelled) {
          setError(
            err instanceof Error ? err.message : 'Failed to load tenant data',
          )
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false)
        }
      }
    }

    fetchTenant()

    return () => {
      cancelled = true
    }
  }, [slug])

  return { tenant, isLoading, error }
}
