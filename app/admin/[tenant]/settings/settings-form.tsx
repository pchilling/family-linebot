'use client';

import { useActionState } from 'react';
import { updateTenantSettings, type SettingsState } from './actions';

type Props = {
  tenantSlug: string;
  defaults: {
    name: string;
    description: string;
    brand_color: string;
    og_image_url: string;
    contact_info: string;
  };
};

const initial: SettingsState = { status: 'idle' };

const label: React.CSSProperties = { display: 'flex', flexDirection: 'column', gap: 6 };
const labelText: React.CSSProperties = { fontSize: 13, color: '#444', fontWeight: 500 };
const hint: React.CSSProperties = { fontSize: 12, color: '#888', marginTop: 2 };
const input: React.CSSProperties = {
  padding: 9,
  fontSize: 14,
  border: '1px solid #ccc',
  borderRadius: 4,
  width: '100%',
  boxSizing: 'border-box',
  fontFamily: 'inherit',
};
const btn: React.CSSProperties = {
  padding: '10px 18px',
  background: '#000',
  color: '#fff',
  border: 0,
  borderRadius: 4,
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
};

export function SettingsForm({ tenantSlug, defaults }: Props) {
  const [state, formAction, pending] = useActionState(updateTenantSettings, initial);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="tenant_slug" value={tenantSlug} />

      <label style={label}>
        <span style={labelText}>店名</span>
        <input
          name="name"
          defaultValue={defaults.name}
          required
          style={input}
          placeholder="例:Cyndi 童裝代購"
        />
      </label>

      <label style={label}>
        <span style={labelText}>簡介 / Tagline</span>
        <input
          name="description"
          defaultValue={defaults.description}
          style={input}
          placeholder="會出現在公開網站 header 下方 + SEO 描述"
        />
        <span style={hint}>留空則公開頁不顯示</span>
      </label>

      <label style={label}>
        <span style={labelText}>主題色</span>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
          <input
            type="color"
            name="brand_color"
            defaultValue={defaults.brand_color || '#1f2937'}
            style={{
              width: 60,
              height: 38,
              padding: 2,
              border: '1px solid #ccc',
              borderRadius: 4,
              cursor: 'pointer',
            }}
          />
          <span style={{ fontSize: 13, color: '#666', fontFamily: 'monospace' }}>
            目前:{defaults.brand_color || '(未設,預設 #1f2937)'}
          </span>
        </div>
        <span style={hint}>店名顯示色 / 公開網站主色調</span>
      </label>

      <label style={label}>
        <span style={labelText}>分享圖網址(og:image)</span>
        <input
          name="og_image_url"
          defaultValue={defaults.og_image_url}
          type="url"
          style={input}
          placeholder="https://..."
        />
        <span style={hint}>用於 LINE / IG / Threads 分享時的預覽圖。建議 1200×630</span>
      </label>

      <label style={label}>
        <span style={labelText}>對外聯絡資訊</span>
        <textarea
          name="contact_info"
          defaultValue={defaults.contact_info}
          rows={4}
          style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder={
            'LINE: @yourshop\n電話: 0900-000-000\nEmail: hello@yourshop.com\nIG: @yourshop'
          }
        />
        <span style={hint}>
          客人下單成立頁會看到這段,知道怎麼聯絡你匯款 / 對帳 / 詢問商品。多行 free text,你愛怎麼寫就怎麼寫
        </span>
      </label>

      {state.status === 'success' && (
        <div
          style={{
            padding: '10px 14px',
            background: '#dcfce7',
            border: '1px solid #bbf7d0',
            borderRadius: 6,
            color: '#15803d',
            fontSize: 14,
            fontWeight: 500,
          }}
        >
          ✓ 已儲存{' '}
          <span style={{ fontWeight: 400, color: '#16a34a', fontSize: 12 }}>
            {new Date(state.ts).toLocaleTimeString('zh-TW', {
              timeZone: 'Asia/Taipei',
              hour: '2-digit',
              minute: '2-digit',
            })}
          </span>
        </div>
      )}

      {state.status === 'error' && (
        <div
          style={{
            padding: '10px 14px',
            background: '#fef2f2',
            border: '1px solid #fecaca',
            borderRadius: 6,
            color: '#991b1b',
            fontSize: 14,
          }}
        >
          {state.error}
        </div>
      )}

      <div>
        <button type="submit" disabled={pending} style={{ ...btn, opacity: pending ? 0.6 : 1 }}>
          {pending ? '儲存中…' : '儲存'}
        </button>
      </div>
    </form>
  );
}
