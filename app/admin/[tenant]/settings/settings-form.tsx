'use client';

/**
 * 設定頁的兩個文字表單(2026-11-01 改版):
 * - BasicForm:基本資料分頁(店名、簡介、聯絡資訊)
 * - LookForm:外觀分頁最下面的品牌色 + 底色風格,附即時預覽
 * 兩個都打 updateTenantSettings,它只更新表單有帶的欄位。
 */
import { useActionState, useMemo, useState } from 'react';
import { Button, Input, Textarea } from '@/lib/ui';
import { BG_STYLES, derivePalette, type BgStyle } from '@/lib/theme';
import { FlashToast } from '../../../_components/toast';
import { Field, GroupHead, PanelTitle } from './settings-ui';
import { CopyButton } from './settings-client';
import { updateTenantSettings, type SettingsState } from './actions';

const initial: SettingsState = { status: 'idle' };

export function BasicForm({
  tenantSlug,
  publicHost,
  publicUrl,
  defaults,
}: {
  tenantSlug: string;
  publicHost: string;
  publicUrl: string;
  defaults: { name: string; description: string; contact_info: string };
}) {
  const [state, formAction, pending] = useActionState(updateTenantSettings, initial);

  return (
    <form action={formAction} className="sx-form">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <div className="sx-body">
        <PanelTitle title="基本資料" desc="店名、簡介與聯絡方式。公開頁和訂單頁都會用到。" />

        <div className="sx-group">
          <div className="sx-grid2">
            <Field label="店名" htmlFor="f-name">
              <Input id="f-name" name="name" defaultValue={defaults.name} required maxLength={40} placeholder="例:Cyndi 童裝代購" />
            </Field>
            <Field label="公開網址" hint="網址不能自己改,需要改請聯繫 NEOP。">
              <div className="sx-ro">
                {publicHost}/<b>{tenantSlug}</b>
                <CopyButton text={publicUrl} title="複製網址" />
              </div>
            </Field>
          </div>
          <Field label="簡介" optional htmlFor="f-desc" hint="顯示在公開頁店名下方,也會當成搜尋結果和分享連結的說明。">
            <Input id="f-desc" name="description" defaultValue={defaults.description} maxLength={160} placeholder="例:一瓶油,三種用法。" />
          </Field>
        </div>

        <hr className="sx-sep" />

        <div className="sx-group">
          <GroupHead title="對外聯絡資訊" desc="客人下單完成後會看到這段,用來詢問商品或對帳。一行一項。" />
          <Textarea
            name="contact_info"
            rows={4}
            defaultValue={defaults.contact_info}
            placeholder={'LINE:@yourshop\n電話:0900-000-000\nEmail:hello@yourshop.com'}
            aria-label="對外聯絡資訊"
          />
        </div>

        {state.status === 'error' && <div className="sx-err" style={{ marginTop: 16 }}>{state.error}</div>}
      </div>

      {state.status === 'success' && <FlashToast key={state.ts} message="已儲存基本資料" />}

      <div className="sx-foot">
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? '儲存中…' : '儲存變更'}
        </Button>
      </div>
    </form>
  );
}

const HEX = /^#[0-9a-fA-F]{6}$/;

export function LookForm({
  tenantSlug,
  tenantName,
  brandColor,
  bgStyle,
}: {
  tenantSlug: string;
  tenantName: string;
  brandColor: string | null;
  bgStyle: BgStyle;
}) {
  const [state, formAction, pending] = useActionState(updateTenantSettings, initial);
  const [color, setColor] = useState(brandColor ?? '#18181b');
  const [bg, setBg] = useState<BgStyle>(bgStyle);
  const valid = HEX.test(color);
  const palette = useMemo(() => derivePalette(valid ? color : '#18181b', bg), [color, bg, valid]);

  return (
    <form action={formAction} className="sx-form">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <input type="hidden" name="brand_color" value={valid ? color : ''} />
      <input type="hidden" name="bg_style" value={bg} />

      <div className="sx-body sx-body-cont">
        <hr className="sx-sep" style={{ marginTop: 0 }} />
        <div className="sx-group">
          <GroupHead
            title="品牌色與底色"
            desc="只選一個品牌色和一種底色風格,按鈕、標籤、連結的顏色會自動算出來,整站都協調。"
          />
          <div className="sx-grid2">
            <Field label="品牌色" hint={valid ? '用在按鈕、選中狀態這些小面積。' : '色碼要像 #1F2937 這樣六碼。'}>
              <div className="sx-color">
                <input
                  type="color"
                  value={valid ? color : '#18181b'}
                  onChange={(e) => setColor(e.target.value)}
                  aria-label="挑選品牌色"
                />
                <input
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value.trim())}
                  maxLength={7}
                  spellCheck={false}
                  aria-label="品牌色色碼"
                />
              </div>
            </Field>
            <Field label="底色風格">
              <div className="sx-grid4">
                {BG_STYLES.map((s) => {
                  const p = derivePalette('#18181b', s.key);
                  const on = bg === s.key;
                  return (
                    <button
                      key={s.key}
                      type="button"
                      className="sx-opt"
                      data-on={on ? 'true' : 'false'}
                      aria-pressed={on}
                      onClick={() => setBg(s.key)}
                    >
                      <span className="sw" style={{ background: p.bg }} />
                      <span className="lb">
                        {s.label}
                        <span className="dot" />
                      </span>
                    </button>
                  );
                })}
              </div>
            </Field>
          </div>

          <div className="sx-preview" style={{ background: palette.bg }}>
            <div className="ph" style={{ background: palette.header, borderColor: palette.line, color: palette.ink }}>
              {tenantName}
              <span>預覽</span>
            </div>
            <div className="pb">
              <span className="pc" style={{ background: palette.surface, borderColor: palette.line }} />
              <span className="pc" style={{ background: palette.surface, borderColor: palette.line }} />
              <span className="pbtn" style={{ background: palette.accent, color: palette.onAccent }}>
                加入購物車
              </span>
              <span className="ptag" style={{ background: palette.wash, color: palette.accentInk, borderColor: palette.washLine }}>
                已選 250ml
              </span>
            </div>
          </div>
        </div>

        {state.status === 'error' && <div className="sx-err" style={{ marginTop: 16 }}>{state.error}</div>}
      </div>

      {state.status === 'success' && <FlashToast key={state.ts} message="已儲存外觀" />}

      <div className="sx-foot">
        <span className="sx-note">品牌色與底色要按儲存才會生效;圖片上傳後立即生效。</span>
        <Button type="submit" size="sm" disabled={pending || !valid}>
          {pending ? '儲存中…' : '儲存變更'}
        </Button>
      </div>
    </form>
  );
}
