'use client';

/**
 * 運費規則編輯(2026-11-01):每種配送方式一列,直接在列上改,按儲存一次存整個陣列。
 * key(結帳與訂單記的代號)既有的不動,新列由這裡產生,攤主看不到也不用管。
 */
import { useActionState, useState } from 'react';
import { Button, Input } from '@/lib/ui';
import { IconPlus, IconTrash } from '@/lib/icons';
import { FlashToast } from '../../../_components/toast';
import { GroupHead, PanelTitle } from './settings-ui';
import { saveShippingRules, type SettingsState } from './actions';

export type ShippingOption = { key: string; label: string; fee: number; free_over?: number; note?: string };

type Draft = { key: string; label: string; fee: string; free_over: string; note: string };

const initialState: SettingsState = { status: 'idle' };

function newKey(): string {
  return `opt-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`;
}

export function ShippingRules({ tenantSlug, initial }: { tenantSlug: string; initial: ShippingOption[] }) {
  const [state, formAction, pending] = useActionState(saveShippingRules, initialState);
  const [rows, setRows] = useState<Draft[]>(() =>
    initial.map((o) => ({
      key: o.key,
      label: o.label,
      fee: String(o.fee),
      free_over: o.free_over != null ? String(o.free_over) : '',
      note: o.note ?? '',
    })),
  );

  const update = (i: number, patch: Partial<Draft>) =>
    setRows((rs) => rs.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const remove = (i: number) => {
    if (!window.confirm('刪除這種配送方式?按儲存後才會生效。')) return;
    setRows((rs) => rs.filter((_, j) => j !== i));
  };
  const add = () => setRows((rs) => [...rs, { key: newKey(), label: '', fee: '0', free_over: '', note: '' }]);

  const payload = JSON.stringify(
    rows.map((r) => ({
      key: r.key,
      label: r.label,
      fee: r.fee === '' ? null : Number(r.fee),
      free_over: r.free_over === '' ? null : Number(r.free_over),
      note: r.note,
    })),
  );

  return (
    <form action={formAction} className="sx-form">
      <input type="hidden" name="tenant_slug" value={tenantSlug} />
      <input type="hidden" name="options" value={payload} />

      <div className="sx-body">
        <PanelTitle title="配送" desc="客人結帳時能選的配送方式與運費。一種都沒有就是不收運費,結帳也不用選。" />

        <div className="sx-group">
          <GroupHead
            title="配送方式與運費"
            desc="免運門檻以商品小計(折扣後)計算,留空就沒有免運。"
            right={
              <Button type="button" variant="outline" size="sm" onClick={add}>
                <IconPlus size={14} />
                新增方式
              </Button>
            }
          />

          {rows.length === 0 ? (
            <div className="sx-callout">目前沒有配送方式,結帳不會收運費。</div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <div className="sx-ship sx-ship-head" aria-hidden>
                <span>名稱</span>
                <span>運費</span>
                <span>免運門檻</span>
                <span>給客人的說明</span>
                <span />
              </div>
              {rows.map((r, i) => (
                <div key={r.key} className="sx-ship">
                  <Input
                    className="ui-input-sm"
                    value={r.label}
                    onChange={(e) => update(i, { label: e.target.value })}
                    placeholder="名稱,例:宅配・一般地區"
                    maxLength={40}
                    required
                    aria-label="名稱"
                  />
                  <Input
                    className="ui-input-sm"
                    type="number"
                    min={0}
                    step={1}
                    value={r.fee}
                    onChange={(e) => update(i, { fee: e.target.value })}
                    placeholder="運費"
                    required
                    aria-label="運費"
                  />
                  <Input
                    className="ui-input-sm"
                    type="number"
                    min={1}
                    step={1}
                    value={r.free_over}
                    onChange={(e) => update(i, { free_over: e.target.value })}
                    placeholder="免運門檻"
                    aria-label="免運門檻"
                  />
                  <Input
                    className="ui-input-sm"
                    value={r.note}
                    onChange={(e) => update(i, { note: e.target.value })}
                    placeholder="給客人的說明(選填)"
                    maxLength={120}
                    aria-label="給客人的說明"
                  />
                  <button type="button" className="sx-ib danger" onClick={() => remove(i)} title="刪除" aria-label="刪除">
                    <IconTrash size={15} />
                  </button>
                </div>
              ))}
            </div>
          )}
          <span className="sx-hint">超商店到店還沒開放,做好之後會出現在這裡。</span>
        </div>

        {state.status === 'error' && <div className="sx-err" style={{ marginTop: 16 }}>{state.error}</div>}
      </div>

      {state.status === 'success' && <FlashToast key={state.ts} message="已儲存配送設定" />}

      <div className="sx-foot">
        <span className="sx-note">改完要按儲存才會生效。</span>
        <Button type="submit" size="sm" disabled={pending}>
          {pending ? '儲存中…' : '儲存變更'}
        </Button>
      </div>
    </form>
  );
}
