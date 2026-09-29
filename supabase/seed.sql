-- Existing PWA product catalog and initial inventory.
-- Prices are CNY. NULL means the supplied price sheet did not identify a safe match.
-- Run after schema.sql. Re-running does not reset current_stock for existing rows.

insert into public.products (
  id, ean, sku, product_name, initial_stock, current_stock,
  sale_price, original_price, currency
) values
  ('p01', '6976906830086', 'MR0536-W-E1', '蝠鲼白色成品', 3, 3, 2400, 2600, 'CNY'),
  ('p02', '6976906830000', 'MR0536-B-E1', '蝠鲼蓝色成品', 5, 5, 2400, 2600, 'CNY'),
  ('p03', '6976906830024', 'MR0536-P-E2', '蝠鲼原色拼装', 3, 3, 2400, 2600, 'CNY'),
  ('p04', '6976906830017', 'MR0536-P-E1', '蝠鲼原色成品', 3, 3, 2600, 2800, 'CNY'),
  ('p05', '6976906836668', 'MR0536-B-E2', '蝠鲼蓝色拼装', 10, 10, 2200, 2400, 'CNY'),
  ('p06', '6976906830079', 'MR0536-W-E2', '蝠鲼白色拼装', 3, 3, 2200, 2400, 'CNY'),
  ('p07', '6976906830178', 'MR0536-D-E2', '蝠鲼黑色拼装', 3, 3, 2700, 2900, 'CNY'),
  ('p08', '6976906830161', 'MR0536-D-E1', '蝠鲼黑色成品', 3, 3, 2900, 3100, 'CNY'),
  ('p09', '6976906830048', 'NAU0537-W-E2', '鹦鹉螺白色拼装', 8, 8, 5200, 5400, 'CNY'),
  ('p10', '6976906830031', 'NAU0537-W-E1', '鹦鹉螺白色成品', 3, 3, 5400, 5600, 'CNY'),
  ('p11', '6976906830062', 'NAU0537-P-E2', '鹦鹉螺原色拼装', 5, 5, 5200, 5400, 'CNY'),
  ('p12', '6976906830055', 'NAU0537-P-E1', '鹦鹉螺原色成品', 3, 3, 5400, 5600, 'CNY'),
  ('p13', null, null, '雕刻鹦鹉螺', 0, 0, null, null, 'CNY'),
  ('p14', null, null, '战损蝠鲼', 1, 1, null, null, 'CNY'),
  ('p15', null, null, '金色鲸鱼', 0, 0, null, null, 'CNY'),
  ('p16', '6976906830253', 'NAU0537-V-E1', '纹理版鹦鹉螺', 9, 9, 6300, 6300, 'CNY'),
  ('p17', '6976906830307', 'CC0539-P-E1', '机械海龟原色成品', 0, 0, 3100, 3500, 'CNY'),
  ('p18', null, null, '机械海龟白色成品', 0, 0, null, null, 'CNY'),
  ('p19', null, null, '机械海龟红色产品', 0, 0, null, null, 'CNY'),
  ('p20', null, null, '机械鲸鱼金属原色中文产品', 0, 0, null, null, 'CNY'),
  ('p21', null, null, '15cm蝠鲼', 0, 0, null, null, 'CNY'),
  ('p22', null, null, '15cm鹦鹉螺', 0, 0, null, null, 'CNY'),
  ('p23', null, null, '15cm海龟', 0, 0, null, null, 'CNY'),
  ('p24', null, null, '15cm鲸鱼', 0, 0, null, null, 'CNY')
on conflict (id) do update set
  ean = excluded.ean,
  sku = excluded.sku,
  product_name = excluded.product_name,
  initial_stock = excluded.initial_stock,
  sale_price = excluded.sale_price,
  original_price = excluded.original_price,
  currency = excluded.currency,
  updated_at = now();
