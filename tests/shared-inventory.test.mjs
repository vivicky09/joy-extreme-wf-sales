import test from 'node:test';
import assert from 'node:assert/strict';

class SharedInventory {
  constructor(products) {
    this.products = new Map(products.map(product => [product.id, { ...product }]));
    this.sales = [];
    this.queue = Promise.resolve();
  }

  transaction(action) {
    const result = this.queue.then(action);
    this.queue = result.catch(() => {});
    return result;
  }

  sell(productId, operator) {
    return this.transaction(async () => {
      const product = this.products.get(productId);
      if (!product) throw new Error('PRODUCT_NOT_FOUND');
      if (product.currentStock <= 0) throw new Error('OUT_OF_STOCK');
      await Promise.resolve();
      product.currentStock -= 1;
      const sale = {
        id: `sale-${this.sales.length + 1}`,
        productId,
        operator,
        status: 'confirmed',
        unitPrice: product.salePrice,
        productName: product.productName
      };
      this.sales.push(sale);
      return { ...sale, currentStock: product.currentStock };
    });
  }

  cancel(saleId, operator) {
    return this.transaction(async () => {
      const sale = this.sales.find(candidate => candidate.id === saleId);
      if (!sale) throw new Error('SALE_NOT_FOUND');
      if (sale.status === 'cancelled') throw new Error('ALREADY_CANCELLED');
      const product = this.products.get(sale.productId);
      product.currentStock += 1;
      sale.status = 'cancelled';
      sale.cancelledBy = operator;
      return { ...sale, currentStock: product.currentStock };
    });
  }

  snapshot() {
    return {
      products: [...this.products.values()].map(value => ({ ...value })),
      sales: this.sales.map(value => ({ ...value }))
    };
  }
}

const product = (overrides = {}) => ({
  id: 'p01', productName: '蝠鲼蓝色成品', sku: 'MR0536-B-E1', ean: '6976906830000',
  currentStock: 5, salePrice: 2400, ...overrides
});

test('Test 1/3: clients share persisted stock and sales', async () => {
  const db = new SharedInventory([product()]);
  await db.sell('p01', '员工A');
  const refreshedClientB = db.snapshot();
  assert.equal(refreshedClientB.products[0].currentStock, 4);
  assert.equal(refreshedClientB.sales.length, 1);
  assert.equal(refreshedClientB.sales[0].unitPrice, 2400);
});

test('Test 2/5: two simultaneous sales cannot oversell the final unit', async () => {
  const db = new SharedInventory([product({ currentStock: 1 })]);
  const results = await Promise.allSettled([db.sell('p01', '员工A'), db.sell('p01', '员工B')]);
  assert.equal(results.filter(result => result.status === 'fulfilled').length, 1);
  assert.equal(results.filter(result => result.status === 'rejected').length, 1);
  assert.equal(db.snapshot().products[0].currentStock, 0);
  await assert.rejects(db.sell('p01', '员工C'), /OUT_OF_STOCK/);
});

test('Test 4: cancellation restores stock and retains the cancelled sale', async () => {
  const db = new SharedInventory([product({ currentStock: 2 })]);
  const sale = await db.sell('p01', '员工A');
  await db.cancel(sale.id, 'Victoria');
  const snapshot = db.snapshot();
  assert.equal(snapshot.products[0].currentStock, 2);
  assert.equal(snapshot.sales.length, 1);
  assert.equal(snapshot.sales[0].status, 'cancelled');
  assert.equal(snapshot.sales[0].cancelledBy, 'Victoria');
});

test('Test 6: an offline client creates no optimistic sale', async () => {
  const db = new SharedInventory([product()]);
  const confirm = online => online ? db.sell('p01', '员工A') : Promise.reject(new Error('网络异常，本次销售未记录，请重新确认。'));
  await assert.rejects(confirm(false), /本次销售未记录/);
  assert.equal(db.snapshot().products[0].currentStock, 5);
  assert.equal(db.snapshot().sales.length, 0);
});

test('Test 7: a product without EAN can be found by name or SKU and sold', async () => {
  const db = new SharedInventory([product({ id: 'p-no-ean', productName: '无条码测试商品', sku: 'SKU-NO-EAN', ean: null, currentStock: 1 })]);
  const query = '无条码';
  const found = db.snapshot().products.find(item => [item.productName, item.sku, item.ean].some(value => String(value || '').includes(query)));
  assert.equal(found.id, 'p-no-ean');
  await db.sell(found.id, '员工D');
  assert.equal(db.snapshot().products[0].currentStock, 0);
});
