# NEOP STALL — 專案規則

多租戶平台（Next.js App Router + Supabase + Vercel + LINE）。一個 codebase，多個「攤位」。

## 先讀
- `docs/STALL_ARCHITECTURE.md` — 架構決定，標「已 lock」的不要動。
- `docs/SPEC.md`、`docs/progress.md` — 規格與進度（progress 末段有歷次 migration SQL）。
- `docs/NEWERA.md` — New Era Oil 這個租戶的規則（法規紅線、資料表、路由、前端規格、用詞）。

## 平台慣例（照做，不要自創）
- 公開頁 `app/[slug]/...`、LIFF `app/m/...`、後台 `app/admin/[tenant]/...`。slug 來自 `tenants.slug`。
- 資料存取一律 server-side，用 `lib/supabase.ts` 的 `supabaseAdmin`（service_role）。
  每張表都 `enable row level security` 但**不建 policy**，等於 anon/authenticated 一律擋掉。新表照這個做。
- 「人」是平台層的 `platform_users`；登入方式在 `platform_user_auth_methods`（line / email / google），
  重複帳號用 `merged_into_user_id` 合併。租戶身分在 `tenant_members`。不要為單一租戶另開一套帳號表。
- 租戶差異用 feature flag（`tenants.features`），不要在共用元件裡塞 if 判斷租戶名稱。
- 資料表 schema 一律寫進 `db/`，並在 `docs/progress.md` 留 migration SQL。

## 這個 repo 的租戶
- `oilswa`（愛油哇，電商，已上線）、`cyndi`、`kim`。
- New Era Oil 的**知識站不在這個 repo**，是獨立專案 `../neraoil`（neraoil.tw）。
  這裡之後只會多一個「New Era Oil 周邊商城」攤位（擴香機、書籍，不賣精油），見 `docs/NEWERA.md`。

## 寫程式時
- 繁體中文註解與 UI 文案。
- 改動前先看該租戶的規格文件；規格沒寫的、會影響對外文案或法規的，先問 Peter，不要自己決定。
