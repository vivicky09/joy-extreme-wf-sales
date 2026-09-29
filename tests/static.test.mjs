import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

const root = resolve(import.meta.dirname, '..');
const read = file => readFile(resolve(root, file), 'utf8');

test('frontend reads shared records and writes only through RPC', async () => {
  const app = await read('app.js');
  assert.match(app, /api\('products\?select=/);
  assert.match(app, /api\('sales\?select=/);
  assert.match(app, /api\('rpc\/sell_product'/);
  assert.match(app, /api\('rpc\/cancel_sale'/);
  assert.doesNotMatch(app, /api\('products[^']*',\s*\{\s*method:\s*'(?:PATCH|POST|DELETE)'/);
  assert.doesNotMatch(app, /api\('sales[^']*',\s*\{\s*method:\s*'(?:PATCH|POST|DELETE)'/);
});

test('localStorage is used only for the device operator', async () => {
  const app = await read('app.js');
  const keys = [...app.matchAll(/localStorage\.(?:getItem|setItem)\('([^']+)'/g)].map(match => match[1]);
  assert.deepEqual([...new Set(keys)], ['jx_operator']);
});

test('network failure never reports a successful sale', async () => {
  const app = await read('app.js');
  assert.match(app, /网络异常，本次销售未记录，请重新确认。/);
  assert.match(app, /if \(!navigator\.onLine\)/);
  assert.doesNotMatch(app, /setTimeout\([^)]*confirmSale/);
});

test('database functions lock rows and keep writes atomic', async () => {
  const schema = await read('supabase/schema.sql');
  assert.match(schema, /function public\.sell_product/);
  assert.match(schema, /function public\.cancel_sale/);
  assert.equal((schema.match(/for update;/g) || []).length, 2);
  assert.match(schema, /current_stock = current_stock - 1/);
  assert.match(schema, /current_stock = current_stock \+ v_sale\.quantity/);
  assert.match(schema, /security definer/g);
  assert.match(schema, /set search_path = ''/g);
  assert.match(schema, /revoke all on table public\.products from anon, authenticated/);
  assert.match(schema, /grant select on table public\.products to anon, authenticated/);
});

test('seed preserves all 24 products and imports known prices', async () => {
  const seed = await read('supabase/seed.sql');
  assert.equal((seed.match(/^\s*\('p\d{2}'/gm) || []).length, 24);
  assert.match(seed, /'p02'.*'蝠鲼蓝色成品'.*2400, 2600, 'CNY'/);
  assert.match(seed, /'p05'.*'蝠鲼蓝色拼装'.*2200, 2400, 'CNY'/);
  assert.match(seed, /'p16'.*'纹理版鹦鹉螺'.*6300, 6300, 'CNY'/);
  assert.match(seed, /'p19'.*'机械海龟红色产品'.*null, null, 'CNY'/);
  assert.doesNotMatch(seed, /current_stock = excluded\.current_stock/);
});

test('UI and CSV include price snapshots', async () => {
  const [html, app] = await Promise.all([read('index.html'), read('app.js')]);
  assert.match(html, /id="revenueN"/);
  assert.match(html, /<th>单件价<\/th>/);
  assert.match(app, /unit_price,line_total,currency/);
  assert.match(app, /'单价','金额','币种'/);
});
