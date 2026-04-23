/* 中文備註：商用列印服務，提供顧客單、廚房單、標籤列印，並可調整紙張大小、位移與字體大小。 */
import { state } from '../core/store.js';

function ensurePrintConfig(){
  if(!state.settings) state.settings = {};
  if(!state.settings.printConfig){
    state.settings.printConfig = {
      storeName: '餐廳 POS',
      storePhone: '',
      storeAddress: '',
      receiptFooter: '謝謝光臨，歡迎再次蒞臨',
      receiptPaperWidth: 58,
      labelPaperWidth: 60,
      labelPaperHeight: 40,
      receiptFontSize: 12,
      labelFontSize: 12,
      receiptOffsetX: 0,
      receiptOffsetY: 0,
      labelOffsetX: 0,
      labelOffsetY: 0,
      kitchenCopies: 1,
      autoPrintCheckout: false,
      autoPrintKitchen: true
    };
  }
  // 確保紙寬是數字
  var cfg = state.settings.printConfig;
  cfg.receiptPaperWidth = Number(cfg.receiptPaperWidth) || 58;
  cfg.receiptFontSize = Number(cfg.receiptFontSize) || 12;
  return cfg;
}

export function getPrintSettings(){
  return ensurePrintConfig();
}

function escapeHtml(text){
  return String(text ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function money(value){
  return '$' + Number(value || 0).toFixed(0);
}

function buildSelectionText(item){
  const optionText = (item.selections || []).map(s => `${s.moduleName}:${s.optionName}`).join(' / ');
  const noteText = item.note ? `備註：${item.note}` : '';
  return [optionText, noteText].filter(Boolean).join(' | ');
}

// ========== 列印核心 ==========

function openPrintWindow(html){
  var frame = document.getElementById('_silentPrintFrame');
  if(frame) frame.remove();
  
  frame = document.createElement('iframe');
  frame.id = '_silentPrintFrame';
  frame.style.cssText = 'position:fixed;left:-9999px;top:0;width:80mm;height:auto;border:none;';
  document.body.appendChild(frame);
  
  var doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html);
  doc.close();
  
  frame.onload = function(){
    setTimeout(function(){
      try { frame.contentWindow.print(); } catch(e){ window.print(); }
    }, 600);
  };
}




// ========== 開錢箱 ==========

export function openCashDrawer(){
  // 由 ALLPOS Printer 的 Cash Drawer Command 設定控制
}

// ========== 建立收據 HTML ==========

function buildReceiptHtml(order, mode){
  var cfg = ensurePrintConfig();
  var widthMm = Math.max(30, Number(cfg.receiptPaperWidth) || 58);
  var fontSize = Math.max(8, Number(cfg.receiptFontSize) || 12);
  var offsetX = Number(cfg.receiptOffsetX || 0);
  var offsetY = Number(cfg.receiptOffsetY || 0);
  var kitchenMode = mode === 'kitchen';
  var title = kitchenMode ? '廚房出單' : '顧客收據';
  var createdAt = String(order.createdAt || '').replace('T', ' ').slice(0, 16);

  var rows = (order.items || []).map(function(item){
    var unitPrice = Number(item.basePrice || 0) + Number(item.extraPrice || 0);
    var subText = buildSelectionText(item);
    return `
      <div class="item-row">
        <div class="item-top">
          <div class="item-name">${escapeHtml(item.name)}</div>
          <div class="item-qty">x ${Number(item.qty || 0)}</div>
        </div>
        ${subText ? '<div class="item-sub">' + escapeHtml(subText) + '</div>' : ''}
        ${kitchenMode ? '' : '<div class="item-sub">' + money(unitPrice) + ' / 小計 ' + money(unitPrice * Number(item.qty || 0)) + '</div>'}
      </div>
    `;
  }).join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>${title}</title>
<style>
  @page { size: ${widthMm}mm auto; margin: 0; padding: 0; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 0;
    width: ${widthMm}mm;
    font-family: "Noto Sans TC", "PingFang TC", -apple-system, sans-serif;
    font-size: ${fontSize}px;
    line-height: 1.7;
    letter-spacing: 0.5px;
    -webkit-print-color-adjust: exact;
  }
  .sheet {
    width: ${widthMm}mm;
    max-width: ${widthMm}mm;
    padding: 3mm;
    margin-left: ${offsetX}mm;
    margin-top: ${offsetY}mm;
  }
  .center { text-align: center; }
  .title { font-size: ${fontSize + 5}px; font-weight: 800; line-height: 1.5; margin-bottom: 4px; }
  .sub { font-size: ${fontSize}px; margin-top: 4px; line-height: 1.6; }
  .line { border-top: 1px dashed #000; margin: 8px 0; }
  .row { display: flex; justify-content: space-between; gap: 6px; line-height: 1.6; padding: 2px 0; }
  .item-row { padding: 6px 0; border-bottom: 1px dashed #bbb; }
  .item-top { display: flex; justify-content: space-between; gap: 6px; font-weight: 700; line-height: 1.6; font-size: ${fontSize + 1}px; }
  .item-name { flex: 1; word-break: break-word; }
  .item-qty { white-space: nowrap; }
  .item-sub { margin-top: 3px; font-size: ${fontSize}px; color: #333; line-height: 1.5; }
  .big { font-size: ${fontSize + 2}px; font-weight: 800; line-height: 1.6; }
  .footer { margin-top: 10px; text-align: center; font-size: ${fontSize}px; line-height: 1.6; }
</style>
</head>
<body>
  <div class="sheet">
    <div class="center">
      <div class="title">${escapeHtml(cfg.storeName || '餐廳 POS')}</div>
      ${cfg.storePhone ? '<div class="sub">電話：' + escapeHtml(cfg.storePhone) + '</div>' : ''}
      ${cfg.storeAddress ? '<div class="sub">地址：' + escapeHtml(cfg.storeAddress) + '</div>' : ''}
      <div class="sub">${escapeHtml(title)}</div>
    </div>
    <div class="line"></div>
      <div class="sub">單號：${escapeHtml(order.orderNo || '')}</div>
      <div class="sub">時間：${escapeHtml(createdAt)}</div>
      <div class="sub">類型：${escapeHtml(order.orderType || '')}${order.tableNo ? ' / ' + escapeHtml(order.tableNo) : ''}</div>
      ${kitchenMode ? '' : '<div class="sub">付款：' + escapeHtml(order.paymentMethod || '') + '</div>'}
    <div class="line"></div>
    ${rows}
    ${kitchenMode ? '' : `
      <div class="line"></div>
      <div class="row"><span>小計</span><strong>${money(order.subtotal || 0)}</strong></div>
      <div class="row"><span>折扣</span><strong>${money(order.discountAmount || 0)}</strong></div>
      <div class="row big"><span>合計</span><span>${money(order.total || 0)}</span></div>
    `}
    <div class="line"></div>
    <div class="footer">${escapeHtml(cfg.receiptFooter || '')}</div>
  </div>
  <div style="height:25mm;"></div>
</body>
</html>`;
}

// ========== 建立標籤 HTML ==========

function buildLabelHtml(order){
  var cfg = ensurePrintConfig();
  var widthMm = Math.max(30, Number(cfg.labelPaperWidth || 60));
  var heightMm = Math.max(20, Number(cfg.labelPaperHeight || 40));
  var fontSize = Math.max(8, Number(cfg.labelFontSize || 12));
  var offsetX = Number(cfg.labelOffsetX || 0);
  var offsetY = Number(cfg.labelOffsetY || 0);

  var labels = (order.items || []).map(function(item){
    var subText = buildSelectionText(item);
    return `
      <div class="label">
        <div class="store">${escapeHtml(cfg.storeName || '餐廳 POS')}</div>
        <div class="main">${escapeHtml(item.name)} x ${Number(item.qty || 0)}</div>
        ${subText ? '<div class="sub">' + escapeHtml(subText) + '</div>' : ''}
        <div class="sub">單號：${escapeHtml(order.orderNo || '')}</div>
        <div class="sub">${escapeHtml(String(order.createdAt || '').replace('T', ' ').slice(0, 16))}</div>
      </div>
    `;
  }).join('');

  return `<!doctype html>
<html lang="zh-Hant">
<head>
<meta charset="UTF-8">
<title>商品標籤</title>
<style>
  @page { size: ${widthMm}mm ${heightMm}mm; margin: 0; }
  body {
    margin: 0;
    font-family: "Noto Sans TC", "PingFang TC", -apple-system, sans-serif;
  }
  .label {
    width: ${widthMm}mm;
    height: ${heightMm}mm;
    box-sizing: border-box;
    page-break-after: always;
    padding: 3mm;
    margin-left: ${offsetX}mm;
    margin-top: ${offsetY}mm;
    font-size: ${fontSize}px;
    line-height: 1.5;
  }
  .store { font-size: ${fontSize - 1}px; font-weight: 700; }
  .main { font-size: ${fontSize + 3}px; font-weight: 800; margin-top: 2mm; }
  .sub { font-size: ${fontSize - 1}px; margin-top: 1mm; }
</style>
</head>
<body>
  ${labels}
</body>
</html>`;
}

// ========== 列印功能 ==========

export function printOrderReceipt(order, mode){
  if(!order) return;
  openPrintWindow(buildReceiptHtml(order, mode || 'customer'));
}

export function printKitchenCopies(order){
  var copies = Math.max(1, Number(ensurePrintConfig().kitchenCopies || 1));
  for(var i = 0; i < copies; i++){
    setTimeout(function(){ printOrderReceipt(order, 'kitchen'); }, i * 500);
  }
}

export function printOrderLabels(order){
  if(!order) return;
  openPrintWindow(buildLabelHtml(order));
}

// ========== 預覽用 ==========

export function buildCartPreviewOrder(){
  var subtotal = state.cart.reduce(function(s,x){ return s + ((Number(x.basePrice)||0) + (Number(x.extraPrice)||0)) * x.qty; }, 0);
  var discountValue = Number(document.getElementById('discountValue')?.value || 0);
  var discountType = state.settings.discountType || 'amount';
  var discountAmount = discountType === 'percent'
    ? Math.floor(subtotal * (discountValue / 100))
    : Math.min(subtotal, discountValue);
  var total = Math.max(0, subtotal - discountAmount);

  return {
    orderNo: 'PREVIEW-' + Date.now(),
    createdAt: new Date().toISOString(),
    orderType: document.getElementById('orderType')?.value || '內用',
    tableNo: document.getElementById('tableNo')?.value?.trim() || '',
    paymentMethod: '未結帳',
    subtotal: subtotal,
    discountAmount: discountAmount,
    total: total,
    items: state.cart
  };
}

export function previewInModal(html){
  var modal = document.getElementById('printPreviewModal');
  var frame = document.getElementById('printPreviewFrame');
  var title = document.getElementById('printPreviewTitle');
  if(!modal || !frame) return;
  modal.classList.remove('hidden');
  var doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ''));
  doc.close();

  document.getElementById('printPreviewPrintBtn').onclick = function(){
    frame.contentWindow.print();
  };
  document.getElementById('closePrintPreviewModal').onclick = function(){
    modal.classList.add('hidden');
  };
  var backdrop = modal.querySelector('.modal-backdrop');
  if(backdrop){
    backdrop.onclick = function(){ modal.classList.add('hidden'); };
  }
}

export function getReceiptHtml(order, mode){
  return buildReceiptHtml(order, mode);
}

export function getLabelHtml(order){
  return buildLabelHtml(order);
}
