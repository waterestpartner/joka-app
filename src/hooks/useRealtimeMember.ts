'use client'

// LIFF 專用：訂閱 members / point_transactions / member_coupons 的即時變更
// 用法：在頁面拿到 memberId 之後呼叫對應的 hook

import { useEffect } from 'react'
import { createSupabaseBrowserClient } from '@/lib/supabase'
import type { Member, PointTransaction } from '@/types/member'
import type { MemberCoupon } from '@/types/coupon'

// ── 會員本身變更（points, tier, name…）──────────────────────────────
export function useRealtimeMember(
  memberId: string | null | undefined,
  onUpdate: (next: Partial<Member>) => void
) {
  useEffect(() => {
    if (!memberId) return

    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`rt-member:${memberId}`)
      .on(
        'postgres_changes',
        {
          event: 'UPDATE',
          schema: 'public',
          table: 'members',
          filter: `id=eq.${memberId}`,
        },
        (payload) => {
          onUpdate(payload.new as Partial<Member>)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])
}

// ── 點數交易（新增紀錄時 prepend 到列表）────────────────────────────
export function useRealtimePointTransactions(
  memberId: string | null | undefined,
  onInsert: (tx: PointTransaction) => void
) {
  useEffect(() => {
    if (!memberId) return

    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`rt-point-tx:${memberId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'point_transactions',
          filter: `member_id=eq.${memberId}`,
        },
        (payload) => {
          onInsert(payload.new as PointTransaction)
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])
}

// ── 會員優惠券（新增 / 狀態變更時重抓列表）──────────────────────────
// 不直接帶 payload：member_coupons 沒有 JOIN coupons 的資訊，交給呼叫者重抓
export function useRealtimeMemberCoupons(
  memberId: string | null | undefined,
  onChange: (payload: { eventType: 'INSERT' | 'UPDATE' | 'DELETE'; row: MemberCoupon }) => void
) {
  useEffect(() => {
    if (!memberId) return

    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel(`rt-coupons:${memberId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'member_coupons',
          filter: `member_id=eq.${memberId}`,
        },
        (payload) => {
          onChange({
            eventType: payload.eventType as 'INSERT' | 'UPDATE' | 'DELETE',
            row: payload.new as MemberCoupon,
          })
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [memberId])
}
