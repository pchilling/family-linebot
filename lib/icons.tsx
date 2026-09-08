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

export function IconZap({ size = 16, color = 'currentColor', style }: IconProps) {
  return (
    <svg {...svgProps(size, color, style)}>
      <path d="M13 2 3 14h7l-1 8 10-12h-7l1-8Z" />
    </svg>
  );
}
