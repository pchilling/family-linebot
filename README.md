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
  api/webhook/route.ts    LINE webhook handler
  admin/                  管理員後台(Supabase Auth)
    login/                登入
    classes/              課程 CRUD
  m/
    member/               LIFF 會員專區(用戶填會員資料)
lib/
  line.ts                 LINE SDK + 簽章驗證 + describeEvent
  supabase.ts             admin client(service_role)+ classes / users helper
  supabase-server.ts      SSR-aware client(cookie session,給 admin 用)
db/schema.sql             Postgres schema
scripts/setup-rich-menu.ts  Rich Menu 建立 / 上傳 script
middleware.ts             refresh session + protect /admin/*
docs/
  SPEC.md                 規格(功能 milestone + Rich Menu + tech stack)
  progress.md             進度 + flows + 部署紀錄
```

## 進度

v1 平台上線(2026-05-18)+ Phase 1-3 完成(本月課程 from DB / admin CRUD / LIFF 會員專區)。完整 timeline 見 `docs/progress.md`。

## 設計

- **Multi-tenant**:從 day 1 用 `tenant_id` 隔離,未來複製給下線領袖不需重做架構
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
