'use client';

import { useActionState } from 'react';
import { updateTenantSettings, type SettingsState } from './actions';

/**
 * 攤位設定主表單。
 * 2026-09-05 重整版面:欄位分三組(基本資料 / 商城外觀 / 聯絡與金流),
 * 三個顏色選擇器併一排;分享圖(og_image_url)改由頁面上的「連結分享預覽圖」
 * 上傳區獨佔管理,不再放表單欄位(原本兩處管同一值,容易互蓋)。
 */
type Props = {
  tenantSlug: string;
  defaults: {
    name: string;
    description: string;
    brand_color: string;
    shop_bg_color: string;
    header_bg_color: string;
    contact_info: string;
    payment_info: string;
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
const groupTitle: React.CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  color: '#71717a',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  paddingBottom: 6,
  borderBottom: '1px solid #eee',
  marginTop: 8,
};

function ColorField({
  name,
  title,
  current,
  fallback,
  fallbackLabel,
}: {
  name: string;
  title: string;
  current: string;
  fallback: string;
  fallbackLabel: string;
}) {
  return (
    <label style={{ ...label, flex: '1 1 140px' }}>
      <span style={labelText}>{title}</span>
      <input
        type="color"
        name={name}
        defaultValue={current || fallback}
        style={{
          width: '100%',
          height: 38,
          padding: 2,
          border: '1px solid #ccc',
          borderRadius: 4,
          cursor: 'pointer',
        }}
      />
      <span style={{ fontSize: 11, color: '#888', fontFamily: 'monospace' }}>
        {current || fallbackLabel}
      </span>
    </label>
  );
}

export function SettingsForm({ tenantSlug, defaults }: Props) {
  const [state, formAction, pending] = useActionState(updateTenantSettings, initial);

  return (
    <form action={formAction} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <input type="hidden" name="tenant_slug" value={tenantSlug} />

      {/* ── 基本資料 ── */}
      <div style={{ ...groupTitle, marginTop: 0 }}>🏪 基本資料</div>

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

      {/* ── 商城外觀 ── */}
      <div style={groupTitle}>🎨 商城外觀</div>

      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <ColorField
          name="brand_color"
          title="主題色"
          current={defaults.brand_color}
          fallback="#1f2937"
          fallbackLabel="未設(#1f2937)"
        />
        <ColorField
          name="shop_bg_color"
          title="商城底色"
          current={defaults.shop_bg_color}
          fallback="#fafafa"
          fallbackLabel="未設(淺灰)"
        />
        <ColorField
          name="header_bg_color"
          title="頂部列底色"
          current={defaults.header_bg_color}
          fallback="#ffffff"
          fallbackLabel="未設(白色)"
        />
      </div>
      <span style={{ ...hint, marginTop: -6 }}>
        主題色 = 店名文字色;底色建議淺色(深色會看不清文字);頂部列是公開商城最上面放 logo / 購物車的那條
      </span>

      {/* ── 聯絡與金流 ── */}
      <div style={groupTitle}>💬 聯絡與金流</div>

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

      <label style={label}>
        <span style={labelText}>匯款資訊</span>
        <textarea
          name="payment_info"
          defaultValue={defaults.payment_info}
          rows={5}
          style={{ ...input, fontFamily: 'inherit', resize: 'vertical' }}
          placeholder={
            '【匯款資訊】\n銀行：玉山銀行 (808)\n帳號：1234-5678-9012-345\n戶名：王小明\n\n匯款後請告知後 5 碼,我們會盡快對帳'
          }
        />
        <span style={hint}>
          訂單成立後客人會立刻在「訂單成立頁」看到這段。建議寫清楚銀行 / 帳號 / 戶名 / 後續流程
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
