'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdminTenant } from '@/lib/super-admin';
import { BG_STYLE_HEX, type BgStyle } from '@/lib/theme';
import { parseBankInput } from '@/lib/bank-transfer';
import { CVS_CHAINS, isCvsChain, type CvsChain } from '@/lib/cvs';

export type SettingsState =
  | { status: 'idle' }
  | { status: 'success'; ts: number }
  | { status: 'error'; error: string };

/**
 * Tenant owner 改攤位設定。
 * 只開放安全欄位:name / description / brand_color / 底色風格 / contact_info / payment_info。
 * plan / features / slug / order_prefix 不在這裡改(需 NEO 介入)。
 *
 * 2026-11-01 設定頁拆成分頁後,基本資料 / 外觀 / 收款三個分頁共用這支:
 * 只更新 formData 裡有出現的欄位,沒帶的欄位不動,各分頁才不會互相蓋掉。
 * 以前的 shop_bg_color / header_bg_color 自選色不再開放:公開頁早就只吃品牌色 + 底色風格
 * (lib/theme.ts),底色風格存對應的 hex 進 shop_bg_color,不另開欄位。
 *
 * Signature 給 React 19 useActionState 用:(prev, formData) => newState
 *
 * 2026-11-05:每個 action 都走 requireAdminTenant,登入帳號必須是這個攤位的成員(lib/super-admin.ts)
 */
export async function updateTenantSettings(
  _prev: SettingsState,
  formData: FormData,
): Promise<SettingsState> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  if (!slug) return { status: 'error', error: '無攤位資訊' };

  // free text(多行)頭尾空白 trim,內部換行保留
  const text = (key: string) => String(formData.get(key) ?? '').replace(/^\s+|\s+$/g, '');
  const patch: Record<string, unknown> = {};

  if (formData.has('name')) {
    const name = text('name');
    if (!name) return { status: 'error', error: '店名不能空白' };
    patch.name = name.slice(0, 40);
  }
  if (formData.has('description')) patch.description = text('description').slice(0, 160) || null;
  if (formData.has('brand_color')) {
    const brandColor = text('brand_color');
    if (brandColor && !/^#[0-9a-fA-F]{6}$/.test(brandColor)) {
      return { status: 'error', error: '品牌色需為 #RRGGBB 格式' };
    }
    patch.brand_color = brandColor ? brandColor.toLowerCase() : null;
  }
  if (formData.has('bg_style')) {
    const style = text('bg_style') as BgStyle;
    if (!(style in BG_STYLE_HEX)) return { status: 'error', error: '底色風格不正確' };
    patch.shop_bg_color = BG_STYLE_HEX[style];
  }
  if (formData.has('contact_info')) patch.contact_info = text('contact_info') || null;
  // Phase 32(2026-11-05):商店聲明(品牌關係),頁尾 / 服務條款 / LINE 商店顯示
  if (formData.has('disclaimer')) patch.disclaimer = text('disclaimer').slice(0, 300) || null;
  if (formData.has('payment_info')) patch.payment_info = text('payment_info') || null;
  // Phase 28(2026-11-01):匯款改分欄 → tenants.bank_transfer jsonb;帳號是必要欄位,全空就清掉
  if (formData.has('bank_account')) {
    const account = text('bank_account').replace(/\s+/g, '');
    const bankRaw = text('bank_bank').slice(0, 40);
    const holder = text('bank_holder').slice(0, 40);
    const note = text('bank_note').slice(0, 200);
    if (account && !/^[0-9-]{6,24}$/.test(account)) {
      return { status: 'error', error: '帳號只能有數字和連字號,6 到 24 碼' };
    }
    const enabled = formData.get('bank_enabled') === 'on';
    if (!account && (bankRaw || holder || enabled)) {
      return { status: 'error', error: enabled ? '要先填帳號才能在結帳顯示匯款' : '匯款資訊要填帳號' };
    }
    if (account) {
      const { code, name } = parseBankInput(bankRaw);
      patch.bank_transfer = { enabled, bank_code: code, bank_name: name, account, holder: holder || null, note: note || null };
    } else {
      patch.bank_transfer = null;
    }
  }

  if (Object.keys(patch).length === 0) return { status: 'error', error: '沒有要儲存的內容' };

  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { status: 'error', error: '攤位不存在' };

  const { error } = await supabaseAdmin.from('tenants').update(patch).eq('id', tenant.id);
  if (error) {
    console.error('[updateTenantSettings]', error);
    return { status: 'error', error: '儲存失敗,請稍後再試' };
  }

  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/admin/${slug}`); // 左側欄的店名
  revalidatePath(`/${slug}`, 'layout'); // 頁尾的聯絡資訊、聲明在 layout,整個商店都要重算

  return { status: 'success', ts: Date.now() };
}

// ========================
// Phase 16(2026-09-11 回饋 #12):滿額贈規則
// tenants.gift_rules = { rules: [{ threshold_twd, product_id, qty }] }
// ========================

// Phase 18(2026-10-16):加 mode(累積/擇高)、repeat(可重複)、fallback(備用贈品)
type GiftRuleRow = {
  threshold_twd: number;
  product_id: string;
  qty: number;
  repeat?: boolean;
  fallback_product_id?: string | null;
};

async function readGiftConfig(
  tenantId: string,
): Promise<{ mode: 'stack' | 'highest'; rules: GiftRuleRow[] }> {
  const { data } = await supabaseAdmin
    .from('tenants')
    .select('gift_rules')
    .eq('id', tenantId)
    .maybeSingle();
  const cfg = (data as { gift_rules?: { mode?: string; rules?: GiftRuleRow[] } | null } | null)
    ?.gift_rules;
  return {
    mode: cfg?.mode === 'highest' ? 'highest' : 'stack',
    rules: Array.isArray(cfg?.rules) ? cfg.rules : [],
  };
}

/** 送法模式切換(累積式 / 擇高式) */
export async function setGiftMode(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const mode = String(formData.get('mode') ?? '').trim() === 'highest' ? 'highest' : 'stack';
  if (!slug) throw new Error('無攤位資訊');
  const tenant = await requireAdminTenant(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { rules } = await readGiftConfig(tenant.id);
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ gift_rules: { mode, rules } })
    .eq('id', tenant.id);
  if (error) {
    console.error('[setGiftMode]', error);
    throw new Error('儲存失敗:' + error.message);
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
}

export async function addGiftRule(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const threshold = parseInt(String(formData.get('threshold_twd') ?? ''), 10);
  const productId = String(formData.get('product_id') ?? '').trim();
  const qty = Math.max(1, parseInt(String(formData.get('qty') ?? '1'), 10) || 1);
  const repeat = String(formData.get('repeat') ?? '') === 'on';
  const fallbackId = String(formData.get('fallback_product_id') ?? '').trim();

  if (!slug) throw new Error('無攤位資訊');
  if (!Number.isFinite(threshold) || threshold <= 0) throw new Error('門檻金額需為正整數');
  if (!productId) throw new Error('請選贈品商品');
  if (fallbackId && fallbackId === productId) throw new Error('備用贈品不能跟主贈品相同');

  const tenant = await requireAdminTenant(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { mode, rules } = await readGiftConfig(tenant.id);
  rules.push({
    threshold_twd: threshold,
    product_id: productId,
    qty,
    repeat,
    fallback_product_id: fallbackId || null,
  });
  rules.sort((a, b) => a.threshold_twd - b.threshold_twd);

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ gift_rules: { mode, rules } })
    .eq('id', tenant.id);
  if (error) {
    console.error('[addGiftRule]', error);
    throw new Error('儲存失敗:' + error.message);
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
}

export async function deleteGiftRule(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const idx = parseInt(String(formData.get('idx') ?? ''), 10);
  if (!slug || !Number.isFinite(idx)) throw new Error('缺必要參數');

  const tenant = await requireAdminTenant(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { mode, rules } = await readGiftConfig(tenant.id);
  if (idx < 0 || idx >= rules.length) throw new Error('規則不存在');
  rules.splice(idx, 1);

  const { error } = await supabaseAdmin
    .from('tenants')
    // 刪到一條不剩仍保留 mode,攤主的設定不會因為清空規則被重設
    .update({ gift_rules: { mode, rules } })
    .eq('id', tenant.id);
  if (error) {
    console.error('[deleteGiftRule]', error);
    throw new Error('刪除失敗:' + error.message);
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
}

// ========================
// Logo upload(2026-05-21,Phase 7.1)
// 用 Supabase Storage bucket "tenant-assets" 存,public bucket。
// 客端 react-image-crop 已 crop 成 256×256 jpeg blob,server 只需要 upload + 寫 logo_url。
// ========================
export type UploadLogoResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

export async function uploadLogo(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 2 * 1024 * 1024) return { ok: false, error: '檔案太大(裁切後應 < 2MB)' };

  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  // path 加 timestamp 避免 CDN cache 殘留舊圖
  const path = `${tenant.id}/logo-${Date.now()}.jpg`;

  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, {
      contentType: 'image/jpeg',
      upsert: false,
    });

  if (upErr) {
    console.error('[uploadLogo upload]', upErr);
    return { ok: false, error: '上傳失敗:' + upErr.message };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);

  const { error: updateErr } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: publicUrl })
    .eq('id', tenant.id);

  if (updateErr) {
    console.error('[uploadLogo update tenant]', updateErr);
    return { ok: false, error: '儲存連結失敗' };
  }

  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);

  return { ok: true, url: publicUrl };
}

// ========================
// Phase 27(2026-11-01):掃碼付款設定
// 攤主上傳自己的收款 QR(LINE Pay 轉帳碼、街口、全支付…),存 tenants.qr_payment jsonb:
// { enabled, image_url, label, note, link_url }。圖存 tenant-assets/{tenant}/qr-{ts}.{ext}
// ========================
type QrPaymentRow = { enabled?: boolean; image_url?: string; label?: string; note?: string; link_url?: string } | null;

async function readQrPayment(tenantId: string): Promise<NonNullable<QrPaymentRow>> {
  const { data } = await supabaseAdmin.from('tenants').select('qr_payment').eq('id', tenantId).maybeSingle();
  return ((data as { qr_payment?: QrPaymentRow } | null)?.qr_payment ?? {}) as NonNullable<QrPaymentRow>;
}

export async function uploadQrPayment(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob) || file.size === 0) return { ok: false, error: '請選一張 QR 圖片' };
  if (file.size > 3 * 1024 * 1024) return { ok: false, error: '檔案太大(應 < 3MB)' };
  const type = file.type || 'image/png';
  if (!/^image\/(png|jpe?g|webp)$/.test(type)) return { ok: false, error: '只接受 PNG、JPG、WebP' };

  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `${tenant.id}/qr-${Date.now()}.${ext}`;
  const { error: upErr } = await supabaseAdmin.storage.from('tenant-assets').upload(path, file, { contentType: type, upsert: false });
  if (upErr) {
    console.error('[uploadQrPayment upload]', upErr);
    return { ok: false, error: '上傳失敗:' + upErr.message };
  }
  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);

  const current = await readQrPayment(tenant.id);
  const { error: updErr } = await supabaseAdmin
    .from('tenants')
    .update({ qr_payment: { ...current, image_url: publicUrl, enabled: current.enabled ?? true } })
    .eq('id', tenant.id);
  if (updErr) {
    console.error('[uploadQrPayment update]', updErr);
    return { ok: false, error: '儲存失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  return { ok: true, url: publicUrl };
}

export async function saveQrPayment(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  if (!slug) return { ok: false, error: '無攤位資訊' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const label = String(formData.get('label') ?? '').trim().slice(0, 30);
  const note = String(formData.get('note') ?? '').trim().slice(0, 120);
  const linkUrl = String(formData.get('link_url') ?? '').trim().slice(0, 500);
  const enabled = formData.get('enabled') === 'on';
  if (linkUrl && !/^https?:\/\//.test(linkUrl)) return { ok: false, error: '付款連結要以 http:// 或 https:// 開頭' };

  const current = await readQrPayment(tenant.id);
  if (enabled && !current.image_url) return { ok: false, error: '要先上傳 QR 圖片才能開啟' };
  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ qr_payment: { ...current, enabled, label: label || null, note: note || null, link_url: linkUrl || null } })
    .eq('id', tenant.id);
  if (error) {
    console.error('[saveQrPayment]', error);
    return { ok: false, error: '儲存失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  return { ok: true, url: current.image_url ?? '' };
}

export async function removeQrPayment(slug: string): Promise<UploadLogoResult> {
  if (!slug) return { ok: false, error: '無攤位資訊' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };
  const { error } = await supabaseAdmin.from('tenants').update({ qr_payment: null }).eq('id', tenant.id);
  if (error) {
    console.error('[removeQrPayment]', error);
    return { ok: false, error: '移除失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  return { ok: true, url: '' };
}

/**
 * 移除 logo:把 tenants.logo_url 設 null。
 * 不刪 Storage 內舊圖(保留歷史,不影響成本因 free tier 量小)。
 */
export async function removeLogo(slug: string): Promise<UploadLogoResult> {
  if (!slug) return { ok: false, error: '無攤位資訊' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ logo_url: null })
    .eq('id', tenant.id);
  if (error) {
    console.error('[removeLogo]', error);
    return { ok: false, error: '移除失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);
  return { ok: true, url: '' };
}

/**
 * 上傳 hero banner(也作 og:image)。Phase 7.3。
 * 1200×630 jpeg,寫 tenants.og_image_url。
 * Path: {tenant_id}/banner-{ts}.jpg
 */
export async function uploadBanner(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');

  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 4 * 1024 * 1024) return { ok: false, error: '裁切後檔案應 < 4MB' };

  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const path = `${tenant.id}/banner-${Date.now()}.jpg`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType: 'image/jpeg', upsert: false });

  if (upErr) {
    console.error('[uploadBanner upload]', upErr);
    return { ok: false, error: '上傳失敗:' + upErr.message };
  }

  const {
    data: { publicUrl },
  } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);

  const { error: updateErr } = await supabaseAdmin
    .from('tenants')
    .update({ og_image_url: publicUrl })
    .eq('id', tenant.id);

  if (updateErr) {
    console.error('[uploadBanner update]', updateErr);
    return { ok: false, error: '儲存連結失敗' };
  }

  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);

  return { ok: true, url: publicUrl };
}

/**
 * 移除 banner:把 tenants.og_image_url 設 null。
 */
export async function removeBanner(slug: string): Promise<UploadLogoResult> {
  if (!slug) return { ok: false, error: '無攤位資訊' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ og_image_url: null })
    .eq('id', tenant.id);
  if (error) {
    console.error('[removeBanner]', error);
    return { ok: false, error: '移除失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  revalidatePath(`/admin/${slug}`);
  return { ok: true, url: '' };
}


// ====================
// Phase 9.8(2026-06-02):攤位 Banner 多媒體 — image / video / YouTube URL
// ====================

type BannerItem = { type: 'image' | 'video'; url: string };

async function getTenantBanners(tenantId: string): Promise<BannerItem[]> {
  const { data, error } = await supabaseAdmin
    .from('tenants')
    .select('banners')
    .eq('id', tenantId)
    .maybeSingle();
  if (error) {
    console.error('[getTenantBanners]', error);
    throw new Error('讀取現有 banner 失敗:' + error.message);
  }
  let b = (data as { banners?: unknown } | null)?.banners;
  // 防禦:若 banners 欄位被存成 JSON 字串(schema drift),先 parse 回陣列,
  // 否則會被當成空陣列 → 下一次寫入時覆蓋掉既有 banner。
  if (typeof b === 'string') {
    try {
      b = JSON.parse(b);
    } catch {
      b = null;
    }
  }
  return Array.isArray(b) ? (b as BannerItem[]) : [];
}

async function setTenantBanners(tenantId: string, banners: BannerItem[]) {
  const { error } = await supabaseAdmin.from('tenants').update({ banners }).eq('id', tenantId);
  if (error) {
    console.error('[setTenantBanners]', error);
    throw new Error('儲存 banner 失敗:' + error.message);
  }
}

function bannerRedirect(slug: string) {
  // 2026-11-01:輪播圖搬到「設定 → 外觀」分頁
  if (slug) redirect(`/admin/${slug}/settings/look`);
}

export async function addTenantBanner(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const url = String(formData.get('url') ?? '').trim();
  const tenant = await requireAdminTenant(slug);
  if (!tenant || !url || (type !== 'image' && type !== 'video')) {
    bannerRedirect(slug);
    return;
  }
  const current = await getTenantBanners(tenant.id);
  await setTenantBanners(tenant.id, [...current, { type, url }]);
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  bannerRedirect(slug);
}

export async function removeTenantBanner(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const index = Number(formData.get('index'));
  const tenant = await requireAdminTenant(slug);
  if (!tenant || !Number.isFinite(index)) {
    bannerRedirect(slug);
    return;
  }
  const current = await getTenantBanners(tenant.id);
  await setTenantBanners(tenant.id, current.filter((_, i) => i !== index));
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  bannerRedirect(slug);
}

export async function reorderTenantBanner(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const index = Number(formData.get('index'));
  const direction = String(formData.get('direction'));
  const tenant = await requireAdminTenant(slug);
  if (!tenant || !Number.isFinite(index)) {
    bannerRedirect(slug);
    return;
  }
  const current = await getTenantBanners(tenant.id);
  if (index < 0 || index >= current.length) { bannerRedirect(slug); return; }
  const targetIdx = direction === 'up' ? index - 1 : index + 1;
  if (targetIdx < 0 || targetIdx >= current.length) { bannerRedirect(slug); return; }
  const next = [...current];
  [next[index], next[targetIdx]] = [next[targetIdx], next[index]];
  await setTenantBanners(tenant.id, next);
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  bannerRedirect(slug);
}

export async function uploadTenantBannerImage(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 5 * 1024 * 1024) return { ok: false, error: '圖檔應 < 5MB' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = (file as File).name?.split('.').pop()?.toLowerCase() ?? 'jpg';
  const safeExt = ['jpg','jpeg','png','webp','gif'].includes(ext) ? ext : 'jpg';
  const contentType =
    safeExt === 'png' ? 'image/png' :
    safeExt === 'webp' ? 'image/webp' :
    safeExt === 'gif' ? 'image/gif' :
    'image/jpeg';
  const path = `${tenant.id}/banners/media/${Date.now()}.${safeExt}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType, upsert: false });
  if (upErr) { console.error('[uploadTenantBannerImage]', upErr); return { ok: false, error: '上傳失敗' }; }
  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  try {
    const current = await getTenantBanners(tenant.id);
    await setTenantBanners(tenant.id, [...current, { type: 'image', url: publicUrl }]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '儲存 banner 失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  return { ok: true, url: publicUrl };
}

export async function uploadTenantBannerVideo(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const file = formData.get('file');
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (!(file instanceof Blob)) return { ok: false, error: '無檔案' };
  if (file.size > 50 * 1024 * 1024) return { ok: false, error: '影片應 < 50MB' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = (file as File).name?.split('.').pop()?.toLowerCase() ?? 'mp4';
  const safeExt = ['mp4','mov','webm'].includes(ext) ? ext : 'mp4';
  const contentType = safeExt === 'webm' ? 'video/webm' : safeExt === 'mov' ? 'video/quicktime' : 'video/mp4';
  const path = `${tenant.id}/banners/videos/${Date.now()}.${safeExt}`;
  const { error: upErr } = await supabaseAdmin.storage
    .from('tenant-assets')
    .upload(path, file, { contentType, upsert: false });
  if (upErr) { console.error('[uploadTenantBannerVideo]', upErr); return { ok: false, error: '上傳失敗' }; }
  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  try {
    const current = await getTenantBanners(tenant.id);
    await setTenantBanners(tenant.id, [...current, { type: 'video', url: publicUrl }]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '儲存 banner 失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  return { ok: true, url: publicUrl };
}

// ====================
// Banner 瀏覽器直傳 Supabase Storage(2026-08-06)
// Server Action body 走不了大檔(next.config bodySizeLimit 2mb + Vercel 4.5MB 硬限制),
// 改成:createBannerUploadUrl 發簽名上傳連結 → 瀏覽器直傳 → finalizeBannerUpload 記進 banners。
// ====================

export type BannerUploadUrlResult =
  | { ok: true; path: string; token: string }
  | { ok: false; error: string };

export async function createBannerUploadUrl(formData: FormData): Promise<BannerUploadUrlResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const filename = String(formData.get('filename') ?? '').trim();
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (type !== 'image' && type !== 'video') return { ok: false, error: '類型錯誤' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };

  const ext = filename.split('.').pop()?.toLowerCase() ?? '';
  const safeExt =
    type === 'image'
      ? (['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(ext) ? ext : 'jpg')
      : (['mp4', 'mov', 'webm', 'm4v'].includes(ext) ? ext : 'mp4');
  const dir = type === 'image' ? 'media' : 'videos';
  const path = `${tenant.id}/banners/${dir}/${Date.now()}.${safeExt}`;

  const { data, error } = await supabaseAdmin.storage
    .from('tenant-assets')
    .createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[createBannerUploadUrl]', error);
    return { ok: false, error: '建立上傳連結失敗' };
  }
  return { ok: true, path: data.path, token: data.token };
}

export async function finalizeBannerUpload(formData: FormData): Promise<UploadLogoResult> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const type = String(formData.get('type') ?? '').trim();
  const path = String(formData.get('path') ?? '').trim();
  if (!slug) return { ok: false, error: '無攤位資訊' };
  if (type !== 'image' && type !== 'video') return { ok: false, error: '類型錯誤' };
  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { ok: false, error: '攤位不存在' };
  // path 必須落在該 tenant 自己的 banners 目錄,防止塞別人的檔案路徑
  if (!path.startsWith(`${tenant.id}/banners/`)) return { ok: false, error: '路徑不合法' };

  const { data: { publicUrl } } = supabaseAdmin.storage.from('tenant-assets').getPublicUrl(path);
  try {
    const current = await getTenantBanners(tenant.id);
    await setTenantBanners(tenant.id, [...current, { type, url: publicUrl }]);
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : '儲存 banner 失敗' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}`);
  return { ok: true, url: publicUrl };
}

// ====================
// 2026-11-01:運費規則後台(設定 → 配送)
// tenants.shipping_rules = { options: [{ key, label, fee, free_over?, note? }] }
// 以前只能請 NEOP 改 SQL;現在攤主在後台整份編輯,一次存整個陣列。
// key 是結帳與訂單記的配送方式代號,既有的不給改(舊訂單還指著它),新的由前端產生。
// ====================
// Phase 29:cvs = 超商店到店(7-ELEVEN / 全家),key 固定 cvs_711 / cvs_family,一家只能一種
type ShippingOptionRow = { key: string; label: string; fee: number; free_over?: number; note?: string; cvs?: CvsChain };

export async function saveShippingRules(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  if (!slug) return { status: 'error', error: '無攤位資訊' };

  let raw: unknown;
  try {
    raw = JSON.parse(String(formData.get('options') ?? '[]'));
  } catch {
    return { status: 'error', error: '資料格式錯誤,請重新整理再試一次' };
  }
  if (!Array.isArray(raw)) return { status: 'error', error: '資料格式錯誤,請重新整理再試一次' };
  if (raw.length > 12) return { status: 'error', error: '配送方式最多 12 種' };

  const options: ShippingOptionRow[] = [];
  const seen = new Set<string>();
  for (let i = 0; i < raw.length; i++) {
    const o = (raw[i] ?? {}) as Record<string, unknown>;
    const cvs = isCvsChain(o.cvs) ? o.cvs : null;
    // 店到店:代號固定、名稱沒填就用預設,同一家超商只能有一種
    const key = cvs ? CVS_CHAINS[cvs].key : String(o.key ?? '').trim();
    const label = String(o.label ?? '').trim() || (cvs ? CVS_CHAINS[cvs].label : '');
    const fee = Number(o.fee);
    const freeOver = o.free_over === '' || o.free_over == null ? null : Number(o.free_over);
    const note = String(o.note ?? '').trim();
    if (!/^[a-z0-9_-]{1,32}$/.test(key)) return { status: 'error', error: `第 ${i + 1} 種配送方式的代號不正確` };
    if (seen.has(key)) {
      return { status: 'error', error: cvs ? `${CVS_CHAINS[cvs].label}只能有一種` : `第 ${i + 1} 種配送方式的代號重複` };
    }
    seen.add(key);
    if (!label) return { status: 'error', error: `第 ${i + 1} 種配送方式要填名稱` };
    if (!Number.isInteger(fee) || fee < 0 || fee > 99999) {
      return { status: 'error', error: `「${label}」的運費要是 0 到 99999 的整數` };
    }
    if (freeOver != null && (!Number.isInteger(freeOver) || freeOver <= 0 || freeOver > 9999999)) {
      return { status: 'error', error: `「${label}」的免運門檻要是正整數,不要就留空` };
    }
    options.push({
      key,
      label: label.slice(0, 40),
      fee,
      ...(freeOver != null ? { free_over: freeOver } : {}),
      ...(note ? { note: note.slice(0, 120) } : {}),
      ...(cvs ? { cvs } : {}),
    });
  }

  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { status: 'error', error: '攤位不存在' };

  const { error } = await supabaseAdmin
    .from('tenants')
    .update({ shipping_rules: { options } })
    .eq('id', tenant.id);
  if (error) {
    console.error('[saveShippingRules]', error);
    return { status: 'error', error: '儲存失敗,請稍後再試' };
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
  revalidatePath(`/${slug}/checkout`);
  return { status: 'success', ts: Date.now() };
}

// ====================
// Phase 33(2026-11-06):折扣碼(設定 → 行銷)
// 新增走 useActionState 回 SettingsState(碼重複、日期顛倒要留在表單裡,admin 沒有 error.tsx);
// 停用 / 刪除跟 deleteGiftRule 一樣 throw。三支都先 requireAdminTenant(slug),寫入時一定 eq tenant_id。
// 結帳端驗碼是 server action 每次查 DB,不用 revalidate 結帳頁。
// ====================
const DISCOUNT_CODE_RE = /^[A-Z0-9]{3,20}$/;
const normalizeDiscountCode = (s: string) => s.normalize('NFKC').replace(/\s+/g, '').toUpperCase();

/** 表單的 number 欄位:空白回 null;有填就要是正整數(不是就回 NaN 讓呼叫端擋) */
function optionalPositiveInt(raw: string, max: number): number | null {
  const s = raw.trim();
  if (!s) return null;
  if (!/^\d+$/.test(s)) return Number.NaN;
  const n = Number(s);
  return Number.isSafeInteger(n) && n >= 1 && n <= max ? n : Number.NaN;
}

export async function addDiscountCode(_prev: SettingsState, formData: FormData): Promise<SettingsState> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  if (!slug) return { status: 'error', error: '無攤位資訊' };

  const code = normalizeDiscountCode(String(formData.get('code') ?? ''));
  const type = String(formData.get('type') ?? '').trim();
  const valueRaw = String(formData.get('value') ?? '').trim();
  const minRaw = String(formData.get('min_subtotal') ?? '');
  const startsRaw = String(formData.get('starts_at') ?? '').trim();
  const endsRaw = String(formData.get('ends_at') ?? '').trim();
  const maxUsesRaw = String(formData.get('max_uses') ?? '');
  const perCustomerOnce = formData.get('per_customer_once') === 'on';

  if (!DISCOUNT_CODE_RE.test(code)) return { status: 'error', error: '折扣碼只能用英文和數字,3 到 20 位' };
  if (type !== 'percent' && type !== 'fixed') return { status: 'error', error: '折扣方式不正確' };
  const value = /^\d+$/.test(valueRaw) ? Number(valueRaw) : Number.NaN;
  if (type === 'percent' && !(Number.isInteger(value) && value >= 1 && value <= 99)) {
    return { status: 'error', error: '折扣 % 要在 1 到 99 之間(10 代表打 9 折);100% 等於免費送,不給設' };
  }
  if (type === 'fixed' && !(Number.isInteger(value) && value >= 1 && value <= 9999999)) {
    return { status: 'error', error: '折抵金額要是正整數' };
  }
  const minSubtotal = optionalPositiveInt(minRaw, 9999999);
  if (Number.isNaN(minSubtotal)) return { status: 'error', error: '最低消費要是正整數,不限就留空' };
  if (type === 'fixed' && minSubtotal !== null && minSubtotal <= value) {
    return { status: 'error', error: '最低消費要大於折抵金額,否則客人會折到 0 元' };
  }

  // 日期:後台只收 YYYY-MM-DD,server 補台北時區(Vercel 跑 UTC,忘了會差 8 小時)。
  // 開始 = 當天 00:00:00,結束 = 當天 23:59:59(含當天)
  const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
  if ((startsRaw && !DATE_RE.test(startsRaw)) || (endsRaw && !DATE_RE.test(endsRaw))) {
    return { status: 'error', error: '日期格式不正確' };
  }
  const startsAtMs = startsRaw ? new Date(`${startsRaw}T00:00:00+08:00`).getTime() : null;
  const endsAtMs = endsRaw ? new Date(`${endsRaw}T23:59:59+08:00`).getTime() : null;
  if ((startsAtMs !== null && Number.isNaN(startsAtMs)) || (endsAtMs !== null && Number.isNaN(endsAtMs))) {
    return { status: 'error', error: '日期格式不正確' };
  }
  if (startsAtMs !== null && endsAtMs !== null && endsRaw < startsRaw) {
    return { status: 'error', error: '結束日要在開始日之後(可以同一天)' };
  }
  if (endsAtMs !== null && endsAtMs < Date.now()) return { status: 'error', error: '結束日已經過了' };

  const maxUses = optionalPositiveInt(maxUsesRaw, 9999999);
  if (Number.isNaN(maxUses)) return { status: 'error', error: '可用次數要是正整數,不限就留空' };

  const tenant = await requireAdminTenant(slug);
  if (!tenant) return { status: 'error', error: '攤位不存在' };

  const { count } = await supabaseAdmin
    .from('discount_codes')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenant.id);
  if ((count ?? 0) >= 100) return { status: 'error', error: '折扣碼最多 100 組,先刪掉不用的' };

  const { error } = await supabaseAdmin.from('discount_codes').insert({
    tenant_id: tenant.id,
    code,
    type,
    value,
    min_subtotal: minSubtotal,
    starts_at: startsAtMs !== null ? new Date(startsAtMs).toISOString() : null,
    ends_at: endsAtMs !== null ? new Date(endsAtMs).toISOString() : null,
    max_uses: maxUses,
    per_customer_once: perCustomerOnce,
  });
  if (error) {
    if (error.code === '23505') return { status: 'error', error: '這組折扣碼已經有了,換一個或先刪掉舊的' };
    console.error('[addDiscountCode]', error);
    return { status: 'error', error: '儲存失敗,請稍後再試' };
  }

  revalidatePath(`/admin/${slug}/settings`, 'layout');
  return { status: 'success', ts: Date.now() };
}

/** 清單上的開關:hidden tenant_slug / id,enabled 是 checkbox('on' = 開) */
export async function setDiscountCodeEnabled(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  const enabled = formData.get('enabled') === 'on';
  if (!slug || !id) throw new Error('缺必要參數');

  const tenant = await requireAdminTenant(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { data, error } = await supabaseAdmin
    .from('discount_codes')
    .update({ enabled })
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .select('id');
  if (error) {
    console.error('[setDiscountCodeEnabled]', error);
    throw new Error('儲存失敗:' + error.message);
  }
  if (!data || data.length === 0) throw new Error('折扣碼不存在');
  revalidatePath(`/admin/${slug}/settings`, 'layout');
}

/**
 * 只允許沒被用過(used_count = 0)的碼刪除:舊訂單存的是碼文字,刪了再建同名碼,
 * 「每人一次」會把舊單算進去;用過的碼只能停用。
 */
export async function deleteDiscountCode(formData: FormData): Promise<void> {
  const slug = String(formData.get('tenant_slug') ?? '').trim();
  const id = String(formData.get('id') ?? '').trim();
  if (!slug || !id) throw new Error('缺必要參數');

  const tenant = await requireAdminTenant(slug);
  if (!tenant) throw new Error('攤位不存在');

  const { data, error } = await supabaseAdmin
    .from('discount_codes')
    .delete()
    .eq('id', id)
    .eq('tenant_id', tenant.id)
    .eq('used_count', 0)
    .select('id');
  if (error) {
    console.error('[deleteDiscountCode]', error);
    throw new Error('刪除失敗:' + error.message);
  }
  if (!data || data.length === 0) {
    const { data: exists } = await supabaseAdmin.from('discount_codes').select('id').eq('id', id).eq('tenant_id', tenant.id).maybeSingle();
    throw new Error(exists ? '這組折扣碼已有訂單用過,請改停用' : '折扣碼不存在');
  }
  revalidatePath(`/admin/${slug}/settings`, 'layout');
}
