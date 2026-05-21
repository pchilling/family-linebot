'use client';

import { useEffect } from 'react';
import { markAllSupportAsRead } from './actions';

/**
 * Page mount 2 秒後自動把所有未讀 support 訊息標為已讀。
 * 延遲是為了讓 admin 進來能先看到 unread highlight,再淡掉。
 */
export function MarkReadOnMount({ tenantSlug }: { tenantSlug: string }) {
  useEffect(() => {
    const t = window.setTimeout(() => {
      markAllSupportAsRead(tenantSlug).catch((e) => {
        console.warn('[markAllSupportAsRead]', e);
      });
    }, 2000);
    return () => window.clearTimeout(t);
  }, [tenantSlug]);

  return null;
}
