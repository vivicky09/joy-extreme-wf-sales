# JOY EXTREME WF Sales

面向展会现场的共享库存 PWA。约 4 名工作人员可分别用手机访问同一页面，共享商品、实时库存和销售流水。

## 功能

- EAN-13 摄像头扫码（原生 Barcode Detection，ZXing 本地 fallback）
- 品名、SKU、EAN 搜索；无 EAN 商品也可销售
- Supabase 共享库存与销售流水
- PostgreSQL RPC 原子销售和撤销，库存不会扣成负数
- 工作人员姓名仅保存于本机 `localStorage`
- 当前库存、今日销量/销售额、Sell-through、操作人及状态
- 成交价快照、历史保留式撤销、CSV 导出

## Supabase 初始化

1. 新建 Supabase project。
2. 在 SQL Editor 先执行 `supabase/schema.sql`，再执行 `supabase/seed.sql`。
3. 从 Project Settings > API 复制 Project URL 和 publishable key（旧项目可使用 anon key）。
4. 不要把 `service_role` key 或数据库密码放入网页、GitHub 或 Cloudflare Pages。

浏览器角色只有 `products` / `sales` 的读取权限，以及两个 RPC 的执行权限。库存增减和销售写入只能经过 `sell_product` / `cancel_sale`。

## 本地构建与测试

```sh
npm test
npm run build
```

本地连接 Supabase 时可临时传入公开配置：

```sh
SUPABASE_URL=https://PROJECT.supabase.co \
SUPABASE_PUBLISHABLE_KEY=PUBLIC_KEY \
npm run build
```

然后用静态服务器打开 `dist/`。源代码中的 `config.js` 保持为空，不保存任何项目配置。

## Cloudflare Pages

- Production branch：先保留 `main`；确认测试后再合并 `shared-inventory`
- Build command：`npm run build`
- Build output directory：`dist`
- Environment variables：`SUPABASE_URL`、`SUPABASE_PUBLISHABLE_KEY`

两项配置都是浏览器可公开使用的 Supabase 配置，但仍建议通过 Pages 环境变量注入。构建不会接受或使用 `service_role` key。

## 价格数据

`products.sale_price` 是图片中的单件折扣价，`original_price` 是原价，币种为 CNY。销售时 RPC 将当前单件价复制到 `sales.unit_price`，因此之后修改商品价格不会影响历史流水。

图片无法明确匹配到现有版本的商品保留空价。图片中的“两件减 500”属于跨商品组合促销，当前单件确认流程不自动套用该优惠。
