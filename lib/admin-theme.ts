/**
 * Admin UI design tokens。Linear / Vercel-inspired neutral palette + Geist 字型。
 * 各頁面 import 用,改一個地方全部跟動。
 */

export const colors = {
  // 背景
  bgBody: '#fafafa',
  bgCard: '#ffffff',
  bgSubtle: '#f7f7f8',
  bgHover: '#f4f4f5',
  bgPressed: '#e4e4e7',

  // 邊框
  border: '#e4e4e7',
  borderSubtle: 'rgba(0, 0, 0, 0.06)',
  borderStrong: '#d4d4d8',

  // 文字
  textPrimary: '#18181b',
  textSecondary: '#52525b',
  textMuted: '#71717a',
  textDisabled: '#a1a1aa',
  textOnAccent: '#fafafa',

  // 強調(monochrome,跟 Vercel 風)
  accent: '#18181b',
  accentHover: '#27272a',

  // semantic
  success: '#16a34a',
  successBg: '#f0fdf4',
  successBorder: '#bbf7d0',
  successText: '#15803d',
  warning: '#d97706',
  warningBg: '#fffbeb',
  warningBorder: '#fde68a',
  warningText: '#92400e',
  danger: '#dc2626',
  dangerBg: '#fef2f2',
  dangerBorder: '#fecaca',
  dangerText: '#991b1b',

  // plan 色(柔和、不刺眼)
  planFreeBg: '#f4f4f5',
  planFreeText: '#52525b',
  planProBg: '#eff6ff',
  planProText: '#1d4ed8',
  planEntBg: '#f5f3ff',
  planEntText: '#6d28d9',

  // NEOP brand(Phase 8 Logo Integration,2026-05-26)
  // 細節 / 用法見 docs/BRAND.md
  neopGreen: '#05C878',         // 主色 / CTA
  neopGreenBg: '#E6FAF1',       // success bg 用(對齊 neop-green-50)
  neopGreenHover: '#04A263',    // hover(對齊 neop-green-600)
  neopBlack: '#0A0A0A',         // 不要純黑(微帶暖度)
};

export const space = {
  '0.5': 2,
  '1': 4,
  '2': 8,
  '3': 12,
  '4': 16,
  '5': 20,
  '6': 24,
  '8': 32,
  '10': 40,
  '12': 48,
  '16': 64,
  '20': 80,
};

export const fontSize = {
  '2xs': 10,
  xs: 11,
  sm: 12,
  base: 13,
  md: 14,
  lg: 16,
  xl: 18,
  '2xl': 22,
  '3xl': 28,
  '4xl': 36,
};

export const fontWeight = {
  normal: 400,
  medium: 500,
  semibold: 600,
  bold: 700,
};

export const radius = {
  none: 0,
  xs: 3,
  sm: 4,
  md: 6,
  lg: 8,
  xl: 12,
  '2xl': 16,
  full: 9999,
};

export const shadow = {
  xs: '0 1px 0 rgba(0, 0, 0, 0.03)',
  sm: '0 1px 2px rgba(0, 0, 0, 0.04)',
  md: '0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.03)',
  lg: '0 4px 12px rgba(0, 0, 0, 0.06), 0 2px 4px rgba(0, 0, 0, 0.03)',
  // 微微的 inset(用於 input)
  inset: 'inset 0 0 0 1px rgba(0, 0, 0, 0.04)',
};

// CSS variables 引用(從 layout.tsx 載 Geist 後可用)
export const fontFamilySans = 'var(--font-geist-sans), -apple-system, BlinkMacSystemFont, system-ui, sans-serif';
export const fontFamilyMono = 'var(--font-geist-mono), ui-monospace, "SF Mono", Menlo, monospace';

// 共用樣式積木
export const card: React.CSSProperties = {
  background: colors.bgCard,
  border: `1px solid ${colors.border}`,
  borderRadius: radius.lg,
  padding: space['6'],
  boxShadow: shadow.xs,
};

export const cardHover: React.CSSProperties = {
  ...card,
  transition: 'border-color 150ms, box-shadow 150ms',
};

export const sectionLabel: React.CSSProperties = {
  fontSize: fontSize['2xs'],
  fontWeight: fontWeight.semibold,
  color: colors.textMuted,
  textTransform: 'uppercase' as const,
  letterSpacing: '0.08em',
  fontFamily: fontFamilySans,
};

export const h1Style: React.CSSProperties = {
  fontSize: fontSize['3xl'],
  fontWeight: fontWeight.semibold,
  color: colors.textPrimary,
  margin: 0,
  letterSpacing: '-0.02em',
  lineHeight: 1.15,
  fontFamily: fontFamilySans,
};

export const h2Style: React.CSSProperties = {
  fontSize: fontSize.lg,
  fontWeight: fontWeight.semibold,
  color: colors.textPrimary,
  margin: 0,
  letterSpacing: '-0.01em',
  fontFamily: fontFamilySans,
};

export const monoNum: React.CSSProperties = {
  fontFamily: fontFamilyMono,
  fontVariantNumeric: 'tabular-nums',
  letterSpacing: '-0.02em',
};

export function planBadge(plan: string): React.CSSProperties {
  const palette =
    plan === 'enterprise'
      ? { bg: colors.planEntBg, fg: colors.planEntText }
      : plan === 'pro'
        ? { bg: colors.planProBg, fg: colors.planProText }
        : { bg: colors.planFreeBg, fg: colors.planFreeText };
  return {
    display: 'inline-flex',
    alignItems: 'center',
    padding: '2px 7px',
    background: palette.bg,
    color: palette.fg,
    borderRadius: radius.sm,
    fontSize: fontSize['2xs'],
    fontWeight: fontWeight.semibold,
    letterSpacing: '0.06em',
    textTransform: 'uppercase' as const,
    fontFamily: fontFamilySans,
    lineHeight: 1.4,
  };
}

// Sidebar 尺寸
export const sidebarWidth = 248;
export const contentMaxWidth = 1120;
