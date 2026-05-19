# Family LINE Bot

NEO Potential Studio · 家族事業 LINE Bot(三合一教室 + 愛油哇商行 multi-tenant)

**Production**:https://family-linebot-delta.vercel.app
**LIFF**:https://liff.line.me/2010125926-mRl3l3lO
**Bot LINE ID**:`@076bahie`(三合一愛油哇)

---

## Tech stack

- Next.js 15(App Router)+ TypeScript + React 19
- Supabase(Postgres + Auth)
- `@line/bot-sdk`(webhook)+ `@line/liff`(webview)
- Vercel(push to main = auto deploy)

## Quick start(本機 dev)

```bash
npm install
cp .env .env.local    # 或直接編輯 .env
npm run dev           # http://localhost:3000
```

`.env` 內必要的:LINE / Supabase / Vercel env vars(完整清單見 `docs/progress.md` 二章)。

## 目錄

```
app/
  api/webhook/route.ts             LINE webhook handler
  admin/
    login/                         管理員登入(Supabase Auth)
    [tenant]/                      tenant-aware admin(layout 有 nav)
      classes/                     課程 CRUD(oilswa 用)
      products/                    商品 + nested variants CRUD
      orders/                      訂單列表
      orders/[id]/                 訂單詳情 + 改狀態
      customers/                   客戶名單 + 訂單統計
      inventory/                   庫存追蹤 + 異動歷史
    {classes,products,orders}/     legacy routes redirect 預設 tenant
  m/
    member/                        LIFF 會員專區
    shop/                          LIFF 商品瀏覽 + 購物車 + 下單(legacy,Stage C 改 tenant-aware)
lib/
  line.ts                          LINE SDK + 簽章驗證 + describeEvent
  supabase.ts                      admin client(service_role)+ helpers
  supabase-server.ts               SSR-aware client(cookie session)
db/schema.sql                      Postgres schema(累積 SQL,fresh deploy)
scripts/setup-rich-menu.ts         Rich Menu 建立 / 上傳 script
middleware.ts                      refresh session + protect /admin/*
docs/
  STALL_ARCHITECTURE.md            Stall 架構決定(source of truth)
  Stall_README.md                  Stall 商業策略
  SPEC.md                          family-linebot 工程規格
  progress.md                      進度 + flows + 部署紀錄
```

## 進度

- v1 平台上線(2026-05-18)
- Phase 1-3 完成:本月課程 / admin CRUD / LIFF 會員專區
- Phase 4a-c 完成:線 2 月 1(商品 / 訂單 / 庫存 + LIFF 下單)
- Stall Phase A 完成:platform_users / tenant_customers 拆分 + Cyndi tenant
- Phase 4-Alpha 完成:admin routes 全 tenant-aware(`/admin/[tenant]/...`)
- Variant Stage A+B 完成:product / variant 兩層(對齊 GraceHan)

下一個 milestone:Variant Stage C(LIFF / inventory / orders 切 variant_id)+ Phase 4-Gamma(公開網站)。詳見 `docs/progress.md`。

## 設計

- **Multi-tenant** + **Stall 平台架構**:詳見 `docs/STALL_ARCHITECTURE.md`(source of truth)
- **Rich Menu**:5 格(本月課程 / 最新消息 / 商品專區 / 會員中心 / 專屬客服)— 詳見 `docs/SPEC.md` 第三章
- **3 個月 milestone**:詳見 `docs/SPEC.md` 第二章

## ⚠️ doTERRA 政策紅線(必避)

任何加入專案的人(包括 AI agent)寫功能前必看:

- **不做** PV 追蹤 / 計算機
- **不做** LRP 養成 / 提醒
- **不做** 精油直銷 / 把產品變輔銷品功能
- 依據:doTERRA Compensation Plan 第 5.C / 5.D / 5.E / 10.A / 10.B.7 條

完整紅線詳見 `docs/SPEC.md` 第七章。

## 主權

程式碼版權屬 NEO Potential Studio。家族事業有無償使用權。

## 私人 context

完整商業背景 / 紅線 / 接班規劃在 vault `1_Projects/家族數位化升級/README.md`(私,不入 git)。
