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

function openPrintWindow(html) {
  if (window.SunmiPrinter && window.SunmiPrinter.isConnected()) {
    console.log('SunmiPrinter detected, skip HTML print');
    return;
  }
  var frame = document.getElementById('_silentPrintFrame');
  if (!frame) {
    frame = document.createElement('iframe');
    frame.id = '_silentPrintFrame';
    frame.style.cssText = 'position:fixed;width:0;height:0;border:none;left:-9999px;';
    document.body.appendChild(frame);
  }
  var doc = frame.contentDocument || frame.contentWindow.document;
  doc.open();
  doc.write(html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, ''));
  doc.close();
  setTimeout(function () { frame.contentWindow.print(); }, 400);
}

// ========== Sunmi 原生列印（唯一一份）==========

export function sunmiPrintReceipt(order, config) {
  if (!window.SunmiPrinter || !window.SunmiPrinter.isConnected()) {
    console.log('SunmiPrinter 不可用，回退 HTML 列印');
    return false;
  }
  try {
    var p = window.SunmiPrinter;
    var cfg = config || ensurePrintConfig();
    var shopName = cfg.storeName || '餐廳 POS';
    var createdAt = String(order.createdAt || '').replace('T', ' ').slice(0, 16);

    // 店名
    p.printTextCenter(shopName, 32, true);
    if (cfg.storePhone) p.printTextCenter('電話：' + cfg.storePhone, 22, false);
    p.printLine();

    // 訂單資訊
    if (order.orderNo) p.printText('單號：' + order.orderNo, 24, false);
    if (createdAt) p.printText('時間：' + createdAt, 24, false);
    if (order.orderType) p.printText('類型：' + order.orderType + (order.tableNo ? ' / ' + order.tableNo : ''), 24, false);
    if (order.paymentMethod) p.printText('付款：' + order.paymentMethod, 24, false);
    p.printLine();

    // 品項標頭
    p.printThreeColumns('品名', '數量', '小計');
    p.printLine();

    // 品項內容
    var items = order.items || [];
    for (var i = 0; i < items.length; i++) {
      var item = items[i];
      var unitPrice = Number(item.basePrice || 0) + Number(item.extraPrice || 0);
      var qty = Number(item.qty || 0);
      var subtotal = unitPrice * qty;

      p.printThreeColumns(item.name || '', 'x' + qty, money(subtotal));

      // 選項
      var
