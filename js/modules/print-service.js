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
            autoPrintCheckout: true,
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
    return String(text != null ? text : '')
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
    var optionText = (item.selections || []).map(function(s){ return s.moduleName + ':' + s.optionName; }).join(' / ');
    var noteText = item.note ? '備註：' + item.note : '';
    return [optionText, noteText].filter(Boolean).join(' | ');
}

// ========== 列印核心 ==========

function openPrintWindow(html) {
    if (window.SunmiPrinter && window.SunmiPrinter.isConnected()) {
        sunmiPrintFromHtml(html);
    } else {
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
}

function sunmiPrintFromHtml(html) {
    try {
        var parser = new DOMParser();
        var doc = parser.parseFromString(html, 'text/html');
        var printer = window.SunmiPrinter;

        var title = doc.querySelector('.title');
        if (title) {
            printer.printTextCenter(title.textContent.trim(), 32);
        }

        var subs = doc.querySelectorAll('.sub');
        subs.forEach(function (el) {
            printer.printTextCenter(el.textContent.trim(), 24);
        });

        printer.printLine();

        var rows = doc.querySelectorAll('.row');
        rows.forEach(function (row) {
            var spans = row.querySelectorAll('span');
            if (spans.length >= 2) {
                printer.printRow(spans[0].textContent.trim(), spans[1].textContent.trim());
            } else {
                printer.printText(row.textContent.trim(), 24);
            }
        });

        var items = doc.querySelectorAll('.item-row');
        if (items.length > 0) {
            printer.printLine();
            items.forEach(function (item) {
                var top = item.querySelector('.item-top');
                if (top) {
                    var name = top.querySelector('.item-name');
                    var price = top.querySelector('span:last-child');
                    if (name && price) {
                        printer.printRow(name.textContent.trim(), price.textContent.trim());
                    }
                }
                var sub = item.querySelector('.item-sub');
                if (sub && sub.textContent.trim()) {
                    printer.printText('  ' + sub.textContent.trim(), 20);
                }
            });
        }

        printer.printLine();

        var big = doc.querySelector('.big');
        if (big) {
            printer.printTextCenter(big.textContent.trim(), 32);
        }

        var footers = doc.querySelectorAll('.footer');
        footers.forEach(function (el) {
            printer.printTextCenter(el.textContent.trim(), 24);
        });

        printer.feedAndCut();

    } catch (e) {
        console.error('Sunmi print error:', e);
    }
}

export function sunmiPrintReceipt(order, config) {
    if (!window.SunmiPrinter || !window.SunmiPrinter.isConnected()) {
        return false;
    }
    try {
        var p = window.SunmiPrinter;
        var cfg = config || ensurePrintConfig();
        var createdAt = String(order.createdAt || '').replace('T', ' ').slice(0, 16);

        p.printTextCenter(cfg.storeName || '餐廳 POS', 32);
        if (cfg.storePhone) p.printTextCenter('電話：' + cfg.storePhone, 24);
        if (cfg.storeAddress) p.printTextCenter('地址：' + cfg.storeAddress, 24);
        p.printTextCenter('顧客收據', 24);

        p.printLine();

        if (order.orderNo) p.printText('單號：' + order.orderNo, 24);
        if (createdAt) p.printText('時間：' + createdAt, 24);
        if (order.orderType) p.printText('類型：' + order.orderType + (order.tableNo ? ' / ' + order.tableNo : ''), 24);
        if (order.paymentMethod) p.printText('付款：' + order.paymentMethod, 24);

        p.printLine();

        var items = order.items || [];
        for (var i = 0; i < items.length; i++) {
            var item = items[i];
            var unitPrice = Number(item.basePrice || 0) + Number(item.extraPrice || 0);
            var qty = Number(item.qty || 0);
            p.printRow(item.name || '', 'x' + qty + ' $' + (unitPrice * qty));

            var selText = buildSelectionText(item);
            if (selText) p.printText('  ' + selText, 20);
        }

        p.printLine();

        p.printRow('小計', '$' + Number(order.subtotal || 0));
        if (order.discountAmount) p.printRow('折扣', '-$' + Number(order.discountAmount || 0));
        p.printTextCenter('合計：$' + Number(order.total || 0), 32);

        p.printLine();

        if (cfg.receiptFooter) p.printTextCenter(cfg.receiptFooter, 24);

        p.feedAndCut();

        return true;
    } catch (e) {
        console.error('Sunmi 收據列印錯誤：', e);
        return false;
    }
}

export function sunmiPrintKitchen(order, config) {
    if (!window.SunmiPrinter || !window.SunmiPrinter.isConnected()) {
        return false;
    }
    try {
        var p = window.SunmiPrinter;
        var cfg = config || ensurePrintConfig();
        var copies = Math.max(1, Number(cfg.kitchenCopies || 1));
        var createdAt = String(order.createdAt || '').replace('T', ' ').slice(0, 16);

        for (var c = 0; c < copies; c++) {
            p.printTextCenter('*** 廚房單 ***', 30);
            p.printLine();
            if (order.orderNo) p.printText('單號：' + order.orderNo, 24);
            if (createdAt) p.printText('時間：' + createdAt, 24);
            if (order.orderType) p.printText('類型：' + order.orderType + (order.tableNo ? ' / ' + order.tableNo : ''), 24);
            p.printLine();

            var items = order.items || [];
            for (var i = 0; i < items.length; i++) {
                var item = items[i];
                var qty = Number(item.qty || 0);
                p.printText(qty + 'x ' + (item.name || ''), 28);

                var selText = buildSelectionText(item);
                if (selText) p.printText('  ' + selText, 22);
            }

            p.printLine();
            p.feedAndCut();
        }

        return true;
    } catch (e) {
        console.error('Sunmi 廚房單列印錯誤：', e);
        return false;
    }
}

export function sunmiOpenCashDrawer() {
    if (window.SunmiPrinter && window.SunmiPrinter.isConnected()) {
        try {
            window.SunmiPrinter.openCashDrawer();
            return true;
        } catch (e) {
            console.error('Sunmi 開錢箱錯誤：', e);
            return false;
        }
    }
    return false;
}

// ========== 開錢箱 (非 Sunmi 環境) ==========

export function openCashDrawer() {
    if (window.SunmiPrinter && window.SunmiPrinter.isConnected()) {
        window.SunmiPrinter.openCashDrawer();
    }
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

    var rows = '';
    var orderItems = order.items || [];
    for (var i = 0; i < orderItems.length; i++) {
        var item = orderItems[i];
        var unitPrice = Number(item.basePrice || 0) + Number(item.extraPrice || 0);
        var subText = buildSelectionText(item);
        rows += '<div class="item-row">';
        rows += '<div class="item-top">';
        rows += '<div class="item-name">' + escapeHtml(item.name) + '</div>';
        rows += '<div class="item-qty">x ' + Number(item.qty || 0) + '</div>';
        rows += '</div>';
        if (subText) {
            rows += '<div class="item-sub">' + escapeHtml(subText) + '</div>';
        }
        if (!kitchenMode) {
            rows += '<div class="item-sub">' + money(unitPrice) + ' / 小計 ' + money(unitPrice * Number(item.qty || 0)) + '</div>';
        }
        rows += '</div>';
    }

    var html = '<!doctype html>'
        + '<html lang="zh-Hant">'
        + '<head>'
        + '<meta charset="UTF-8">'
        + '<title>' + title + '</title>'
        + '<style>'
        + '@page { size: ' + widthMm + 'mm auto; margin: 0; padding: 0; }'
        + '* { box-sizing: border-box; }'
        + 'body {'
        + '  margin: 0; padding: 0;'
        + '  width: ' + widthMm + 'mm;'
        + '  font-family: "Noto Sans TC", "PingFang TC", -apple-system, sans-serif;'
        + '  font-size: ' + fontSize + 'px;'
        + '  line-height: 1.7;'
        + '  letter-spacing: 0.5px;'
        + '  -webkit-print-color-adjust: exact;'
        + '}'
        + '.sheet {'
        + '  width: ' + widthMm + 'mm;'
        + '  max-width: ' + widthMm + 'mm;'
        + '  padding: 3mm;'
        + '  margin-left: ' + offsetX + 'mm;'
        + '  margin-top: ' + offsetY + 'mm;'
        + '}'
        + '.center { text-align: center; }'
        + '.title { font-size: ' + (fontSize + 5) + 'px; font-weight: 800; line-height: 1.5; margin-bottom: 4px; }'
        + '.sub { font-size: ' + fontSize + 'px; margin-top: 4px; line-height: 1.6; }'
        + '.line { border-top: 1px dashed #000; margin: 8px 0; }'
        + '.row { display: flex; justify-content: space-between; gap: 6px; line-height: 1.6; padding: 2px 0; }'
        + '.item-row { padding: 6px 0; border-bottom: 1px dashed #bbb; }'
        + '.item-top { display: flex; justify-content: space-between; gap: 6px; font-weight: 700; line-height: 1.6; }'
        + '.item-name { flex: 1; word-break: break-word; }'
        + '.item-qty { white-space: nowrap; }'
        + '.item-sub { margin-top: 3px; font-size: ' + fontSize + 'px; color: #333; line-height: 1.5; }'
        + '.big { font-size: ' + (fontSize + 2) + 'px; font-weight: 800; line-height: 1.6; }'
        + '.footer { margin-top: 10px; text-align: center; font-size: ' + fontSize + 'px; line-height: 1.6; }'
        + '</style>'
        + '</head>'
        + '<body>'
        + '<div class="sheet">'
        + '<div class="center">'
        + '<div class="title">' + escapeHtml(cfg.storeName || '餐廳 POS') + '</div>'
        + (cfg.storePhone ? '<div class="sub">電話：' + escapeHtml(cfg.storePhone) + '</div>' : '')
        + (cfg.storeAddress ? '<div class="sub">地址：' + escapeHtml(cfg.storeAddress) + '</div>' : '')
        + '<div class="sub">' + escapeHtml(title) + '</div>'
        + '</div>'
        + '<div class="line"></div>'
        + '<div class="sub">單號：' + escapeHtml(order.orderNo || '') + '</div>'
        + '<div class="sub">時間：' + escapeHtml(createdAt) + '</div>'
        + '<div class="sub">類型：' + escapeHtml(order.orderType || '') + (order.tableNo ? ' / ' + escapeHtml(order.tableNo) : '') + '</div>'
        + (kitchenMode ? '' : '<div class="sub">付款：' + escapeHtml(order.paymentMethod || '') + '</div>')
        + '<div class="line"></div>'
        + rows;

    if (!kitchenMode) {
        html += '<div class="line"></div>'
            + '<div class="row"><span>小計</span><strong>' + money(order.subtotal || 0) + '</strong></div>'
            + '<div class="row"><span>折扣</span><strong>' + money(order.discountAmount || 0) + '</strong></div>'
            + '<div class="row big"><span>合計</span><span>' + money(order.total || 0) + '</span></div>';
    }

    html += '<div class="line"></div>'
        + '<div class="footer">' + escapeHtml(cfg.receiptFooter || '') + '</div>'
        + '</div>'
        + '<div style="height:25mm;"></div>'
        + '</body>'
        + '</html>';

    return html;
}

// ========== 建立標籤 HTML ==========

function buildLabelHtml(order){
    var cfg = ensurePrintConfig();
    var widthMm = Math.max(30, Number(cfg.labelPaperWidth || 60));
    var heightMm = Math.max(20, Number(cfg.labelPaperHeight || 40));
    var fontSize = Math.max(8, Number(cfg.labelFontSize || 12));
    var offsetX = Number(cfg.labelOffsetX || 0);
    var offsetY = Number(cfg.labelOffsetY || 0);

    var labels = '';
    var orderItems = order.items || [];
    for (var i = 0; i < orderItems.length; i++) {
        var item = orderItems[i];
        var subText = buildSelectionText(item);
        labels += '<div class="label">';
        labels += '<div class="store">' + escapeHtml(cfg.storeName || '餐廳 POS') + '</div>';
        labels += '<div class="main">' + escapeHtml(item.name) + ' x ' + Number(item.qty || 0) + '</div>';
        if (subText) {
            labels += '<div class="sub">' + escapeHtml(subText) + '</div>';
        }
        labels += '<div class="sub">單號：' + escapeHtml(order.orderNo || '') + '</div>';
        labels += '<div class="sub">' + escapeHtml(String(order.createdAt || '').replace('T', ' ').slice(0, 16)) + '</div>';
        labels += '</div>';
    }

    var html = '<!doctype html>'
        + '<html lang="zh-Hant">'
        + '<head>'
        + '<meta charset="UTF-8">'
        + '<title>商品標籤</title>'
        + '<style>'
        + '@page { size: ' + widthMm + 'mm ' + heightMm + 'mm; margin: 0; }'
        + 'body {'
        + '  margin: 0;'
        + '  font-family: "Noto Sans TC", "PingFang TC", -apple-system, sans-serif;'
        + '}'
        + '.label {'
        + '  width: ' + widthMm + 'mm;'
        + '  height: ' + heightMm + 'mm;'
        + '  box-sizing: border-box;'
        + '  page-break-after: always;'
        + '  padding: 3mm;'
        + '  margin-left: ' + offsetX + 'mm;'
        + '  margin-top: ' + offsetY + 'mm;'
        + '  font-size: ' + fontSize + 'px;'
        + '  line-height: 1.5;'
        + '}'
        + '.store { font-size: ' + (fontSize - 1) + 'px; font-weight: 700; }'
        + '.main { font-size: ' + (fontSize + 3) + 'px; font-weight: 800; margin-top: 2mm; }'
        + '.sub { font-size: ' + (fontSize - 1) + 'px; margin-top: 1mm; }'
        + '</style>'
        + '</head>'
        + '<body>'
        + labels
        + '</body>'
        + '</html>';

    return html;
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
    var el = document.getElementById('discountValue');
    var discountValue = Number(el ? el.value : 0);
    var discountType = state.settings.discountType || 'amount';
    var discountAmount = discountType === 'percent'
        ? Math.floor(subtotal * (discountValue / 100))
        : Math.min(subtotal, discountValue);
    var total = Math.max(0, subtotal - discountAmount);

    return {
        orderNo: 'PREVIEW-' + Date.now(),
        createdAt: new Date().toISOString(),
        orderType: (document.getElementById('orderType') ? document.getElementById('orderType').value : '') || '內用',
        tableNo: (document.getElementById('tableNo') ? document.getElementById('tableNo').value.trim() : '') || '',
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
