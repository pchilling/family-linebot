# New Era Oil 相關（這裡只留一個指標）

New Era Oil 的**知識站是獨立專案**，不在這個 repo：`../neraoil`（neraoil.tw）。
規格、路由、資料表都在那邊的 `CLAUDE.md`、`docs/ROUTES.md`、`db/schema.sql`。

這個 repo 之後會多一個攤位：**New Era Oil 的周邊商城**（擴香機、書籍等，不賣精油）。
建那個攤位時：

- 用現成的 products / orders / cart / 出貨單，不用重寫。
- 商品頁文案只寫規格（容量、材質、噪音、保固），**一個療效字都不能有**。
- 不賣精油，也不賣任何宣稱效果的產品。
- 兩邊共用平台層 `platform_users`，會員與稱號不會分裂。
