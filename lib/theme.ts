/**
 * 攤位色彩系統(Phase 24,2026-10-23)
 *
 * 店家只選「一個品牌色」+「底色風格」四選一,其餘顏色全部由這裡算出來:
 * 品牌色只落在按鈕、勾選、拉桿、開關、選中狀態這些小面積;底色、邊線、文字永遠是
 * 中性的淺灰白。這樣店家不管挑什麼顏色,整站都協調,不會再出現「自選背景色很土」。
 *
 * 顏色用 OKLCH 算(感知均勻,同一個亮度不同色相看起來一樣亮),輸出成 hex 給 CSS 變數,
 * 舊瀏覽器也吃得到。頁面與共用元件一律用 CSS 變數(--ui-*),不要再寫死顏色。
 */

export type BgStyle = 'white' | 'warm' | 'cream' | 'cool';
export const BG_STYLES: { key: BgStyle; label: string }[] = [
  { key: 'white', label: '純白' },
  { key: 'warm', label: '暖白' },
  { key: 'cream', label: '奶油' },
  { key: 'cool', label: '冷白' },
];

export type Palette = {
  accent: string; // 品牌主色(按鈕、選中)
  onAccent: string; // 主色上的文字
  accentInk: string; // 主色當文字用(要比主色再深一點才看得清)
  wash: string; // 主色極淡底(已選標籤、提示塊)
  washLine: string; // 淡底的邊線
  bg: string; // 頁面底色
  header: string; // 頂部列底色
  surface: string; // 卡片底色
  line: string; // 邊線
  lineSoft: string; // 更淡的分隔線
  ink: string; // 主要文字
  muted: string; // 次要文字
  faint: string; // 最淡的文字 / 停用
};

type Oklch = { L: number; C: number; H: number };

function hexToRgb(hex: string): [number, number, number] | null {
  const h = hex.trim().replace('#', '');
  const v = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
  return [0, 2, 4].map((i) => parseInt(v.slice(i, i + 2), 16) / 255) as [number, number, number];
}
const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

function rgbToOklch([r, g, b]: [number, number, number]): Oklch {
  const lr = toLinear(r);
  const lg = toLinear(g);
  const lb = toLinear(b);
  const l = Math.cbrt(0.4122214708 * lr + 0.5363325363 * lg + 0.0514459929 * lb);
  const m = Math.cbrt(0.2119034982 * lr + 0.6806995451 * lg + 0.1073969566 * lb);
  const s = Math.cbrt(0.0883024619 * lr + 0.2817188376 * lg + 0.6299787005 * lb);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const a = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const bb = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  let H = (Math.atan2(bb, a) * 180) / Math.PI;
  if (H < 0) H += 360;
  return { L, C: Math.sqrt(a * a + bb * bb), H };
}

function oklchToLinearRgb({ L, C, H }: Oklch): [number, number, number] {
  const a = C * Math.cos((H * Math.PI) / 180);
  const b = C * Math.sin((H * Math.PI) / 180);
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ * l_ * l_;
  const m = m_ * m_ * m_;
  const s = s_ * s_ * s_;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

/** OKLCH → hex;超出 sRGB 色域就逐步降低彩度直到進得去(亮度不動,顏色看起來才一致) */
export function oklchToHex(L: number, C: number, H: number): string {
  let c = C;
  for (let i = 0; i < 24; i++) {
    const rgb = oklchToLinearRgb({ L, C: c, H });
    if (rgb.every((v) => v >= -0.0005 && v <= 1.0005)) {
      const hex = rgb
        .map((v) => Math.round(toSrgb(Math.min(1, Math.max(0, v))) * 255))
        .map((n) => n.toString(16).padStart(2, '0'))
        .join('');
      return `#${hex}`;
    }
    c *= 0.9;
  }
  const rgb = oklchToLinearRgb({ L, C: 0, H });
  return `#${rgb.map((v) => Math.round(toSrgb(Math.min(1, Math.max(0, v))) * 255).toString(16).padStart(2, '0')).join('')}`;
}

const BG_MAP: Record<BgStyle, Oklch> = {
  white: { L: 1, C: 0, H: 0 },
  warm: { L: 0.985, C: 0.008, H: 80 },
  cream: { L: 0.985, C: 0.025, H: 100 },
  cool: { L: 0.985, C: 0.006, H: 240 },
};

/**
 * 從品牌色算整組色票。品牌色沒設或讀不懂 → 用 zinc-900(#18181b),就是 shadcn 預設那種黑。
 */
export function derivePalette(brandHex: string | null | undefined, bgStyle: BgStyle = 'white'): Palette {
  const rgb = (brandHex && hexToRgb(brandHex)) || hexToRgb('#18181b')!;
  const b = rgbToOklch(rgb);
  const neutral = b.C < 0.02;
  const C = Math.min(b.C, 0.17);
  // 主色太淺(例如淡黃)壓暗到白字看得清;太深維持;近黑就當 zinc-900
  const accentL = neutral ? Math.min(b.L, 0.27) : Math.min(Math.max(b.L, 0.36), 0.52);
  const bg = BG_MAP[bgStyle] ?? BG_MAP.white;
  const washH = neutral ? 85 : b.H;
  return {
    accent: oklchToHex(accentL, C, b.H),
    onAccent: '#ffffff',
    accentInk: oklchToHex(Math.min(accentL, 0.4), C, b.H),
    wash: oklchToHex(0.955, neutral ? 0 : Math.min(C, 0.05), washH),
    washLine: oklchToHex(0.87, neutral ? 0 : Math.min(C, 0.08), washH),
    bg: oklchToHex(bg.L, bg.C, bg.H),
    header: oklchToHex(Math.min(1, bg.L + 0.008), bg.C * 0.6, bg.H),
    surface: '#ffffff',
    line: '#e4e4e7',
    lineSoft: '#f4f4f5',
    ink: '#09090b',
    muted: '#71717a',
    faint: '#a1a1aa',
  };
}

/** 給 wrapper 的 inline style 用:整站元件都吃這些變數 */
export function paletteCssVars(p: Palette): Record<string, string> {
  return {
    '--ui-accent': p.accent,
    '--ui-on-accent': p.onAccent,
    '--ui-accent-ink': p.accentInk,
    '--ui-wash': p.wash,
    '--ui-wash-line': p.washLine,
    '--ui-bg': p.bg,
    '--ui-header': p.header,
    '--ui-surface': p.surface,
    '--ui-line': p.line,
    '--ui-line-soft': p.lineSoft,
    '--ui-ink': p.ink,
    '--ui-muted': p.muted,
    '--ui-faint': p.faint,
  };
}

/**
 * 從現有攤位設定推底色風格(bg_style 欄位還沒加之前的過渡):
 * 以前自選的背景色若是黃色系就當「奶油」,其他一律純白。
 */
export function bgStyleFromLegacy(shopBgColor: string | null | undefined): BgStyle {
  const rgb = shopBgColor ? hexToRgb(shopBgColor) : null;
  if (!rgb) return 'white';
  const o = rgbToOklch(rgb);
  if (o.L > 0.97 && o.C > 0.01 && o.H > 70 && o.H < 120) return 'cream';
  return 'white';
}
