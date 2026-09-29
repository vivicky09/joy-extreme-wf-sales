(() => {
  'use strict';

  const config = window.__SUPABASE_CONFIG__ || {};
  const apiUrl = String(config.url || '').replace(/\/$/, '');
  const apiKey = String(config.publishableKey || config.anonKey || '');
  const configured = /^https:\/\/.+\.supabase\.co$/.test(apiUrl) && apiKey.length > 20;
  const state = { products: [], sales: [], selected: null, loading: false, selling: false };
  let operator = localStorage.getItem('jx_operator') || '';
  let stream = null;
  let scanning = false;
  let detector = null;
  let zxingControls = null;
  let toastTimer = null;

  const el = id => document.getElementById(id);
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

  function setStatus(message, type = '') {
    const node = el('syncStatus');
    node.textContent = message;
    node.className = `status ${type}`.trim();
  }

  function toast(message, type = '') {
    const node = el('toast');
    node.textContent = message;
    node.className = `toast ${type}`.trim();
    node.style.display = 'block';
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { node.style.display = 'none'; }, 2800);
  }

  async function api(path, options = {}) {
    if (!configured) throw new Error('SUPABASE_NOT_CONFIGURED');
    const response = await fetch(`${apiUrl}/rest/v1/${path}`, {
      ...options,
      headers: {
        apikey: apiKey,
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(options.headers || {})
      }
    });
    const text = await response.text();
    let body = null;
    try { body = text ? JSON.parse(text) : null; } catch { body = text; }
    if (!response.ok) {
      const error = new Error(body?.message || body?.hint || `HTTP_${response.status}`);
      error.status = response.status;
      error.details = body;
      throw error;
    }
    return body;
  }

  async function loadData(showSuccess = false) {
    if (state.loading) return;
    state.loading = true;
    setStatus('正在同步共享库存…', 'syncing');
    try {
      const [products, sales] = await Promise.all([
        api('products?select=id,ean,sku,product_name,initial_stock,current_stock,sale_price,original_price,currency,created_at,updated_at&order=product_name.asc'),
        api('sales?select=id,product_id,ean,sku,product_name,quantity,unit_price,line_total,currency,operator,sold_at,status,cancelled_at,cancelled_by&order=sold_at.desc&limit=200')
      ]);
      state.products = products || [];
      state.sales = sales || [];
      render();
      setStatus(`共享库存已同步 · ${new Date().toLocaleTimeString('zh-CN', {hour12:false})}`);
      if (showSuccess) toast('已同步最新库存');
    } catch (error) {
      setStatus(configured ? '网络异常，无法同步共享库存' : '尚未配置 Supabase，请先完成部署配置', 'error');
      if (showSuccess) toast('同步失败，请检查网络后重试', 'error');
      console.error(error);
    } finally {
      state.loading = false;
    }
  }

  function todayStart() {
    const value = new Date();
    value.setHours(0, 0, 0, 0);
    return value.getTime();
  }

  function money(value, currency = 'CNY') {
    if (value === null || value === undefined || value === '') return '价格待定';
    return new Intl.NumberFormat('zh-CN', { style: 'currency', currency: currency || 'CNY', maximumFractionDigits: 2 }).format(Number(value));
  }

  function render() {
    const today = todayStart();
    const todaySales = state.sales.filter(s => s.status === 'confirmed' && new Date(s.sold_at).getTime() >= today);
    const soldToday = todaySales.reduce((sum, s) => sum + Number(s.quantity || 0), 0);
    const revenueToday = todaySales.reduce((sum, s) => sum + Number(s.line_total || 0), 0);
    el('soldN').textContent = soldToday;
    el('revenueN').textContent = money(revenueToday);
    el('remainN').textContent = state.products.reduce((sum, p) => sum + Number(p.current_stock || 0), 0);
    el('skuN').textContent = state.products.length;
    el('operatorBtn').textContent = `操作人：${operator || '未设置'}`;
    renderProducts();
    renderSkuStats();
    renderSales();
  }

  function renderProducts() {
    const query = el('q').value.trim().toLowerCase();
    const products = state.products.filter(p => !query || [p.product_name, p.sku, p.ean].some(value => String(value || '').toLowerCase().includes(query)));
    el('products').innerHTML = products.length ? products.map(p => `
      <button class="item product-item" data-id="${esc(p.id)}">
        <span><b>${esc(p.product_name)}</b><span class="meta">${esc(p.sku || '无SKU')} · ${esc(p.ean || '无EAN')} · 初始 ${Number(p.initial_stock)}</span><span class="price">${esc(money(p.sale_price, p.currency))}${p.original_price !== null && Number(p.original_price) !== Number(p.sale_price) ? `<span class="original">${esc(money(p.original_price, p.currency))}</span>` : ''}</span></span>
        <span class="stock">剩 ${Number(p.current_stock)}</span>
      </button>`).join('') : '<div class="empty">没有匹配商品</div>';
    document.querySelectorAll('.product-item').forEach(node => node.addEventListener('click', () => openProduct(node.dataset.id)));
  }

  function renderSkuStats() {
    el('skuStats').innerHTML = state.products.map(p => {
      const initial = Number(p.initial_stock || 0);
      const current = Number(p.current_stock || 0);
      const sold = initial - current;
      const rate = initial > 0 ? `${((sold / initial) * 100).toFixed(1)}%` : '—';
      return `<tr><td>${esc(p.product_name)}</td><td>${esc(p.sku || '—')}</td><td>${esc(money(p.sale_price, p.currency))}</td><td>${initial}</td><td>${sold}</td><td>${current}</td><td>${rate}</td></tr>`;
    }).join('') || '<tr><td colspan="7">暂无数据</td></tr>';
  }

  function renderSales() {
    const visible = state.sales.slice(0, 50);
    el('sales').innerHTML = visible.length ? visible.map(s => `
      <div class="item">
        <div><b>${esc(s.product_name)}</b><div class="meta">${new Date(s.sold_at).toLocaleString('zh-CN',{hour12:false})} · ${esc(s.operator)}<br>${esc(s.sku || '无SKU')} · ${esc(s.ean || '无EAN')}</div></div>
        <div><span class="sale-status ${s.status === 'cancelled' ? 'cancelled' : ''}">${s.status === 'cancelled' ? '已撤销' : '有效'}</span><div class="meta">×${Number(s.quantity || 1)} · ${esc(money(s.line_total, s.currency))}</div></div>
      </div>`).join('') : '<div class="empty">还没有销售记录</div>';
  }

  function openProduct(id) {
    state.selected = state.products.find(p => p.id === id) || null;
    if (!state.selected) return;
    const p = state.selected;
    el('mName').textContent = p.product_name;
    el('mCode').textContent = [p.sku, p.ean].filter(Boolean).join(' · ') || '无 SKU / EAN';
    const original = p.original_price !== null && Number(p.original_price) !== Number(p.sale_price) ? `（原价 ${money(p.original_price, p.currency)}）` : '';
    el('mInfo').textContent = `单件价 ${money(p.sale_price, p.currency)}${original} · 初始 ${p.initial_stock} · 已售 ${p.initial_stock - p.current_stock} · 当前 ${p.current_stock}`;
    el('sellBtn').disabled = Number(p.current_stock) <= 0;
    el('sellBtn').textContent = Number(p.current_stock) > 0 ? '确认售出 1 件' : '库存为 0';
    el('productModal').style.display = 'flex';
  }

  function closeProduct() {
    el('productModal').style.display = 'none';
    state.selected = null;
  }

  function isNetworkError(error) {
    return !navigator.onLine || error instanceof TypeError || /fetch|network|load failed/i.test(error?.message || '');
  }

  async function confirmSale() {
    if (state.selling || !state.selected) return;
    if (!operator) { closeProduct(); openOperator(true); return; }
    if (!navigator.onLine) { toast('网络异常，本次销售未记录，请重新确认。', 'error'); return; }
    state.selling = true;
    const button = el('sellBtn');
    button.disabled = true;
    button.textContent = '提交中…';
    const product = state.selected;
    try {
      const result = await api('rpc/sell_product', { method: 'POST', body: JSON.stringify({ p_product_id: product.id, p_operator: operator }) });
      closeProduct();
      toast(`已记录：${product.product_name} · ${money(result.unit_price, result.currency)} · 剩 ${result.current_stock}`);
      await loadData(false);
    } catch (error) {
      if (/OUT_OF_STOCK/i.test(error.message)) {
        toast('库存已经为 0，本次销售未记录。', 'error');
        await loadData(false);
      } else if (isNetworkError(error)) {
        toast('网络异常，本次销售未记录，请重新确认。', 'error');
      } else {
        toast(`销售未记录：${error.message}`, 'error');
      }
      if (state.selected) openProduct(state.selected.id);
    } finally {
      state.selling = false;
    }
  }

  async function undoLast() {
    const sale = state.sales.find(s => s.status === 'confirmed');
    if (!sale) { toast('没有可撤销的有效销售'); return; }
    if (!operator) { openOperator(true); return; }
    if (!navigator.onLine) { toast('网络异常，本次撤销未记录，请重新确认。', 'error'); return; }
    const button = el('undoBtn');
    button.disabled = true;
    try {
      await api('rpc/cancel_sale', { method: 'POST', body: JSON.stringify({ p_sale_id: sale.id, p_operator: operator }) });
      toast(`已撤销：${sale.product_name}`);
      await loadData(false);
    } catch (error) {
      toast(isNetworkError(error) ? '网络异常，本次撤销未记录，请重新确认。' : `撤销失败：${error.message}`, 'error');
    } finally {
      button.disabled = false;
    }
  }

  function openOperator(required = false) {
    el('operatorInput').value = operator;
    el('operatorCancelBtn').style.visibility = required && !operator ? 'hidden' : 'visible';
    el('operatorModal').style.display = 'flex';
    setTimeout(() => el('operatorInput').focus(), 0);
  }

  function saveOperator() {
    const value = el('operatorInput').value.trim();
    if (!value) { toast('请输入工作人员姓名', 'error'); return; }
    operator = value.slice(0, 80);
    localStorage.setItem('jx_operator', operator);
    el('operatorModal').style.display = 'none';
    render();
    toast(`当前操作人：${operator}`);
  }

  async function toggleScan() {
    if (scanning) { stopScan(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { toast('此浏览器无法使用摄像头，请检查 HTTPS 与浏览器权限', 'error'); return; }
    try {
      const video = el('video');
      video.style.display = 'block';
      scanning = true;
      el('scanBtn').textContent = '停止扫码';
      if ('BarcodeDetector' in window) {
        detector = new BarcodeDetector({ formats: ['ean_13'] });
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' } } });
        video.srcObject = stream;
        await video.play();
        scanLoop();
        return;
      }
      if (window.ZXingBrowser?.BrowserMultiFormatReader) {
        const reader = new ZXingBrowser.BrowserMultiFormatReader();
        zxingControls = await reader.decodeFromConstraints({ video: { facingMode: { ideal: 'environment' } } }, video, result => {
          if (result && scanning) onBarcode(result.getText());
        });
        stream = video.srcObject;
        return;
      }
      throw new Error('SCANNER_UNSUPPORTED');
    } catch {
      stopScan();
      toast('无法打开扫码器，请检查摄像头权限', 'error');
    }
  }

  function onBarcode(code) {
    const product = state.products.find(p => p.ean === code);
    if (product) {
      navigator.vibrate?.(80);
      stopScan();
      openProduct(product.id);
    } else {
      toast(`未找到 EAN：${code}`, 'error');
    }
  }

  async function scanLoop() {
    if (!scanning) return;
    try {
      const codes = await detector.detect(el('video'));
      if (codes.length) onBarcode(codes[0].rawValue);
    } catch {}
    if (scanning) requestAnimationFrame(scanLoop);
  }

  function stopScan() {
    scanning = false;
    if (zxingControls) { zxingControls.stop(); zxingControls = null; }
    if (stream) stream.getTracks().forEach(track => track.stop());
    stream = null;
    el('video').srcObject = null;
    el('video').style.display = 'none';
    el('scanBtn').textContent = '开始扫码';
  }

  function exportCSV() {
    const rows = [['时间','EAN','SKU','品名','数量','单价','金额','币种','操作人','状态','撤销时间','撤销人'], ...state.sales.map(s => [s.sold_at,s.ean||'',s.sku||'',s.product_name,s.quantity,s.unit_price??'',s.line_total??'',s.currency||'',s.operator,s.status,s.cancelled_at||'',s.cancelled_by||''])];
    const csv = '\ufeff' + rows.map(row => row.map(value => `"${String(value ?? '').replaceAll('"','""')}"`).join(',')).join('\n');
    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'JOY_EXTREME_WF_销售流水.csv';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function bindEvents() {
    el('q').addEventListener('input', renderProducts);
    el('clearBtn').addEventListener('click', () => { el('q').value = ''; renderProducts(); });
    el('syncBtn').addEventListener('click', () => loadData(true));
    el('exportBtn').addEventListener('click', exportCSV);
    el('operatorBtn').addEventListener('click', () => openOperator(false));
    el('operatorSaveBtn').addEventListener('click', saveOperator);
    el('operatorCancelBtn').addEventListener('click', () => { el('operatorModal').style.display = 'none'; });
    el('operatorInput').addEventListener('keydown', event => { if (event.key === 'Enter') saveOperator(); });
    el('scanBtn').addEventListener('click', toggleScan);
    el('cancelSaleBtn').addEventListener('click', closeProduct);
    el('sellBtn').addEventListener('click', confirmSale);
    el('undoBtn').addEventListener('click', undoLast);
    el('productModal').addEventListener('click', event => { if (event.target === el('productModal')) closeProduct(); });
    document.addEventListener('visibilitychange', () => { if (!document.hidden) loadData(false); });
    window.addEventListener('online', () => loadData(false));
    window.addEventListener('beforeunload', stopScan);
  }

  async function init() {
    bindEvents();
    render();
    if (!operator) openOperator(true);
    await loadData(false);
    setInterval(() => loadData(false), 5000);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('./sw.js');
  }

  init();
})();
