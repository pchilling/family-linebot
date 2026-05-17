# Family LINE Bot

NEO Potential Studio · 家族事業 LINE Bot(三合一教室 + 愛油哇商行 multi-tenant)

## Tech stack

- Next.js 15(App Router)+ TypeScript
- Supabase(Postgres)
- `@line/bot-sdk`
- Vercel 部署

## Quick start

```bash
npm install
cp .env.local.example .env.local   # 填入 LINE / Supabase 資料
npm run dev                        # http://localhost:3000
```

## 目錄

```
app/api/webhook/route.ts   LINE webhook
lib/line.ts                LINE SDK / 簽章驗證
lib/supabase.ts            Supabase client
db/schema.sql              multi-tenant schema
scripts/setup-rich-menu.ts Rich Menu 建立 script
```

## Multi-tenant 設計

從 day 1 用 `tenant_id` 切租戶。v1 家裡先用一個 tenant,之後複製給 [[Monica]] 9 位銀級下線領袖 / 外部客戶。

## 主權

程式碼版權屬 NEO Potential Studio。家族事業有無償使用權。

## 相關

vault 內 `1_Projects/家族數位化升級/README.md`(私有,不入 git)。
