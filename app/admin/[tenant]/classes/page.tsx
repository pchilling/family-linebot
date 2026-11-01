import { notFound } from 'next/navigation';
import { getTenantBySlug, supabaseAdmin } from '@/lib/supabase';
import { createClass, deleteClass, updateClass } from '../../actions';
import { ProductImageUploader } from '../products/image-uploader';
import { SubmitButton } from '../../_components/submit-button';
import { UploadImageField } from '../../_components/upload-image-field';
import { FlashToast } from '../../../_components/toast';
import { IconAlert, IconCalendar, IconCheck, IconChevronDown, IconClock, IconPin, IconPlus, IconUser } from '@/lib/icons';

/**
 * 活動(2026-11-01 換成後台新設計系統:新增表單與每張活動卡都改成卡片,欄位用 ui-input)。
 * 查詢、建立、更新、刪除的 action 不變。
 */

type Region = { id: string; name: string };
type ClassRow = {
  id: string;
  region_id: string;
  regions: { name: string } | null;
  name: string;
  scheduled_at: string;
  instructor: string | null;
  is_paid: boolean;
  price_twd: number | null;
  duration_min: number | null;
  capacity: number | null;
  status: string;
  image_url: string | null;
  description: string | null;
};

async function getRegions(tenantId: string): Promise<Region[]> {
  const { data } = await supabaseAdmin
    .from('regions')
    .select('id, name')
    .eq('tenant_id', tenantId)
    .order('name');
  return (data ?? []) as Region[];
}

async function getClasses(tenantId: string): Promise<ClassRow[]> {
  const { data } = await supabaseAdmin
    .from('classes')
    .select(
      'id, region_id, regions(name), name, scheduled_at, instructor, is_paid, price_twd, duration_min, capacity, status, image_url, description',
    )
    .eq('tenant_id', tenantId)
    .order('scheduled_at');
  return (data ?? []) as unknown as ClassRow[];
}

type Stats = { confirmed: number; waitlist: number; attended: number };
async function getStats(tenantId: string, classIds: string[]): Promise<Map<string, Stats>> {
  const map = new Map<string, Stats>();
  if (classIds.length === 0) return map;
  const [resvResp, attResp] = await Promise.all([
    supabaseAdmin
      .from('reservations')
      .select('class_id, status')
      .eq('tenant_id', tenantId)
      .in('class_id', classIds),
    supabaseAdmin
      .from('attendances')
      .select('class_id')
      .eq('tenant_id', tenantId)
      .in('class_id', classIds),
  ]);
  const resvs = (resvResp.data as { class_id: string; status: string }[] | null) ?? [];
  const atts = (attResp.data as { class_id: string }[] | null) ?? [];
  for (const r of resvs) {
    const s = map.get(r.class_id) ?? { confirmed: 0, waitlist: 0, attended: 0 };
    if (r.status === 'confirmed') s.confirmed += 1;
    if (r.status === 'waitlist') s.waitlist += 1;
    map.set(r.class_id, s);
  }
  for (const a of atts) {
    const s = map.get(a.class_id) ?? { confirmed: 0, waitlist: 0, attended: 0 };
    s.attended += 1;
    map.set(a.class_id, s);
  }
  return map;
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const tw = new Date(d.getTime() + 8 * 3600 * 1000);
  return `${tw.getUTCFullYear()}-${String(tw.getUTCMonth() + 1).padStart(2, '0')}-${String(tw.getUTCDate()).padStart(2, '0')}T${String(tw.getUTCHours()).padStart(2, '0')}:${String(tw.getUTCMinutes()).padStart(2, '0')}`;
}

function formatDate(iso: string): { day: string; month: string; weekday: string; time: string; full: string } {
  const d = new Date(iso);
  const day = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', day: 'numeric' });
  const month = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', month: 'short' });
  const weekday = d.toLocaleDateString('zh-TW', { timeZone: 'Asia/Taipei', weekday: 'narrow' });
  const time = d.toLocaleTimeString('zh-TW', { timeZone: 'Asia/Taipei', hour: '2-digit', minute: '2-digit', hour12: false });
  const full = d.toLocaleString('zh-TW', { timeZone: 'Asia/Taipei', year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });
  return { day, month, weekday, time, full };
}

const CSS = `
.cl-head{display:flex;align-items:flex-end;justify-content:space-between;gap:16px;margin-bottom:16px;flex-wrap:wrap}
.cl-head h1{margin:0;font-size:22px;font-weight:600;letter-spacing:-.02em}
.cl-head p{margin:4px 0 0;font-size:13px;color:#71717a}
.cl-callout{display:flex;gap:8px;align-items:flex-start;padding:10px 14px;border-radius:8px;background:#fef2f2;border:1px solid #fecaca;color:#b91c1c;font-size:13px;margin-bottom:14px;line-height:1.5}
.cl-card{background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden;margin-bottom:20px}
.cl-card > summary{list-style:none;cursor:pointer;padding:14px 18px;display:flex;align-items:center;gap:10px;font-size:14px;font-weight:600}
.cl-card > summary::-webkit-details-marker{display:none}
.cl-card > summary .hint{color:#71717a;font-size:12px;font-weight:400}
.cl-card > summary .chev{margin-left:auto;color:#a1a1aa;transition:transform .15s;flex:none}
.cl-card[open] > summary .chev{transform:rotate(180deg)}
.cl-body{padding:0 18px 18px;border-top:1px solid #f4f4f5}
.cl-form{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:16px}
.cl-form .full{grid-column:1/-1}
.cl-f{display:block;min-width:0}
.cl-f .ui-label{margin-bottom:4px}
.cl-f .h{display:block;font-size:11.5px;color:#71717a;margin-top:4px;line-height:1.5}
.cl-check{display:flex;align-items:center;gap:8px;font-size:13px;align-self:end;min-height:40px}
.cl-sec{font-size:12px;font-weight:600;color:#71717a;margin:0 0 10px;display:flex;align-items:center;gap:6px}
.cl-sec .dot{width:8px;height:8px;border-radius:50%;background:#dc2626;display:inline-block}
.cl-fold > summary{list-style:none;cursor:pointer}
.cl-fold > summary::-webkit-details-marker{display:none}
.cl-list{display:flex;flex-direction:column;gap:10px;margin-bottom:24px}
.cl-item{background:#fff;border:1px solid #e4e4e7;border-radius:12px;overflow:hidden}
.cl-item[data-accent="today"]{border-color:#fca5a5}
.cl-item[data-accent="past"]{opacity:.72}
.cl-item > summary{list-style:none;cursor:pointer;padding:14px 16px;display:flex;align-items:center;gap:14px}
.cl-item > summary::-webkit-details-marker{display:none}
.cl-date{flex:none;width:52px;padding:6px 0;background:#fafafa;border:1px solid #f4f4f5;border-radius:8px;text-align:center}
.cl-date .m{font-size:9px;color:#71717a;font-weight:600;letter-spacing:.04em}
.cl-date .d{font-size:18px;font-weight:700;line-height:1.1;font-variant-numeric:tabular-nums}
.cl-date .w{font-size:9px;color:#71717a}
.cl-cover{flex:none;width:40px;height:50px;object-fit:cover;border-radius:6px;border:1px solid #f4f4f5}
.cl-main{flex:1;min-width:0}
.cl-title{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:4px}
.cl-title b{font-size:15px;font-weight:600}
.cl-title .price{font-size:12px;color:#71717a;font-variant-numeric:tabular-nums}
.cl-meta{font-size:12px;color:#71717a;margin-bottom:5px;display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.cl-stats{display:flex;gap:10px;font-size:11.5px;flex-wrap:wrap;font-weight:600}
.cl-expand{border-top:1px solid #f4f4f5;padding:16px 18px;background:#fafafa}
.cl-cover-box{margin-bottom:16px;padding-bottom:16px;border-bottom:1px solid #e4e4e7}
.cl-cover-box .lb{font-size:12px;font-weight:600;color:#71717a;margin-bottom:10px}
.cl-actions{grid-column:1/-1;display:flex;gap:8px;justify-content:flex-end;align-items:center;flex-wrap:wrap}
.cl-danger{margin-top:14px;padding-top:14px;border-top:1px dashed #e4e4e7}
.cl-danger > summary{font-size:12px;color:#b91c1c;font-weight:500;display:inline-flex;align-items:center;gap:4px}
.cl-danger-box{margin-top:8px;padding:10px 12px;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;font-size:12.5px;color:#991b1b}
.cl-empty{text-align:center;padding:56px 24px;background:#fff;border:1px solid #e4e4e7;border-radius:12px}
.cl-badge-cancel{background:#fef2f2;color:#b91c1c;border-color:#fecaca}
@media (max-width:767px){
  .cl-form{grid-template-columns:1fr}
  .cl-card,.cl-item{border-radius:10px}
  .cl-item > summary{flex-wrap:wrap;gap:10px}
  .cl-expand{padding:14px}
}
`;

export default async function ClassesPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenant: string }>;
  searchParams: Promise<{ saved?: string }>;
}) {
  const { tenant: slug } = await params;
  const sp = await searchParams;
  const tenant = await getTenantBySlug(slug);
  if (!tenant) notFound();
  const [regions, classes] = await Promise.all([getRegions(tenant.id), getClasses(tenant.id)]);
  const stats = await getStats(tenant.id, classes.map((c) => c.id));

  // 區分 今天/未來/過期
  const now = Date.now();
  const dayMs = 86400000;
  const today = classes.filter((c) => {
    const t = new Date(c.scheduled_at).getTime();
    return Math.abs(t - now) < dayMs && new Date(c.scheduled_at).toDateString() === new Date().toDateString();
  });
  const upcoming = classes.filter((c) => new Date(c.scheduled_at).getTime() > now && !today.includes(c));
  const past = classes.filter((c) => new Date(c.scheduled_at).getTime() < now && !today.includes(c)).reverse();

  const savedId = sp.saved;

  return (
    <main style={{ padding: '28px 32px 48px' }}>
      <style dangerouslySetInnerHTML={{ __html: CSS }} />
      <div>
        {savedId && <FlashToast key={savedId} message="已儲存活動" />}

        <header className="cl-head">
          <div>
            <h1>活動</h1>
            <p>
              共 {classes.length} 個 · 今天 {today.length} · 未來 {upcoming.length} · 已結束 {past.length}
            </p>
          </div>
        </header>

        {regions.length === 0 && (
          <div className="cl-callout">
            <IconAlert size={14} style={{ marginTop: 2 }} />
            <span>這個攤位還沒有上課地點,請先請 NEOP 加地點資料,再新增活動。</span>
          </div>
        )}

        {/* 新增活動 — 折疊 */}
        <details className="cl-card">
          <summary>
            <IconPlus size={15} />
            新增活動
            <span className="hint">建立後可下載簽到 QR</span>
            <IconChevronDown size={16} style={{ marginLeft: 'auto', color: '#a1a1aa' }} />
          </summary>
          <div className="cl-body">
            <form action={createClass} className="cl-form">
              <input type="hidden" name="tenant_id" value={tenant.id} />
              <input type="hidden" name="tenant_slug" value={tenant.slug} />
              <label className="cl-f">
                <span className="ui-label">地點<i>*</i></span>
                <select name="region_id" required className="ui-input">
                  {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                </select>
              </label>
              <label className="cl-f"><span className="ui-label">活動名稱<i>*</i></span><input name="name" required className="ui-input" placeholder="例:芳療基礎工作坊" /></label>
              <label className="cl-f"><span className="ui-label">時間<i>*</i></span><input name="scheduled_at" type="datetime-local" required className="ui-input" style={{ WebkitAppearance: 'none', appearance: 'none' }} /></label>
              <label className="cl-f"><span className="ui-label">講師</span><input name="instructor" className="ui-input" placeholder="王老師" /></label>
              <label className="cl-f"><span className="ui-label">時長(分鐘)</span><input name="duration_min" type="number" defaultValue={90} className="ui-input" /></label>
              <label className="cl-f"><span className="ui-label">價格<span style={{ color: '#71717a', fontWeight: 400 }}>(收費才填)</span></span><input name="price_twd" type="number" className="ui-input" placeholder="例:500" /></label>
              <label className="cl-f"><span className="ui-label">人數限制<span style={{ color: '#71717a', fontWeight: 400 }}>(留空不限)</span></span><input name="capacity" type="number" min="0" className="ui-input" placeholder="例:12" /></label>
              <label className="cl-check">
                <input name="is_paid" type="checkbox" className="ui-cb" />
                收費課程
              </label>
              <label className="cl-f full">
                <span className="ui-label">課程介紹<span style={{ color: '#71717a', fontWeight: 400 }}>(可換行)</span></span>
                <textarea
                  name="description"
                  rows={4}
                  className="ui-input"
                  placeholder={'例:\n帶你認識芳療基礎,從精油功效到日常應用\n適合:芳療新手、想學自我保健\n時長 90 分鐘,現場提供精油試聞\n名額限 12 人,先報先得'}
                />
                <span className="h">LINE 選單「本月課程」和報名頁都會顯示這段。一行一點,150 字以內。</span>
              </label>
              {/* 2026-09-08:建立時就能傳活動圖(原本要先建立才能傳) */}
              <div className="cl-f full">
                <span className="ui-label">活動圖<span style={{ color: '#71717a', fontWeight: 400 }}>(選填)</span></span>
                <UploadImageField
                  tenantSlug={tenant.slug}
                  folder="classes"
                  hint="建議直式 4:5(如 1080×1350)。LINE 課程卡固定以 4:5 裁切;報名頁會顯示完整原圖。之後也可以在活動卡裡換。"
                />
              </div>
              <div className="cl-actions">
                <SubmitButton pendingText="建立中…">建立活動</SubmitButton>
              </div>
            </form>
          </div>
        </details>

        {/* Today */}
        {today.length > 0 && (
          <section style={{ marginBottom: 8 }}>
            <div className="cl-sec"><span className="dot" />今天進行</div>
            <div className="cl-list">
              {today.map((cls) => (
                <ClassCard key={cls.id} cls={cls} tenant={tenant} regions={regions} stats={stats.get(cls.id)} savedId={savedId} accent="today" />
              ))}
            </div>
          </section>
        )}

        {/* Upcoming */}
        {upcoming.length > 0 && (
          <section style={{ marginBottom: 8 }}>
            <div className="cl-sec">未來活動({upcoming.length})</div>
            <div className="cl-list">
              {upcoming.map((cls) => (
                <ClassCard key={cls.id} cls={cls} tenant={tenant} regions={regions} stats={stats.get(cls.id)} savedId={savedId} />
              ))}
            </div>
          </section>
        )}

        {/* Past — 折疊 */}
        {past.length > 0 && (
          <details className="cl-fold" style={{ marginBottom: 24 }}>
            <summary className="cl-sec" style={{ display: 'inline-flex' }}>
              <IconChevronDown size={14} />
              已結束({past.length})
            </summary>
            <div className="cl-list" style={{ marginTop: 12 }}>
              {past.map((cls) => (
                <ClassCard key={cls.id} cls={cls} tenant={tenant} regions={regions} stats={stats.get(cls.id)} savedId={savedId} accent="past" />
              ))}
            </div>
          </details>
        )}

        {classes.length === 0 && (
          <div className="cl-empty">
            <div style={{ marginBottom: 10, color: '#a1a1aa' }}><IconCalendar size={40} /></div>
            <p style={{ margin: '0 0 4px', fontSize: 15, fontWeight: 500 }}>還沒有活動</p>
            <p style={{ margin: 0, fontSize: 12.5, color: '#71717a' }}>點上面的「新增活動」開始。</p>
          </div>
        )}
      </div>
    </main>
  );
}

function ClassCard({
  cls,
  tenant,
  regions,
  stats,
  savedId,
  accent,
}: {
  cls: ClassRow;
  tenant: { id: string; slug: string };
  regions: Region[];
  stats: Stats | undefined;
  savedId: string | undefined;
  accent?: 'today' | 'past';
}) {
  const isExpanded = cls.id === savedId;
  const dt = formatDate(cls.scheduled_at);
  const confirmed = stats?.confirmed ?? 0;
  const waitlist = stats?.waitlist ?? 0;
  const attended = stats?.attended ?? 0;
  const cap = cls.capacity;
  const isFull = cap !== null && confirmed >= cap;

  return (
    <details open={isExpanded} className="cl-item" data-accent={accent ?? 'normal'}>
      <summary>
        {/* 日期區塊 */}
        <div className="cl-date">
          <div className="m">{dt.month}</div>
          <div className="d">{dt.day}</div>
          <div className="w">{dt.weekday}</div>
        </div>

        {/* Cover 縮圖 4:5 直式(有設才顯示)*/}
        {cls.image_url && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={cls.image_url} alt={cls.name} className="cl-cover" />
        )}

        <div className="cl-main">
          <div className="cl-title">
            <b>{cls.name}</b>
            {cls.status === 'cancelled' && <span className="ui-badge cl-badge-cancel">已取消</span>}
            {cls.is_paid && cls.price_twd && <span className="price">NT$ {cls.price_twd}</span>}
          </div>
          <div className="cl-meta">
            <IconClock size={12} /> {dt.time}
            {cls.regions?.name && <> · <IconPin size={12} /> {cls.regions.name}</>}
            {cls.instructor && <> · <IconUser size={12} /> {cls.instructor}</>}
          </div>
          {/* 報名 / 簽到 stats */}
          <div className="cl-stats">
            <span style={{ color: isFull ? '#b91c1c' : '#15803d' }}>
              報名 {confirmed}{cap !== null && <>/{cap}</>}
            </span>
            {waitlist > 0 && <span style={{ color: '#b45309' }}>候補 {waitlist}</span>}
            <span style={{ color: '#1d4ed8' }}><IconCheck size={12} /> 簽到 {attended}</span>
            {isFull && <span style={{ color: '#b91c1c' }}>已滿</span>}
          </div>
        </div>

        {/* 簽到 QR 在 summary 右側 */}
        <a
          href={`/admin/${tenant.slug}/classes/${cls.id}/qr`}
          target="_blank"
          rel="noopener noreferrer"
          className="ui-btn ui-btn-outline ui-btn-xs"
          style={{ flex: 'none' }}
        >
          簽到 QR
        </a>
      </summary>

      <div className="cl-expand">
        {/* Cover 圖上傳器 — 顯示在 LIFF / Rich Menu Flex / admin */}
        <div className="cl-cover-box">
          <div className="lb">活動圖(直式 4:5)</div>
          <ProductImageUploader
            entity="class"
            entityId={cls.id}
            tenantSlug={tenant.slug}
            currentImageUrl={cls.image_url}
            productName={cls.name}
          />
        </div>

        <form action={updateClass} className="cl-form" style={{ marginTop: 0 }}>
          <input type="hidden" name="id" value={cls.id} />
          <input type="hidden" name="tenant_id" value={tenant.id} />
          <input type="hidden" name="tenant_slug" value={tenant.slug} />
          <label className="cl-f">
            <span className="ui-label">地點</span>
            <select name="region_id" defaultValue={cls.region_id} className="ui-input">
              {regions.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <label className="cl-f"><span className="ui-label">名稱</span><input name="name" defaultValue={cls.name} className="ui-input" /></label>
          <label className="cl-f"><span className="ui-label">時間</span><input name="scheduled_at" type="datetime-local" defaultValue={toLocalInput(cls.scheduled_at)} className="ui-input" style={{ WebkitAppearance: 'none', appearance: 'none' }} /></label>
          <label className="cl-f"><span className="ui-label">講師</span><input name="instructor" defaultValue={cls.instructor ?? ''} className="ui-input" /></label>
          <label className="cl-f"><span className="ui-label">價格</span><input name="price_twd" type="number" defaultValue={cls.price_twd ?? ''} className="ui-input" /></label>
          <label className="cl-f"><span className="ui-label">人數限制<span style={{ color: '#71717a', fontWeight: 400 }}>(留空不限)</span></span><input name="capacity" type="number" min="0" defaultValue={cls.capacity ?? ''} className="ui-input" placeholder="例:12" /></label>
          <label className="cl-check">
            <input name="is_paid" type="checkbox" defaultChecked={cls.is_paid} className="ui-cb" />
            收費
          </label>
          <label className="cl-f full">
            <span className="ui-label">課程介紹<span style={{ color: '#71717a', fontWeight: 400 }}>(可換行,顯示在 LINE 選單「本月課程」和報名頁)</span></span>
            <textarea
              name="description"
              defaultValue={cls.description ?? ''}
              rows={5}
              className="ui-input"
              placeholder={'例:\n帶你認識芳療基礎\n適合芳療新手\n時長 90 分鐘\n名額限 12 人'}
            />
            <span className="h">一行一點,150 字以內,超過會截斷。</span>
          </label>
          <div className="cl-actions">
            <a href={`/admin/${tenant.slug}/attendances?class_id=${cls.id}`} className="ui-btn ui-btn-outline ui-btn-sm">
              看出席紀錄
            </a>
            <SubmitButton size="sm" pendingText="儲存中…">儲存</SubmitButton>
          </div>
        </form>

        <details className="cl-fold cl-danger">
          <summary>
            <IconChevronDown size={12} />
            刪除這個活動
          </summary>
          <div className="cl-danger-box">
            <span>刪除活動會連報名與出席紀錄一起刪掉,無法復原。</span>
            <form action={deleteClass} style={{ display: 'inline' }}>
              <input type="hidden" name="id" value={cls.id} />
              <input type="hidden" name="tenant_slug" value={tenant.slug} />
              <SubmitButton variant="danger" size="sm" pendingText="刪除中…" confirmText={`確定刪除「${cls.name}」?報名與出席紀錄會一起刪掉,無法復原。`}>確認刪除</SubmitButton>
            </form>
          </div>
        </details>
      </div>
    </details>
  );
}
