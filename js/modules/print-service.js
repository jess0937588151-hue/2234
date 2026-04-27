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
