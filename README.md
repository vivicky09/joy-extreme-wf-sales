# JOY EXTREME WF Sales

静态 PWA，用于 EAN-13 扫码销售、商品搜索、本机库存记录与 CSV 导出。

扫码优先使用浏览器原生 Barcode Detection API；不支持该 API 的浏览器会使用仓库内置的 ZXing fallback。

## 部署

无需构建步骤。将仓库根目录作为 Cloudflare Pages 的静态资源目录，生产分支使用 `main`。

## 数据说明

商品库存与销售记录保存在当前浏览器的 `localStorage` 中，不会同步到其他设备。
