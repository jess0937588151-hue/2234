/* 中文備註：列印服務模組（v2.1.25）。
 * 變更：
 *   1. 顧客電話自動遮罩（保留店家電話完整）
 *   2. fields 欄位過濾（顧客單/廚房單/標籤獨立勾選）
 *   3. 統一列印路徑：Sunmi > 藍牙 > 網路 > 瀏覽器
 *   4. previewInModal 配合 index.html 既有 #printPreviewModal / #printPreviewFrame
 *   5. openDrawer 由設定旗標控制
 */

import { state, persistAll } from '../core/store.js';
import { maskCustomerPhone } from './customer-service.js';

// ============================================================
// 設定取得
// ============================================================
const DEFAULT_FIELDS = {
  receipt: {
    storeName: true, storePhone: true, storeAddress: true,
    orderNo: true, dateTime: true, orderType: true, customerInfo: true,
    items: true, itemPrice: true, itemQty: true, itemNote: true,
    subtotal: true, discount: true, total: true,
    paymentMethod: true, orderNote: true, footer: true
  },
  kitchen: {
    storeName: true, orderNo: true, dateTime: true, orderType: true,
    customerInfo: false,
    items: true, itemQty: true, itemNote: true, orderNote: true
  },
  label: {
    storeName: true, orderNo: true, dateTime: true, orderType: true,
    customerInfo: false,
    items: true, itemQty: true, itemNote: true
  }
};

export function getPrintSettings(){
  if(!state.settings) state.settings = {};
  if(!state.settings.printConfig) state.settings.printConfig = {};
  const cfg = state.settings.printConfig;
  // 補齊預設值
  cfg.storeName = cfg.storeName || '我的店';
  cfg.storePhone = cfg.storePhone || '';
  cfg.storeAddress = cfg.storeAddress || '';
  cfg.receiptFooter = cfg.receiptFooter || '謝謝光臨';
  cfg.receiptPaperWidth = Number(cfg.receiptPaperWidth || 58);
  cfg.labelPaperWidth = Number(cfg.labelPaperWidth || 60);
  cfg.labelPaperHeight = Number(cfg.labelPaperHeight || 40);
  cfg.receiptFontSize = Number(cfg.receiptFontSize || 12);
  cfg.labelFontSize = Number(cfg.labelFontSize || 12);
  cfg.receiptOffsetX = Number(cfg.receiptOffsetX || 0);
  cfg.receiptOffsetY = Number(cfg.receiptOffsetY || 0);
  cfg.labelOffsetX = Number(cfg.labelOffsetX || 0);
  cfg.labelOffsetY = Number(cfg.labelOffsetY || 0);
  cfg.kitchenCopies = Math.max(1, Number(cfg.kitchenCopies || 1));
  if (typeof cfg.openDrawer === 'undefined') cfg.openDrawer = true;
  if (!cfg.fields) cfg.fields = JSON.parse(JSON.stringify(DEFAULT_FIELDS));
  // 補齊缺少的子欄位
  ['receipt','kitchen','label'].forEach(kind => {
    if(!cfg.fields[kind]) cfg.fields[kind] = JSON.parse(JSON.stringify(DEFAULT_FIELDS[kind]));
    Object.keys(DEFAULT_FIELDS[kind]).forEach(f => {
      if(typeof cfg.fields[kind][f] === 'undefined'){
        cfg.fields[kind][f] = DEFAULT_FIELDS[kind][f];
      }
    });
  });
  return cfg;
}

// ============================================================
// 工具
// ============================================================
function escapeHtml(s){
  return String(s == null ? '' : s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
}

function money(v){
  return '$' + Number(v || 0).toLocaleString('zh-TW');
}

function buildSelectionText(item){
  if(!item || !Array.isArray(item.selections)) return '';
  return item.selections.map(s => `${s.moduleName}:${s.optionName}`).join(' / ');
}

function fmtDate(s){
  if(!s) return '';
  return String(s).replace('T',' ').slice(0,16);
}

// ============================================================
// 預覽 modal（配合 index.html 既有元素）
// ============================================================
export function previewInModal(html){
  const modal = document.getElementById('printPreviewModal');
  const frame = document.getElementById('printPreviewFrame');
  if(!modal || !frame){
    alert('找不到列印預覽視窗，請更新頁面後再試');
    return;
  }
  modal.classList.remove('hidden');
  const doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();

  const printBtn = document.getElementById('printPreviewPrintBtn');
  if(printBtn){
    printBtn.onclick = function(){
      try{ frame.contentWindow.print(); }
      catch(e){ alert('列印失敗：' + e.message); }
    };
  }
  const closeBtn = document.getElementById('closePrintPreviewModal');
  if(closeBtn){
    closeBtn.onclick = function(){ modal.classList.add('hidden'); };
  }
}

// ============================================================
// HTML 產生（顧客單 / 廚房單）
// ============================================================
export function getReceiptHtml(order, mode){
  const cfg = getPrintSettings();
  const isKitchen = mode === 'kitchen';
  const fields = cfg.fields[isKitchen ? 'kitchen' : 'receipt'];
  const fontSize = Number(cfg.receiptFontSize || 12);
  const paperWidthMm = Number(cfg.receiptPaperWidth || 58);
  const offX = Number(cfg.receiptOffsetX || 0);
  const offY = Number(cfg.receiptOffsetY || 0);

  const customerPhoneMasked = maskCustomerPhone(order.customerPhone);
  const lines = [];

  if(fields.storeName) lines.push(`<div class="center bold big">${escapeHtml(cfg.storeName)}</div>`);
  if(isKitchen) lines.push(`<div class="center bold">** 廚房單 **</div>`);

  const headerInfo = [];
  if(!isKitchen){
    if(fields.storePhone && cfg.storePhone) headerInfo.push(`電話：${escapeHtml(cfg.storePhone)}`);
    if(fields.storeAddress && cfg.storeAddress) headerInfo.push(`地址：${escapeHtml(cfg.storeAddress)}`);
  }
  if(headerInfo.length) lines.push(`<div class="center small">${headerInfo.join(' / ')}</div>`);

  lines.push('<div class="sep"></div>');

  if(fields.orderNo) lines.push(`<div>單號：${escapeHtml(order.orderNo || order.id || '')}</div>`);
  if(fields.dateTime) lines.push(`<div>時間：${escapeHtml(fmtDate(order.createdAt))}</div>`);
  if(fields.orderType){
    const tableInfo = order.tableNo ? ` / ${escapeHtml(order.tableNo)}` : '';
    lines.push(`<div>類型：${escapeHtml(order.orderType || '')}${tableInfo}</div>`);
  }
  if(fields.customerInfo){
    const cName = order.customerName ? escapeHtml(order.customerName) : '';
    const cPhone = customerPhoneMasked ? escapeHtml(customerPhoneMasked) : '';
    if(cName || cPhone) lines.push(`<div>顧客：${cName}${cPhone ? ' / ' + cPhone : ''}</div>`);
  }
  if(!isKitchen && fields.paymentMethod && order.paymentMethod){
    lines.push(`<div>付款：${escapeHtml(order.paymentMethod)}</div>`);
  }

  lines.push('<div class="sep"></div>');

  // 品項
  if(fields.items){
    (order.items || []).forEach(it => {
      const name = escapeHtml(it.name || '');
      const qty = Number(it.qty || 0);
      const sel = buildSelectionText(it);
      const note = it.note || '';
      const unitPrice = Number(it.basePrice || 0) + Number(it.extraPrice || 0);
      const lineTotal = unitPrice * qty;

      let mainLine = '';
      if(isKitchen){
        // 廚房單：商品大字，數量在後
        mainLine = `<div class="bold big-item">${name}${fields.itemQty ? ' x' + qty : ''}</div>`;
      } else {
        // 顧客單：左商品 右金額
        const left = `${name}${fields.itemQty ? ' x' + qty : ''}`;
        const right = fields.itemPrice ? money(lineTotal) : '';
        mainLine = `<div class="row"><span>${left}</span><span>${right}</span></div>`;
      }
      lines.push(mainLine);

      if(sel) lines.push(`<div class="indent small">${escapeHtml(sel)}</div>`);
      if(fields.itemNote && note) lines.push(`<div class="indent small">備註：${escapeHtml(note)}</div>`);
    });
  }

  if(fields.orderNote && order.customerNote){
    lines.push('<div class="sep"></div>');
    lines.push(`<div class="small">訂單備註：${escapeHtml(order.customerNote)}</div>`);
  }

  if(!isKitchen){
    lines.push('<div class="sep"></div>');
    if(fields.subtotal) lines.push(`<div class="row"><span>小計</span><span>${money(order.subtotal || order.total || 0)}</span></div>`);
    if(fields.discount && Number(order.discountAmount || 0) > 0){
      lines.push(`<div class="row"><span>折扣</span><span>-${money(order.discountAmount)}</span></div>`);
    }
    if(fields.total){
      lines.push(`<div class="row big bold"><span>合計</span><span>${money(order.total || 0)}</span></div>`);
    }
    if(fields.footer && cfg.receiptFooter){
      lines.push('<div class="sep"></div>');
      lines.push(`<div class="center">${escapeHtml(cfg.receiptFooter)}</div>`);
    }
  } else {
    // 廚房單結尾不放金額
    lines.push('<div class="sep"></div>');
  }

  const css = `
    <style>
      @page { size: ${paperWidthMm}mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: "PingFang TC","Microsoft JhengHei","Heiti TC", sans-serif;
        font-size: ${fontSize}px;
        width: ${paperWidthMm}mm;
        padding: 4mm 3mm;
        margin-left: ${offX}mm;
        margin-top: ${offY}mm;
        color: #000;
      }
      .center { text-align: center; }
      .bold { font-weight: 700; }
      .big { font-size: ${fontSize + 4}px; }
      .big-item { font-size: ${fontSize + 2}px; }
      .small { font-size: ${fontSize - 2}px; }
      .indent { padding-left: 12px; }
      .sep { border-top: 1px dashed #000; margin: 4px 0; }
      .row { display: flex; justify-content: space-between; gap: 8px; }
      div { line-height: 1.5; word-break: break-all; }
    </style>
  `;

  return `<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${lines.join('')}</body></html>`;
}

// ============================================================
// 標籤 HTML
// ============================================================
export function getLabelHtml(order){
  const cfg = getPrintSettings();
  const fields = cfg.fields.label;
  const fontSize = Number(cfg.labelFontSize || 12);
  const w = Number(cfg.labelPaperWidth || 60);
  const h = Number(cfg.labelPaperHeight || 40);
  const offX = Number(cfg.labelOffsetX || 0);
  const offY = Number(cfg.labelOffsetY || 0);

  const customerPhoneMasked = maskCustomerPhone(order.customerPhone);
  const items = order.items || [];

  // 一張標籤一個品項
  const labels = items.map(it => {
    const lines = [];
    if(fields.storeName) lines.push(`<div class="bold center">${escapeHtml(cfg.storeName)}</div>`);
    if(fields.orderNo) lines.push(`<div class="small">${escapeHtml(order.orderNo || order.id || '')}</div>`);
    if(fields.dateTime) lines.push(`<div class="small">${escapeHtml(fmtDate(order.createdAt))}</div>`);
    if(fields.orderType) lines.push(`<div class="small">${escapeHtml(order.orderType || '')}</div>`);
    if(fields.customerInfo){
      const cName = order.customerName ? escapeHtml(order.customerName) : '';
      const cPhone = customerPhoneMasked ? escapeHtml(customerPhoneMasked) : '';
      if(cName || cPhone) lines.push(`<div class="small">${cName}${cPhone ? ' / ' + cPhone : ''}</div>`);
    }

    if(fields.items){
      const name = escapeHtml(it.name || '');
      const qty = Number(it.qty || 0);
      lines.push(`<div class="bold big-item">${name}${fields.itemQty ? ' x' + qty : ''}</div>`);
      const sel = buildSelectionText(it);
      if(sel) lines.push(`<div class="small">${escapeHtml(sel)}</div>`);
      if(fields.itemNote && it.note) lines.push(`<div class="small">備註：${escapeHtml(it.note)}</div>`);
    }
    return `<div class="label">${lines.join('')}</div>`;
  }).join('');

  const css = `
    <style>
      @page { size: ${w}mm ${h}mm; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: "PingFang TC","Microsoft JhengHei","Heiti TC", sans-serif;
        font-size: ${fontSize}px;
        color: #000;
        margin-left: ${offX}mm;
        margin-top: ${offY}mm;
      }
      .label {
        width: ${w}mm; height: ${h}mm; padding: 2mm; box-sizing: border-box;
        page-break-after: always; overflow: hidden;
      }
      .center { text-align: center; }
      .bold { font-weight: 700; }
      .big-item { font-size: ${fontSize + 2}px; }
      .small { font-size: ${fontSize - 2}px; }
      div { line-height: 1.4; word-break: break-all; }
    </style>
  `;

  return `<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${labels}</body></html>`;
}

// ============================================================
// 班次報表專用 HTML（模仿廚房單版型，但抬頭改成報表）
// ============================================================
export function getSessionReportHtml(reportData){
  const cfg = getPrintSettings();
  const fontSize = Number(cfg.receiptFontSize || 12);
  const paperWidthMm = Number(cfg.receiptPaperWidth || 58);
  const offX = Number(cfg.receiptOffsetX || 0);
  const offY = Number(cfg.receiptOffsetY || 0);

  const lines = [];

  // 抬頭：店名 + 報表標題
  lines.push(`<div class="center bold big">${escapeHtml(cfg.storeName || '')}</div>`);
  lines.push(`<div class="center bold big">${escapeHtml(reportData.title || '班次報表')}</div>`);
  if(reportData.subtitle){
    lines.push(`<div class="center small">${escapeHtml(reportData.subtitle)}</div>`);
  }
  lines.push('<div class="sep"></div>');

  // 內容（一行一個 line.label）
  (reportData.lines || []).forEach(line => {
    const text = line.label || '';
    if(text.startsWith('---') || text.startsWith('===')){
      lines.push('<div class="sep"></div>');
    } else if(text.startsWith('--') && text.endsWith('--')){
      // 區塊標題加粗
      lines.push(`<div class="bold">${escapeHtml(text)}</div>`);
    } else {
      lines.push(`<div>${escapeHtml(text)}</div>`);
    }
  });

  lines.push('<div class="sep"></div>');

  const css = `
    <style>
      @page { size: ${paperWidthMm}mm auto; margin: 0; }
      html, body { margin: 0; padding: 0; }
      body {
        font-family: "PingFang TC","Microsoft JhengHei","Heiti TC", monospace, sans-serif;
        font-size: ${fontSize}px;
        width: ${paperWidthMm}mm;
        padding: 4mm 3mm;
        margin-left: ${offX}mm;
        margin-top: ${offY}mm;
        color: #000;
      }
      .center { text-align: center; }
      .bold { font-weight: 700; }
      .big { font-size: ${fontSize + 6}px; }
      .small { font-size: ${fontSize - 2}px; }
      .sep { border-top: 1px dashed #000; margin: 4px 0; }
      div { line-height: 1.5; word-break: break-all; white-space: pre-wrap; }
    </style>
  `;

  return `<!doctype html><html><head><meta charset="utf-8">${css}</head><body>${lines.join('')}</body></html>`;
}

// ============================================================
// 印表機判斷 / 路由
// ============================================================
function hasSunmi(){
  return !!(window.SunmiPrinter && typeof window.SunmiPrinter.isPrinterReady === 'function');
}
function isSunmiReady(){
  try { return hasSunmi() && window.SunmiPrinter.isPrinterReady(); }
  catch(e) { return false; }
}
function isBtReady(){
  try { return hasSunmi() && typeof window.SunmiPrinter.isBtPrinterConnected === 'function' && window.SunmiPrinter.isBtPrinterConnected(); }
  catch(e) { return false; }
}
function isNetReady(){
  try { return hasSunmi() && typeof window.SunmiPrinter.isNetPrinterConnected === 'function' && window.SunmiPrinter.isNetPrinterConnected(); }
  catch(e) { return false; }
}

// ============================================================
// 把訂單轉成 APK Bridge 用的 JSON（含 fields 與 maskedPhone）
// ============================================================
function buildBridgePayload(order, mode){
  const cfg = getPrintSettings();
  const fields = cfg.fields[mode === 'kitchen' ? 'kitchen' : (mode === 'label' ? 'label' : 'receipt')];
  return {
    mode,                                     // 'receipt' | 'kitchen' | 'label'
    fields,                                   // 欄位勾選
    openDrawer: !!cfg.openDrawer && mode === 'receipt',
    shopName: cfg.storeName || '',
    shopPhone: cfg.storePhone || '',
    shopAddress: cfg.storeAddress || '',
    footer: cfg.receiptFooter || '',
    orderNumber: String(order.orderNo || order.id || ''),
    dateTime: fmtDate(order.createdAt),
    orderType: order.orderType || '',
    tableNo: order.tableNo || '',
    paymentMethod: order.paymentMethod || '',
    customerName: order.customerName || '',
    customerPhoneMasked: maskCustomerPhone(order.customerPhone),    // ← 已遮罩
    customerNote: order.customerNote || '',
    items: (order.items || []).map(it => ({
      name: it.name || '',
      qty: Number(it.qty || 0),
      basePrice: Number(it.basePrice || 0),
      extraPrice: Number(it.extraPrice || 0),
      price: (Number(it.basePrice || 0) + Number(it.extraPrice || 0)) * Number(it.qty || 0),
      options: buildSelectionText(it),
      note: it.note || ''
    })),
    subtotal: Number(order.subtotal || 0),
    discountAmount: Number(order.discountAmount || 0),
    total: Number(order.total || 0)
  };
}

// ============================================================
// 瀏覽器 fallback：用隱藏 iframe 列印
// ============================================================
function browserPrintHtml(html){
  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.style.position = 'fixed';
    iframe.style.right = '0';
    iframe.style.bottom = '0';
    iframe.style.width = '0';
    iframe.style.height = '0';
    iframe.style.border = '0';
    document.body.appendChild(iframe);

    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open();
    doc.write(html);
    doc.close();

    iframe.onload = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch(e) { console.error('browserPrint failed:', e); }
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch(e){}
        resolve(true);
      }, 1500);
    };
    // 某些 WebView 不會觸發 onload
    setTimeout(() => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); } catch(e){}
    }, 500);
  });
}

// ============================================================
// 主路由：顧客單
// ============================================================
export async function printOrderReceipt(order, mode){
  // mode: 'customer'（顧客單）或 'kitchen'（這邊只接 customer，廚房用 printKitchenCopies）
  const realMode = mode === 'kitchen' ? 'kitchen' : 'receipt';
  const payload = buildBridgePayload(order, realMode);
  const html = getReceiptHtml(order, realMode === 'kitchen' ? 'kitchen' : 'customer');

  // 1) Sunmi 內建
  if(isSunmiReady() && typeof window.SunmiPrinter.printReceiptWithFields === 'function'){
    try {
      const ok = window.SunmiPrinter.printReceiptWithFields(JSON.stringify(payload));
      if(ok) return { route: 'sunmi', ok: true };
    } catch(e) { console.warn('Sunmi print 失敗，改用其他路徑：', e); }
  }
  // 1b) 沒有新版 bridge 方法，退回舊版 printPosReceipt
  if(isSunmiReady() && typeof window.SunmiPrinter.printPosReceipt === 'function'){
    try {
      const ok = window.SunmiPrinter.printPosReceipt(JSON.stringify(payload));
      if(ok) return { route: 'sunmi-legacy', ok: true };
    } catch(e) { console.warn('Sunmi legacy print 失敗：', e); }
  }

  // 2) 藍牙
  if(isBtReady() && typeof window.SunmiPrinter.btPrintReceiptWithFields === 'function'){
    try {
      const ok = window.SunmiPrinter.btPrintReceiptWithFields(JSON.stringify(payload));
      if(ok) return { route: 'bluetooth', ok: true };
    } catch(e) { console.warn('Bluetooth print 失敗：', e); }
  }
  if(isBtReady() && typeof window.SunmiPrinter.btPrintReceipt === 'function'){
    try {
      const ok = window.SunmiPrinter.btPrintReceipt(JSON.stringify(payload));
      if(ok) return { route: 'bluetooth-legacy', ok: true };
    } catch(e) { console.warn('Bluetooth legacy print 失敗：', e); }
  }

  // 3) 網路
  if(isNetReady() && typeof window.SunmiPrinter.netPrintReceiptWithFields === 'function'){
    try {
      const ok = window.SunmiPrinter.netPrintReceiptWithFields(JSON.stringify(payload));
      if(ok) return { route: 'network', ok: true };
    } catch(e) { console.warn('Network print 失敗：', e); }
  }
  if(isNetReady() && typeof window.SunmiPrinter.netPrintReceipt === 'function'){
    try {
      const ok = window.SunmiPrinter.netPrintReceipt(JSON.stringify(payload));
      if(ok) return { route: 'network-legacy', ok: true };
    } catch(e) { console.warn('Network legacy print 失敗：', e); }
  }

  // 4) 瀏覽器 fallback
  await browserPrintHtml(html);
  return { route: 'browser', ok: true };
}

// ============================================================
// 主路由：廚房單（依設定份數列印）
// ============================================================
export async function printKitchenCopies(order){
  const cfg = getPrintSettings();
  const copies = Math.max(1, Number(cfg.kitchenCopies || 1));
  const payload = buildBridgePayload(order, 'kitchen');
  const html = getReceiptHtml(order, 'kitchen');

  for(let i = 0; i < copies; i++){
    // 1) Sunmi
    if(isSunmiReady() && typeof window.SunmiPrinter.printKitchenWithFields === 'function'){
      try { window.SunmiPrinter.printKitchenWithFields(JSON.stringify(payload)); continue; }
      catch(e) { console.warn('Sunmi kitchen 失敗：', e); }
    }
    if(isSunmiReady() && typeof window.SunmiPrinter.printKitchenReceipt === 'function'){
      try { window.SunmiPrinter.printKitchenReceipt(JSON.stringify(payload)); continue; }
      catch(e) {}
    }
    // 2) 藍牙
    if(isBtReady() && typeof window.SunmiPrinter.btPrintKitchenWithFields === 'function'){
      try { window.SunmiPrinter.btPrintKitchenWithFields(JSON.stringify(payload)); continue; }
      catch(e) {}
    }
    if(isBtReady() && typeof window.SunmiPrinter.btPrintKitchen === 'function'){
      try { window.SunmiPrinter.btPrintKitchen(JSON.stringify(payload)); continue; }
      catch(e) {}
    }
    // 3) 網路
    if(isNetReady() && typeof window.SunmiPrinter.netPrintKitchenWithFields === 'function'){
      try { window.SunmiPrinter.netPrintKitchenWithFields(JSON.stringify(payload)); continue; }
      catch(e) {}
    }
    if(isNetReady() && typeof window.SunmiPrinter.netPrintKitchen === 'function'){
      try { window.SunmiPrinter.netPrintKitchen(JSON.stringify(payload)); continue; }
      catch(e) {}
    }
    // 4) 瀏覽器
    await browserPrintHtml(html);
  }
  return { ok: true, copies };
}

// ============================================================
// 主路由：標籤
// ============================================================
export async function printOrderLabels(order){
  const payload = buildBridgePayload(order, 'label');
  const html = getLabelHtml(order);

  if(isSunmiReady() && typeof window.SunmiPrinter.printLabelWithFields === 'function'){
    try {
      const ok = window.SunmiPrinter.printLabelWithFields(JSON.stringify(payload));
      if(ok) return { route: 'sunmi', ok: true };
    } catch(e) { console.warn('Sunmi label 失敗：', e); }
  }
  if(isBtReady() && typeof window.SunmiPrinter.btPrintLabelWithFields === 'function'){
    try {
      const ok = window.SunmiPrinter.btPrintLabelWithFields(JSON.stringify(payload));
      if(ok) return { route: 'bluetooth', ok: true };
    } catch(e) { console.warn('Bluetooth label 失敗：', e); }
  }
  if(isNetReady() && typeof window.SunmiPrinter.netPrintLabelWithFields === 'function'){
    try {
      const ok = window.SunmiPrinter.netPrintLabelWithFields(JSON.stringify(payload));
      if(ok) return { route: 'network', ok: true };
    } catch(e) { console.warn('Network label 失敗：', e); }
  }

  // 標籤無 legacy 對應，直接 fallback 瀏覽器
  await browserPrintHtml(html);
  return { route: 'browser', ok: true };
}

// ============================================================
// 錢箱
// ============================================================
export function openCashDrawer(){
  if(isSunmiReady() && typeof window.SunmiPrinter.openCashDrawer === 'function'){
    try { return window.SunmiPrinter.openCashDrawer(); }
    catch(e) { return false; }
  }
  if(isBtReady() && typeof window.SunmiPrinter.btOpenCashDrawer === 'function'){
    try { return window.SunmiPrinter.btOpenCashDrawer(); }
    catch(e) { return false; }
  }
  if(isNetReady() && typeof window.SunmiPrinter.netOpenCashDrawer === 'function'){
    try { return window.SunmiPrinter.netOpenCashDrawer(); }
    catch(e) { return false; }
  }
  return false;
}

// ============================================================
// 預覽用：依購物車組假訂單
// ============================================================
export function buildCartPreviewOrder(){
  const items = Array.isArray(state.cart) ? state.cart : [];
  const subtotal = items.reduce((s, it) => s + (Number(it.basePrice || 0) + Number(it.extraPrice || 0)) * Number(it.qty || 0), 0);
  return {
    orderNo: 'PREVIEW-' + Date.now(),
    createdAt: new Date().toISOString(),
    orderType: '內用',
    tableNo: '',
    paymentMethod: '現金',
    customerName: '範例顧客',
    customerPhone: '0912345678',
    items,
    subtotal,
    discountAmount: 0,
    total: subtotal
  };
}
/**
 * 班次報表專用：把報表資料包成 Sunmi Bridge 接受的「假訂單」格式列印
 * @param {Object} reportData - 班次報表資料
 * @param {Array<{label:string, value:string|number}>} reportData.lines - 每行內容
 * @param {string} reportData.title - 報表標題
 * @param {string} reportData.subtitle - 副標（人員/日期）
 */
export async function printSessionReportViaBridge(reportData){
  // 把 lines 包成廚房單品項格式（純文字，無金額右欄）
  const items = (reportData.lines || []).map(line => ({
    name: line.label || '',
    qty: 0,
    basePrice: 0,
    extraPrice: 0,
    options: '',
    note: ''
  }));

  const fakeOrder = {
    orderNo: reportData.title || '班次報表',
    createdAt: new Date().toISOString(),
    orderType: reportData.subtitle || '',
    tableNo: '',
    paymentMethod: '',
    customerName: '',
    customerPhone: '',
    items,
    subtotal: 0,
    discountAmount: 0,
    total: 0
  };

  const payload = buildBridgePayload(fakeOrder, 'kitchen');
  // 強制覆蓋 fields：不印 storeName、關掉 itemQty、保留 orderNo（會印「單號：班次報表」）
  payload.fields = {
    storeName: false,
    orderNo: true,
    dateTime: true,
    orderType: true,
    customerInfo: false,
    items: true,
    itemQty: false,
    itemNote: false,
    orderNote: false
  };
  // 加一個自訂抬頭欄位給 APK 看（如果 APK 支援）
  payload.reportTitle = reportData.title || '班次報表';
  payload.reportSubtitle = reportData.subtitle || '';
  payload.isReport = true;

  // 瀏覽器 fallback 用我們自製的報表 HTML
  const html = getSessionReportHtml(reportData);

  // 1) Sunmi 廚房 API
  if(isSunmiReady() && typeof window.SunmiPrinter.printKitchenWithFields === 'function'){
    try{
      const ok = window.SunmiPrinter.printKitchenWithFields(JSON.stringify(payload));
      if(ok) return { route:'sunmi-kitchen', ok:true };
    }catch(e){ console.warn('Sunmi 廚房報表失敗：', e); }
  }
  if(isSunmiReady() && typeof window.SunmiPrinter.printKitchenReceipt === 'function'){
    try{
      const ok = window.SunmiPrinter.printKitchenReceipt(JSON.stringify(payload));
      if(ok) return { route:'sunmi-kitchen-legacy', ok:true };
    }catch(e){}
  }
  // 2) 藍牙
  if(isBtReady() && typeof window.SunmiPrinter.btPrintKitchenWithFields === 'function'){
    try{
      const ok = window.SunmiPrinter.btPrintKitchenWithFields(JSON.stringify(payload));
      if(ok) return { route:'bt-kitchen', ok:true };
    }catch(e){}
  }
  if(isBtReady() && typeof window.SunmiPrinter.btPrintKitchen === 'function'){
    try{
      const ok = window.SunmiPrinter.btPrintKitchen(JSON.stringify(payload));
      if(ok) return { route:'bt-kitchen-legacy', ok:true };
    }catch(e){}
  }
  // 3) 網路
  if(isNetReady() && typeof window.SunmiPrinter.netPrintKitchenWithFields === 'function'){
    try{
      const ok = window.SunmiPrinter.netPrintKitchenWithFields(JSON.stringify(payload));
      if(ok) return { route:'net-kitchen', ok:true };
    }catch(e){}
  }
  if(isNetReady() && typeof window.SunmiPrinter.netPrintKitchen === 'function'){
    try{
      const ok = window.SunmiPrinter.netPrintKitchen(JSON.stringify(payload));
      if(ok) return { route:'net-kitchen-legacy', ok:true };
    }catch(e){}
  }

  // 4) 瀏覽器 fallback（用我們自製版面，抬頭正確）
  await browserPrintHtml(html);
  return { route:'browser', ok:true };
}

