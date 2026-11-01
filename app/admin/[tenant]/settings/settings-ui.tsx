import type { ReactNode } from 'react';

/**
 * 後台「設定」頁共用樣式與版面積木(2026-11-01 改版)。
 *
 * 版型照 shadcn 的 settings 範例:一張卡片,左邊分頁導覽、右邊內容,底部一條儲存列。
 * 表單元件直接用 lib/ui.tsx(ui-btn / ui-input / ui-switch…),色票由 layout 設成後台的 zinc;
 * 這裡只補設定頁自己的版面 class(sx- 前綴)。沒有 hook,server / client 元件都能用。
 */
export const SETTINGS_CSS = `
.sx{color:#18181b}
.sx-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:20px;flex-wrap:wrap}
.sx-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em;line-height:1.15}
.sx-head p{margin:6px 0 0;font-size:13px;color:#71717a}
.sx-actions{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sx-url{display:inline-flex;align-items:center;gap:2px;height:36px;padding:0 4px 0 12px;border:1px solid #e4e4e7;border-radius:8px;background:#fff;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:12.5px;color:#52525b}
.sx-url b{color:#18181b;font-weight:500;margin-right:4px}
.sx-card{display:flex;background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;box-shadow:0 1px 2px rgba(0,0,0,.03)}
.sx-nav{width:208px;flex:none;border-right:1px solid #e4e4e7;padding:12px;display:flex;flex-direction:column;gap:2px}
.sx-nav a{display:flex;align-items:center;gap:10px;height:36px;padding:0 10px;border-radius:7px;font-size:13.5px;color:#52525b;text-decoration:none;white-space:nowrap}
.sx-nav a svg{color:#71717a}
.sx-nav a:hover{background:#fafafa;color:#18181b}
.sx-nav a[aria-current="page"]{background:#f4f4f5;color:#18181b;font-weight:600}
.sx-nav a[aria-current="page"] svg{color:#18181b}
.sx-tip{margin:auto 0 0;padding:10px 10px 4px;font-size:11.5px;color:#a1a1aa;line-height:1.5}
.sx-panel{flex:1;min-width:0;display:flex;flex-direction:column;min-height:620px}
.sx-form{display:flex;flex-direction:column;flex:1;min-height:0}
.sx-body{flex:1;padding:28px 32px 24px}
.sx-body-top{flex:0 0 auto;padding-bottom:0}
.sx-body-cont{padding-top:0}
.sx-title{margin-bottom:24px}
.sx-title h2{margin:0;font-size:17px;font-weight:600;letter-spacing:-.01em}
.sx-title p{margin:4px 0 0;font-size:13px;color:#71717a;line-height:1.5}
.sx-group{display:flex;flex-direction:column;gap:16px}
.sx-gh{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}
.sx-gh h3{margin:0;font-size:14px;font-weight:600}
.sx-gh p{margin:3px 0 0;font-size:12.5px;color:#71717a;line-height:1.5}
.sx-sep{border:0;border-top:1px solid #f4f4f5;margin:24px 0}
.sx-grid2{display:grid;grid-template-columns:1fr 1fr;gap:16px}
.sx-grid4{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sx-field{display:flex;flex-direction:column;gap:6px;min-width:0}
.sx-field .ui-label{margin:0}
.sx-optional{color:#71717a;font-weight:400;margin-left:4px}
.sx-hint{font-size:12px;color:#71717a;line-height:1.5}
.sx-ro{display:flex;align-items:center;gap:2px;height:40px;padding:0 4px 0 12px;border:1px solid #e4e4e7;border-radius:6px;background:#fafafa;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:13px;color:#52525b}
.sx-ro b{color:#18181b;font-weight:500}
.sx-ro .sx-ib{margin-left:auto}
.sx-row{display:flex;align-items:center;justify-content:space-between;gap:16px}
.sx-row .t{font-size:13.5px;font-weight:500;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sx-row .d{font-size:12.5px;color:#71717a;margin-top:2px;line-height:1.5}
.sx-foot{display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:14px 32px;border-top:1px solid #f4f4f5;background:#fff}
.sx-note{margin-right:auto;font-size:12.5px;color:#71717a}
.sx-list{display:flex;flex-direction:column;border:1px solid #e4e4e7;border-radius:8px;overflow:hidden}
.sx-li{display:flex;align-items:center;gap:12px;padding:12px 14px;border-top:1px solid #f4f4f5;background:#fff}
.sx-li:first-child{border-top:0}
.sx-li .main{flex:1;min-width:0}
.sx-li .t{font-size:13.5px;font-weight:500;display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.sx-li .d{font-size:12.5px;color:#71717a;margin-top:2px;line-height:1.5}
.sx-ops{display:flex;gap:2px;flex:none;margin:0}
.sx-ib{display:inline-flex;align-items:center;justify-content:center;width:28px;height:28px;border-radius:6px;border:0;background:transparent;color:#71717a;cursor:pointer;font:inherit;padding:0}
.sx-ib:hover{background:#f4f4f5;color:#18181b}
.sx-ib.danger:hover{color:#b91c1c;background:#fef2f2}
.sx-ib:disabled{opacity:.35;cursor:not-allowed}
.sx-badge-ok{background:#f0fdf4;color:#15803d;border-color:#bbf7d0}
.sx-badge-off{background:#f4f4f5;color:#52525b;border-color:transparent}
.sx-badge-info{background:#eff6ff;color:#1d4ed8;border-color:transparent}
.sx-chip{display:inline-flex;align-items:center;height:24px;padding:0 9px;border-radius:6px;background:#f4f4f5;font-size:12px;color:#52525b}
.sx-segwrap{display:flex;align-items:center;gap:10px;margin:0;flex:none}
.sx-seg{display:inline-flex;padding:3px;border-radius:8px;background:#f4f4f5}
.sx-seg label{position:relative;height:30px;padding:0 14px;border-radius:6px;font-size:13px;color:#52525b;display:inline-flex;align-items:center;cursor:pointer}
.sx-seg input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%}
.sx-seg label:has(input:checked){background:#fff;color:#18181b;font-weight:600;box-shadow:0 1px 2px rgba(0,0,0,.08)}
.sx-dl{display:grid;grid-template-columns:140px 1fr;gap:14px 20px;font-size:13.5px;align-items:center;margin:0}
.sx-dl dt{color:#71717a;margin:0}
.sx-dl dd{margin:0;display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.sx-callout{display:flex;gap:10px;align-items:flex-start;padding:12px 14px;border-radius:8px;background:#fafafa;border:1px solid #e4e4e7;font-size:12.5px;color:#52525b;line-height:1.5}
.sx-callout svg{margin-top:2px;color:#71717a}
.sx-err{padding:10px 14px;background:#fef2f2;border:1px solid #fecaca;border-radius:6px;color:#991b1b;font-size:13px}
.sx-dash{padding:14px;border:1px dashed #d4d4d8;border-radius:8px;display:flex;flex-direction:column;gap:12px;margin:0}
.sx-mono{font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace}
.sx-media{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}
.sx-thumb{position:relative;aspect-ratio:4/3;border-radius:8px;border:1px solid #e4e4e7;background:#f4f4f5;overflow:hidden}
.sx-thumb img,.sx-thumb video{width:100%;height:100%;object-fit:cover;display:block}
.sx-thumb .no{position:absolute;left:8px;top:8px;height:20px;padding:0 7px;border-radius:999px;background:rgba(24,24,27,.78);color:#fff;font-size:11px;font-weight:600;display:inline-flex;align-items:center}
.sx-thumb .tag{position:absolute;right:8px;top:8px}
.sx-thumb .ops{position:absolute;right:6px;bottom:6px;display:flex;gap:2px;padding:2px;border-radius:7px;background:rgba(255,255,255,.92);border:1px solid #e4e4e7}
.sx-thumb .ops form{display:contents}
.sx-thumb .ops .sx-ib{width:24px;height:24px}
.sx-thumb-add{aspect-ratio:4/3;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:6px;background:transparent;border:1px dashed #d4d4d8;border-radius:8px;color:#71717a;font-size:12.5px;cursor:pointer;font:inherit;padding:8px;text-align:center;line-height:1.4}
.sx-thumb-add:hover{background:#fafafa;color:#18181b}
.sx-thumb-add[aria-expanded="true"]{border-style:solid;border-color:#18181b;color:#18181b}
.sx-logo{width:64px;height:64px;border-radius:50%;object-fit:cover;border:1px solid #e4e4e7;flex:none;background:#f4f4f5;display:flex;align-items:center;justify-content:center;font-weight:600;font-size:20px;color:#a1a1aa}
.sx-og{width:240px;max-width:100%;aspect-ratio:1200/630;border-radius:8px;border:1px solid #e4e4e7;background:#f4f4f5;object-fit:cover;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;color:#a1a1aa}
.sx-qr{width:112px;height:112px;border-radius:8px;border:1px solid #e4e4e7;background:#fafafa;object-fit:contain;flex:none;display:flex;align-items:center;justify-content:center;font-size:12px;color:#a1a1aa;text-align:center;line-height:1.4}
.sx-color{display:flex;align-items:center;gap:8px;height:40px;padding:0 6px;border:1px solid #e4e4e7;border-radius:6px;background:#fff}
.sx-color input[type=color]{width:28px;height:28px;padding:0;border:1px solid rgba(0,0,0,.08);border-radius:5px;background:none;cursor:pointer;flex:none}
.sx-color input[type=color]::-webkit-color-swatch-wrapper{padding:0}
.sx-color input[type=color]::-webkit-color-swatch{border:0;border-radius:4px}
.sx-color input[type=text]{border:0;outline:0;background:transparent;font:inherit;font-family:var(--font-geist-mono),ui-monospace,Menlo,monospace;font-size:13.5px;width:100%;min-width:0;color:#18181b}
.sx-opt{display:flex;flex-direction:column;gap:8px;padding:10px;border:1px solid #e4e4e7;border-radius:8px;background:#fff;cursor:pointer;text-align:left;font:inherit;color:#18181b}
.sx-opt .sw{height:44px;border-radius:5px;border:1px solid #f4f4f5}
.sx-opt .lb{font-size:12.5px;font-weight:500;display:flex;justify-content:space-between;align-items:center}
.sx-opt .dot{width:14px;height:14px;border-radius:50%;border:1.5px solid #d4d4d8;box-sizing:border-box}
.sx-opt[data-on="true"]{border-color:#18181b;box-shadow:0 0 0 1px #18181b}
.sx-opt[data-on="true"] .dot{border:4.5px solid #18181b}
.sx-preview{border:1px solid #e4e4e7;border-radius:8px;overflow:hidden}
.sx-preview .ph{display:flex;align-items:center;justify-content:space-between;padding:10px 14px;border-bottom:1px solid #e4e4e7;font-size:13px;font-weight:600}
.sx-preview .ph span{font-size:12px;font-weight:400;color:#71717a}
.sx-preview .pb{display:flex;gap:10px;padding:12px 14px;align-items:center;flex-wrap:wrap}
.sx-preview .pc{width:92px;height:70px;border-radius:6px;border:1px solid #e4e4e7}
.sx-preview .pbtn{height:30px;padding:0 12px;border-radius:6px;font-size:12.5px;font-weight:600;display:inline-flex;align-items:center}
.sx-preview .ptag{height:24px;padding:0 9px;border-radius:999px;font-size:11.5px;font-weight:600;display:inline-flex;align-items:center;border:1px solid transparent}
.sx-crop{padding:12px;background:#fafafa;border:1px solid #e4e4e7;border-radius:8px;display:flex;justify-content:center;max-height:480px;overflow:auto}
.sx-ship{display:grid;grid-template-columns:150px 1.3fr .6fr .8fr 1.3fr 32px;gap:8px;align-items:center}
.sx-ship select.ui-input{width:100%}
.sx-ship-head{font-size:11.5px;color:#71717a;font-weight:500;padding:0 2px}
.sx-filebtn input{display:none}
/* 收款方式清單(2026-11-01):每種方式一張可展開的卡 */
.sx-methods{display:flex;flex-direction:column;gap:10px}
.sx-method{border:1px solid #e4e4e7;border-radius:10px;background:#fff}
.sx-method > summary{list-style:none;cursor:pointer;display:flex;align-items:center;gap:12px;padding:14px 16px}
.sx-method > summary::-webkit-details-marker{display:none}
.sx-method.static > summary{cursor:default}
.sx-method .mic{width:36px;height:36px;border-radius:8px;background:#f4f4f5;display:grid;place-items:center;color:#52525b;flex:none}
.sx-method .mt{flex:1;min-width:0}
.sx-method .mt b{font-size:14px;font-weight:600;display:block}
.sx-method .mt span{font-size:12.5px;color:#71717a;display:block;margin-top:2px;line-height:1.5}
.sx-method .mst{display:inline-flex;align-items:center;gap:5px;font-size:12.5px;color:#a1a1aa;flex:none;white-space:nowrap}
.sx-method .mst.ok{color:#15803d;font-weight:600}
.sx-method .act{display:inline-flex;align-items:center;gap:4px;height:28px;padding:0 10px;border:1px solid #e4e4e7;border-radius:6px;font-size:12.5px;color:#18181b;font-weight:500;flex:none;white-space:nowrap;background:#fff}
.sx-method .act svg{transition:transform .15s}
.sx-method[open] .act svg{transform:rotate(180deg)}
.sx-method .body{padding:4px 16px 16px;border-top:1px solid #f4f4f5;display:flex;flex-direction:column;gap:14px}
@media (max-width:767px){
  .sx-method > summary{flex-wrap:wrap;padding:12px 14px}
  .sx-method .body{padding:4px 14px 14px}
  .sx-head{flex-direction:column;align-items:flex-start}
  .sx-card{flex-direction:column;border-radius:10px}
  .sx-nav{width:auto;flex-direction:row;overflow-x:auto;border-right:0;border-bottom:1px solid #e4e4e7;padding:8px;gap:4px;scrollbar-width:none}
  .sx-nav::-webkit-scrollbar{display:none}
  .sx-nav a{height:32px;padding:0 10px;font-size:13px}
  .sx-tip{display:none}
  .sx-panel{min-height:0}
  .sx-body{padding:18px 16px}
  .sx-body-top{padding-bottom:0}
  .sx-body-cont{padding-top:0}
  .sx-foot{padding:12px 16px;position:sticky;bottom:0}
  .sx-grid2,.sx-grid4,.sx-media{grid-template-columns:1fr 1fr}
  .sx-dl{grid-template-columns:1fr;gap:4px 0}
  .sx-dl dt{margin-top:10px;font-size:12px}
  .sx-og{width:100%}
  .sx-ship{grid-template-columns:1fr 1fr 32px;padding:10px;border:1px solid #e4e4e7;border-radius:8px}
  .sx-ship > :first-child,.sx-ship > :nth-child(2),.sx-ship > :nth-child(5){grid-column:1/-1}
  .sx-ship-head{display:none}
}
`;

export function PanelTitle({ title, desc }: { title: string; desc?: ReactNode }) {
  return (
    <div className="sx-title">
      <h2>{title}</h2>
      {desc && <p>{desc}</p>}
    </div>
  );
}

export function GroupHead({ title, desc, right }: { title: ReactNode; desc?: ReactNode; right?: ReactNode }) {
  return (
    <div className="sx-gh">
      <div>
        <h3>{title}</h3>
        {desc && <p>{desc}</p>}
      </div>
      {right}
    </div>
  );
}

export function Field({
  label,
  optional,
  hint,
  htmlFor,
  children,
}: {
  label: ReactNode;
  optional?: boolean;
  hint?: ReactNode;
  htmlFor?: string;
  children: ReactNode;
}) {
  return (
    <div className="sx-field">
      <label className="ui-label" htmlFor={htmlFor}>
        {label}
        {optional && <span className="sx-optional">選填</span>}
      </label>
      {children}
      {hint && <span className="sx-hint">{hint}</span>}
    </div>
  );
}

/** 左邊標題與說明、右邊放開關或控制項的一列 */
export function SwitchRow({ title, desc, control }: { title: ReactNode; desc?: ReactNode; control: ReactNode }) {
  return (
    <div className="sx-row">
      <div>
        <div className="t">{title}</div>
        {desc && <div className="d">{desc}</div>}
      </div>
      {control}
    </div>
  );
}
