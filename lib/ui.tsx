/**
 * 公開商店共用元件組(Phase 24,2026-10-23)
 *
 * 樣式照 shadcn 的風格手刻(白底、zinc 灰階、6px 圓角、細邊框),不裝 Tailwind、不裝套件。
 * 顏色一律吃 lib/theme.ts 給的 CSS 變數(--ui-*),所以店家換品牌色這裡全部跟著變。
 * 這個檔案沒有 hook,server component 與 client component 都能用;
 * 需要狀態的互動(底部抽屜開關等)由用它的頁面自己管。
 *
 * 用法:頁面 layout 先注入一次 <style>{UI_CSS}</style>,之後直接用 className 或這些元件。
 */
import type { CSSProperties, ReactNode, AnchorHTMLAttributes, ButtonHTMLAttributes, InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';

export const UI_CSS = `
.ui-num{font-variant-numeric:tabular-nums}
.ui-muted{color:var(--ui-muted)}
.ui-wrap{width:100%;max-width:1360px;box-sizing:border-box;margin:0 auto;padding:0 40px}
@media (max-width:1024px){.ui-wrap{padding:0 20px}}
.ui-btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;white-space:nowrap;border-radius:6px;font:inherit;font-size:14px;font-weight:500;line-height:1;cursor:pointer;border:1px solid transparent;text-decoration:none;transition:background .15s,color .15s,border-color .15s,opacity .15s;-webkit-tap-highlight-color:transparent}
.ui-btn:disabled,.ui-btn[aria-disabled="true"]{pointer-events:none;opacity:.5}
.ui-btn:focus-visible{outline:2px solid var(--ui-faint);outline-offset:2px}
.ui-btn-primary{background:var(--ui-accent);color:var(--ui-on-accent)}.ui-btn-primary:hover{opacity:.9}
.ui-btn-outline{border-color:var(--ui-line);background:var(--ui-surface);color:var(--ui-ink)}.ui-btn-outline:hover{background:var(--ui-line-soft)}
.ui-btn-ghost{background:transparent;color:var(--ui-muted)}.ui-btn-ghost:hover{background:var(--ui-line-soft);color:var(--ui-ink)}
.ui-btn-link{background:transparent;color:var(--ui-muted);text-underline-offset:4px;padding:0;height:auto}.ui-btn-link:hover{text-decoration:underline;color:var(--ui-ink)}
.ui-btn-xs{height:28px;padding:0 8px;font-size:12px}
.ui-btn-sm{height:36px;padding:0 12px}
.ui-btn-md{height:40px;padding:0 16px}
.ui-btn-lg{height:48px;padding:0 24px;font-size:15px}
.ui-btn-icon{width:36px;padding:0}
.ui-badge{display:inline-flex;align-items:center;gap:4px;border-radius:999px;border:1px solid var(--ui-line);padding:2px 10px;font-size:12px;font-weight:600;line-height:1.4;color:var(--ui-ink);background:var(--ui-surface);white-space:nowrap}
.ui-badge-solid{border-color:transparent;background:var(--ui-accent);color:var(--ui-on-accent)}
.ui-badge-wash{border-color:var(--ui-wash-line);background:var(--ui-wash);color:var(--ui-accent-ink)}
.ui-input{height:40px;padding:0 12px;border:1px solid var(--ui-line);border-radius:6px;font:inherit;font-size:14px;background:var(--ui-surface);color:var(--ui-ink);width:100%;box-sizing:border-box;transition:border-color .15s}
.ui-input::placeholder{color:var(--ui-faint)}
.ui-input:hover{border-color:#d4d4d8}
.ui-input:focus-visible{outline:2px solid var(--ui-faint);outline-offset:2px}
.ui-input:disabled{opacity:.5;cursor:not-allowed}
textarea.ui-input{height:auto;padding:10px 12px;resize:vertical;min-height:88px;line-height:1.5}
select.ui-input{appearance:none;-webkit-appearance:none;padding-right:32px;background:var(--ui-surface) url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='16' height='16' viewBox='0 0 24 24' fill='none' stroke='%2371717a' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'><path d='m6 9 6 6 6-6'/></svg>") no-repeat right 10px center;cursor:pointer}
.ui-input-sm{height:36px}
.ui-label{display:block;font-size:13px;font-weight:500;color:var(--ui-ink);margin-bottom:6px}
.ui-label i{color:#b91c1c;font-style:normal;margin-left:2px}
.ui-cb{appearance:none;-webkit-appearance:none;width:16px;height:16px;margin:0;border-radius:4px;border:1px solid var(--ui-accent);background:var(--ui-surface);display:inline-grid;place-items:center;cursor:pointer;flex-shrink:0;vertical-align:middle}
.ui-cb:checked{background:var(--ui-accent);background-image:url("data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='white' stroke-width='3' stroke-linecap='round' stroke-linejoin='round'><path d='M20 6 9 17l-5-5'/></svg>");background-size:12px;background-repeat:no-repeat;background-position:center}
.ui-cb:focus-visible{outline:2px solid var(--ui-faint);outline-offset:2px}
.ui-cb:disabled{opacity:.5;cursor:not-allowed}
.ui-radio{appearance:none;-webkit-appearance:none;width:16px;height:16px;margin:0;border-radius:50%;border:1px solid var(--ui-accent);background:var(--ui-surface);display:inline-grid;place-items:center;cursor:pointer;flex-shrink:0}
.ui-radio::after{content:"";width:8px;height:8px;border-radius:50%;background:transparent}
.ui-radio:checked::after{background:var(--ui-accent)}
.ui-radio:focus-visible{outline:2px solid var(--ui-faint);outline-offset:2px}
.ui-switch{position:relative;display:inline-flex;width:44px;height:24px;border-radius:999px;background:var(--ui-line);border:2px solid transparent;transition:background .15s;flex-shrink:0;cursor:pointer;box-sizing:border-box}
.ui-switch::after{content:"";width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 3px rgba(0,0,0,.2);transition:transform .15s}
.ui-switch:has(input:checked){background:var(--ui-accent)}
.ui-switch:has(input:checked)::after{transform:translateX(20px)}
.ui-switch:has(input:focus-visible){outline:2px solid var(--ui-faint);outline-offset:2px}
.ui-switch input{position:absolute;inset:0;opacity:0;margin:0;cursor:pointer;width:100%;height:100%}
.ui-card{border:1px solid var(--ui-line);border-radius:10px;background:var(--ui-surface)}
.ui-opt{display:flex;align-items:flex-start;gap:12px;padding:14px 16px;border:1px solid var(--ui-line);border-radius:8px;background:var(--ui-surface);cursor:pointer;text-align:left;font:inherit;color:var(--ui-ink);width:100%;box-sizing:border-box;transition:border-color .15s,box-shadow .15s,background .15s}
.ui-opt:hover{background:#fafafa}
.ui-opt[data-on="true"]{border-color:var(--ui-accent);box-shadow:0 0 0 1px var(--ui-accent)}
.ui-sheet-scrim{position:fixed;inset:0;background:rgba(0,0,0,.8);z-index:40;animation:ui-fade .2s ease both}
.ui-sheet{position:fixed;left:0;right:0;bottom:0;z-index:41;max-height:85svh;overflow:auto;background:var(--ui-surface);border-radius:12px 12px 0 0;border-top:1px solid var(--ui-line);padding:0 24px;box-shadow:0 -10px 30px rgba(0,0,0,.12);animation:ui-up .3s cubic-bezier(.22,1,.36,1) both}
.ui-sheet-head{display:flex;flex-direction:column;gap:6px;padding:20px 0 16px;border-bottom:1px solid var(--ui-line)}
.ui-sheet-head h3{margin:0;font-size:18px;font-weight:600}
.ui-sheet-head p{margin:0;font-size:14px;color:var(--ui-muted)}
.ui-sheet-foot{display:flex;gap:8px;position:sticky;bottom:0;background:var(--ui-surface);padding:16px 0 20px;border-top:1px solid var(--ui-line)}
.ui-spin{display:inline-block;width:16px;height:16px;border:2px solid var(--ui-line);border-top-color:var(--ui-ink);border-radius:50%;animation:ui-spin .8s linear infinite}
/* fill-mode 用 backwards 不用 both:both 會在動畫結束後留一個單位矩陣的 transform,
   讓這層變成底下 position:fixed 元素(手機底列、全畫面遮罩、toast)的定位基準,整個釘錯地方 */
.ui-enter{animation:ui-enter .5s cubic-bezier(.22,1,.36,1) backwards}
.ui-swap{animation:ui-swap .25s cubic-bezier(.22,1,.36,1) backwards}
.ui-hide-mobile{display:initial}
.ui-only-mobile{display:none}
@media (max-width:1024px){.ui-hide-mobile{display:none !important}.ui-only-mobile{display:initial}}
@keyframes ui-fade{from{opacity:0}to{opacity:1}}
@keyframes ui-up{from{transform:translateY(24px);opacity:0}to{transform:none;opacity:1}}
@keyframes ui-spin{to{transform:rotate(360deg)}}
@keyframes ui-enter{from{opacity:0;transform:translateY(16px)}to{opacity:1;transform:none}}
@keyframes ui-swap{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:none}}
@media (prefers-reduced-motion:reduce){.ui-enter,.ui-swap,.ui-sheet,.ui-sheet-scrim{animation:none}}
`;

type Variant = 'primary' | 'outline' | 'ghost' | 'link';
type Size = 'xs' | 'sm' | 'md' | 'lg';

function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(' ');
}

export function Button({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size }) {
  return <button className={cx('ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`, className)} {...props} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 'md',
  className,
  ...props
}: AnchorHTMLAttributes<HTMLAnchorElement> & { variant?: Variant; size?: Size }) {
  return <a className={cx('ui-btn', `ui-btn-${variant}`, `ui-btn-${size}`, className)} {...props} />;
}

export function Badge({
  variant = 'outline',
  className,
  style,
  children,
}: {
  variant?: 'outline' | 'solid' | 'wash';
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
}) {
  return (
    <span className={cx('ui-badge', variant !== 'outline' && `ui-badge-${variant}`, className)} style={style}>
      {children}
    </span>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cx('ui-input', className)} {...props} />;
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cx('ui-input', className)} {...props} />;
}

export function Textarea({ className, ...props }: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={cx('ui-input', className)} {...props} />;
}

export function Checkbox({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="checkbox" className={cx('ui-cb', className)} {...props} />;
}

export function Radio({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return <input type="radio" className={cx('ui-radio', className)} {...props} />;
}

/** 開關:包一個隱形 checkbox,樣式靠 :has(input:checked) */
export function Switch({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <span className={cx('ui-switch', className)}>
      <input type="checkbox" {...props} />
    </span>
  );
}

const STAR_PATH = 'M12 2.5l2.9 6.1 6.7.8-4.9 4.6 1.3 6.6L12 17.3l-6 3.3 1.3-6.6L2.4 9.4l6.7-.8z';

/**
 * 星等(Phase 25):5 顆星,依 value 填滿比例,半顆也畫得出來。
 * 底層 5 顆灰星,上層一條裁切寬度的黃星;純 CSS/SVG,server component 也能用。
 */
export function Stars({ value, size = 14, gap = 2 }: { value: number; size?: number; gap?: number }) {
  const pct = Math.max(0, Math.min(5, value)) / 5 * 100;
  const row = (color: string) => (
    <span style={{ display: 'inline-flex', gap }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <svg key={i} width={size} height={size} viewBox="0 0 24 24" fill={color} aria-hidden style={{ flexShrink: 0 }}>
          <path d={STAR_PATH} />
        </svg>
      ))}
    </span>
  );
  return (
    <span style={{ position: 'relative', display: 'inline-flex', lineHeight: 0, verticalAlign: 'middle' }} role="img" aria-label={`${value.toFixed(1)} 顆星(滿分 5 顆)`}>
      {row('#e4e4e7')}
      <span style={{ position: 'absolute', inset: 0, overflow: 'hidden', width: `${pct}%` }}>{row('#f59e0b')}</span>
    </span>
  );
}

export function Card({ className, style, children }: { className?: string; style?: CSSProperties; children: ReactNode }) {
  return (
    <div className={cx('ui-card', className)} style={style}>
      {children}
    </div>
  );
}

/**
 * 單選卡片(配送方式、付款方式用):整張可點,左邊圓點,右邊可放價格或標籤。
 * 用 button 而不是 label+radio,是為了鍵盤與讀屏都當成一個可按的東西。
 */
export function OptionCard({
  on,
  onSelect,
  icon,
  title,
  trailing,
  desc,
  note,
  name,
  value,
}: {
  on: boolean;
  onSelect: () => void;
  icon?: ReactNode;
  title: ReactNode;
  trailing?: ReactNode;
  desc?: ReactNode;
  note?: ReactNode;
  /** 帶 name/value 的話會順便放一個隱藏 radio,讓 form 送出時拿得到值 */
  name?: string;
  value?: string;
}) {
  return (
    <button type="button" className="ui-opt" data-on={on ? 'true' : 'false'} onClick={onSelect} aria-pressed={on}>
      {name && value && <input type="radio" name={name} value={value} checked={on} readOnly tabIndex={-1} style={{ position: 'absolute', opacity: 0, width: 0, height: 0 }} />}
      <span
        aria-hidden
        style={{
          width: 16, height: 16, borderRadius: '50%', border: `1px solid ${on ? 'var(--ui-accent)' : 'var(--ui-ink)'}`,
          display: 'grid', placeItems: 'center', flexShrink: 0, marginTop: 2,
          background: on ? 'radial-gradient(circle, var(--ui-on-accent) 0 3px, var(--ui-accent) 3.5px)' : 'var(--ui-surface)',
        }}
      />
      {icon && (
        <span aria-hidden style={{ width: 32, height: 32, borderRadius: 6, background: 'var(--ui-line-soft)', display: 'grid', placeItems: 'center', color: '#52525b', flexShrink: 0 }}>
          {icon}
        </span>
      )}
      <span style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 3 }}>
        <span style={{ fontSize: 14, fontWeight: 500, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
          <span>{title}</span>
          {trailing}
        </span>
        {desc && <span style={{ fontSize: 12.5, color: 'var(--ui-muted)', lineHeight: 1.55 }}>{desc}</span>}
        {note && <span style={{ fontSize: 12, color: '#b45309', lineHeight: 1.55 }}>{note}</span>}
      </span>
    </button>
  );
}
