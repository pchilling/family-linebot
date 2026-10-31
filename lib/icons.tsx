/**
 * 共用線條 icon(2026-09-08):購物流程 UI 去 emoji 化。
 * 全部 stroke=currentColor,可用 color prop 覆蓋;server / client 元件皆可用。
 */
type IconProps = { size?: number; color?: string; style?: React.CSSProperties };

function svgProps(size: number, color: string, style?: React.CSSProperties) {
  return {
    width: size,
    height: size,
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    style: { display: 'inline-block', verticalAlign: '-0.15em', flexShrink: 0, ...style },
    'aria-hidden': true,
  };
}

export function IconClock({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </svg>
  );
}

export function IconCheck({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M20 6 9 17l-5-5" />
    </svg>
  );
}

export function IconCheckCircle({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="m8.5 12 2.5 2.5 5-5" />
    </svg>
  );
}

export function IconPackage({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M21 8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16Z" />
      <path d="m3.3 7 8.7 5 8.7-5" />
      <path d="M12 22V12" />
    </svg>
  );
}

export function IconX({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M18 6 6 18" />
      <path d="m6 6 12 12" />
    </svg>
  );
}

export function IconUndo({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M3 7v6h6" />
      <path d="M21 17a9 9 0 0 0-15-6.7L3 13" />
    </svg>
  );
}

export function IconReceipt({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1Z" />
      <path d="M8 8h8" />
      <path d="M8 12h8" />
      <path d="M8 16h5" />
    </svg>
  );
}

export function IconPencil({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
    </svg>
  );
}

export function IconBank({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <circle cx="12" cy="12" r="2.5" />
      <path d="M6 12h.01" />
      <path d="M18 12h.01" />
    </svg>
  );
}

// 2026-10-15:行動支付(LINE Pay 等電子錢包)
export function IconWallet({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M3 7a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2" />
      <rect x="3" y="7" width="18" height="12" rx="2" />
      <path d="M16 12.5h3" />
    </svg>
  );
}

// 2026-10-22:信用卡(綠界刷卡)
export function IconCreditCard({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <rect x="2" y="5" width="20" height="14" rx="2" />
      <path d="M2 10h20" />
      <path d="M6 15h4" />
    </svg>
  );
}

// 2026-10-15:配送(宅配 / 貨運)
export function IconTruck({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M3 6h10v9H3z" />
      <path d="M13 9h4l3 3v3h-7z" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="16.5" cy="17.5" r="1.8" />
    </svg>
  );
}

export function IconFlame({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.07-2.14-.22-4.05 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.15.43-2.3 1-3a2.5 2.5 0 0 0 2.5 2.5Z" />
    </svg>
  );
}

export function IconChevronLeft({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="m15 18-6-6 6-6" />
    </svg>
  );
}

export function IconCalendar({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <rect x="3" y="4" width="18" height="18" rx="2" />
      <path d="M16 2v4" />
      <path d="M8 2v4" />
      <path d="M3 10h18" />
    </svg>
  );
}

export function IconGift({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <rect x="3" y="8" width="18" height="4" rx="1" />
      <path d="M12 8v13" />
      <path d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />
      <path d="M7.5 8a2.5 2.5 0 0 1 0-5C11 3 12 8 12 8Z" />
      <path d="M16.5 8a2.5 2.5 0 0 0 0-5C13 3 12 8 12 8Z" />
    </svg>
  );
}

export function IconZap({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}

// 2026-10-23:收藏愛心;filled = 已收藏(實心),否則空心線條
export function IconHeart({ size = 16, color = 'currentColor', style, filled = false }: IconProps & { filled?: boolean }) {
  const props = svgProps(size, color, style);
  return (
    <svg {...props} fill={filled ? color : 'none'}>
      <path d="M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z" />
    </svg>
  );
}

// ── 2026-11-01:後台「設定」頁改版用 ──

export function IconStore({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M3.5 9 5 4h14l1.5 5" />
      <path d="M3.5 9h17v1.5a3 3 0 0 1-5.7 1.3A3 3 0 0 1 12 13a3 3 0 0 1-2.8-1.2A3 3 0 0 1 3.5 10.5Z" />
      <path d="M5 13.5V20h14v-6.5" />
      <path d="M10 20v-4h4v4" />
    </svg>
  );
}

export function IconPalette({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M12 3a9 9 0 1 0 0 18c1.4 0 2.3-1 2.3-2.2 0-.7-.3-1.2-.7-1.7-.4-.5-.6-.9-.6-1.5 0-1.1.9-2 2-2h1.9A4 4 0 0 0 21 9.7C20.4 5.9 16.6 3 12 3Z" />
      <circle cx="7.5" cy="11" r="1" fill={color} stroke="none" />
      <circle cx="10" cy="7.3" r="1" fill={color} stroke="none" />
      <circle cx="14.5" cy="7" r="1" fill={color} stroke="none" />
    </svg>
  );
}

export function IconInfo({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v5.5" />
      <circle cx="12" cy="7.8" r=".9" fill={color} stroke="none" />
    </svg>
  );
}

export function IconCopy({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M5 15V6a2 2 0 0 1 2-2h9" />
    </svg>
  );
}

export function IconExternal({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M14 4h6v6" />
      <path d="m20 4-9 9" />
      <path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" />
    </svg>
  );
}

export function IconPlus({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function IconTrash({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="m6 7 1 13h10l1-13" />
    </svg>
  );
}

export function IconChevronUp({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="m6 15 6-6 6 6" />
    </svg>
  );
}

export function IconChevronDown({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function IconUpload({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M12 16V4" />
      <path d="m7 9 5-5 5 5" />
      <path d="M4 20h16" />
    </svg>
  );
}

export function IconImage({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <rect x="3" y="5" width="18" height="14" rx="2" />
      <circle cx="8.5" cy="10" r="1.5" />
      <path d="m21 16-5-5-9 8" />
    </svg>
  );
}

export function IconVideo({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <rect x="3" y="6" width="13" height="12" rx="2" />
      <path d="m16 10 5-3v10l-5-3" />
    </svg>
  );
}
