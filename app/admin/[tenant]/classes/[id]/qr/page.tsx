import { notFound } from 'next/navigation';
import Link from 'next/link';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';

type ClassDetail = {
  id: string;
  name: string;
  scheduled_at: string;
  instructor: string | null;
  is_paid: boolean;
  price_twd: number | null;
  duration_min: number | null;
  status: string;
  capacity: number | null;
  regions: { name: string } | null;
};

async function getClass(tenantId: string, id: string): Promise<ClassDetail | null> {
  const { data } = await supabaseAdmin
    .from('classes')
    .select(
      'id, name, scheduled_at, instructor, is_paid, price_twd, duration_min, status, capacity, regions(name)',
    )
    .eq('tenant_id', tenantId)
    .eq('id', id)
    .maybeSingle();
  return (data as unknown as ClassDetail | null) ?? null;
}

function formatTw(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleString('zh-TW', {
    timeZone: 'Asia/Taipei',
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  });
}

export default async function ClassQrPage({
  params,
}: {
  params: Promise<{ tenant: string; id: string }>;
}) {
  const { tenant: slug, id } = await params;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const c = await getClass(tenant.id, id);
  if (!c) notFound();

  // 用 production URL 確保 LINE 內可開
  const baseUrl = process.env.NEXT_PUBLIC_PROD_URL ?? 'https://family-linebot-delta.vercel.app';
  const checkinUrl = `${baseUrl}/m/checkin?class_id=${c.id}`;
  // qrserver.com 公開 QR API,免費,免裝 npm
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=500x500&qzone=2&data=${encodeURIComponent(checkinUrl)}`;

  return (
    <div
      style={{
        maxWidth: 560,
        margin: '0 auto',
        padding: '20px 16px',
        fontFamily: '-apple-system, BlinkMacSystemFont, "PingFang TC", "Microsoft JhengHei", sans-serif',
      }}
    >
      <style
        dangerouslySetInnerHTML={{
          __html: `
@media print {
  .no-print { display: none !important; }
  body { background: #fff !important; }
  .qr-page { padding: 0 !important; }
  .qr-card { box-shadow: none !important; border: 1px solid #000 !important; }
}
          `,
        }}
      />

      <div className="no-print" style={{ display: 'flex', gap: 12, marginBottom: 20, fontSize: 14 }}>
        <Link
          href={`/admin/${slug}/classes`}
          style={{ color: '#52525b', textDecoration: 'none' }}
        >
          ← 回活動管理
        </Link>
        <span style={{ color: '#a1a1aa', marginLeft: 'auto' }}>掃 QR 後直接跳到簽到頁</span>
      </div>

      <article
        className="qr-card"
        style={{
          background: '#fff',
          padding: '36px 28px',
          borderRadius: 16,
          boxShadow: '0 1px 3px rgba(0, 0, 0, 0.04), 0 4px 16px rgba(0, 0, 0, 0.04)',
          textAlign: 'center',
        }}
      >
        <div style={{ fontSize: 11, color: '#71717a', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', marginBottom: 8 }}>
          {tenant.name}
        </div>

        <h1 style={{ margin: 0, fontSize: 26, fontWeight: 700, lineHeight: 1.3, color: '#18181b' }}>
          {c.name}
        </h1>

        <p style={{ margin: '8px 0 6px', fontSize: 15, color: '#52525b' }}>
          {formatTw(c.scheduled_at)}
        </p>

        {c.regions?.name && (
          <p style={{ margin: '0 0 28px', fontSize: 14, color: '#71717a' }}>
            📍 {c.regions.name}
            {c.instructor && <span style={{ marginLeft: 12 }}>· 講師 {c.instructor}</span>}
          </p>
        )}

        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={qrUrl}
          alt="簽到 QR Code"
          width={400}
          height={400}
          style={{
            width: 320,
            height: 320,
            margin: '0 auto',
            display: 'block',
            border: '1px solid #f0f0f0',
            borderRadius: 8,
            background: '#fff',
          }}
        />

        <p style={{ margin: '24px 0 6px', fontSize: 18, fontWeight: 600, color: '#18181b' }}>
          掃我簽到
        </p>
        <p style={{ margin: 0, fontSize: 12, color: '#a1a1aa', lineHeight: 1.5 }}>
          LINE 內掃描或長按辨識皆可<br />
          掃完直接顯示「簽到成功」
        </p>

        <div
          className="no-print"
          style={{
            marginTop: 28,
            paddingTop: 20,
            borderTop: '1px dashed #e4e4e7',
          }}
        >
          <div style={{ fontSize: 11, color: '#a1a1aa', marginBottom: 6 }}>URL(可複製手動驗證)</div>
          <code
            style={{
              display: 'block',
              fontSize: 11,
              color: '#52525b',
              fontFamily: 'monospace',
              wordBreak: 'break-all',
              padding: '8px 10px',
              background: '#fafafa',
              borderRadius: 5,
              border: '1px solid #e4e4e7',
              userSelect: 'all',
            }}
          >
            {checkinUrl}
          </code>
        </div>
      </article>

      <div
        className="no-print"
        style={{
          display: 'flex',
          gap: 10,
          marginTop: 20,
          justifyContent: 'center',
        }}
      >
        <a
          href={qrUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={`qr-${c.id.slice(0, 8)}.png`}
          style={{
            padding: '8px 16px',
            background: '#18181b',
            color: '#fff',
            border: 0,
            borderRadius: 6,
            fontSize: 13,
            fontWeight: 600,
            textDecoration: 'none',
          }}
        >
          ↓ 下載 PNG
        </a>
        <a
          href={`/admin/${slug}/attendances?class_id=${c.id}`}
          style={{
            padding: '8px 16px',
            background: '#fff',
            color: '#52525b',
            border: '1px solid #e4e4e7',
            borderRadius: 6,
            fontSize: 13,
            textDecoration: 'none',
          }}
        >
          看出席紀錄
        </a>
      </div>

      <p
        className="no-print"
        style={{
          marginTop: 20,
          textAlign: 'center',
          fontSize: 12,
          color: '#a1a1aa',
          lineHeight: 1.6,
        }}
      >
        建議列印貼在教室門口 / 桌上,Ctrl+P 印出此頁面。
      </p>
    </div>
  );
}
