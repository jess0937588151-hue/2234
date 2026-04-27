/* ============================================================
   js/pages/settings-page.js
   設定頁面：簡潔按鈕 + 浮動視窗
   ============================================================ */

import { state, persistAll } from '../core/store.js';
import { buildCartPreviewOrder, printOrderLabels, printOrderReceipt, printKitchenCopies, openCashDrawer, getPrintSettings, previewInModal, getReceiptHtml, getLabelHtml } from '../modules/print-service.js';

// ── 浮動視窗開關工具 ──
function openModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.add('active');
}

function closeModal(id) {
  var el = document.getElementById(id);
  if (el) el.classList.remove('active');
}

function initModalSystem() {
  // 關閉按鈕
  document.querySelectorAll('[data-close-modal]').forEach(function(btn) {
    btn.addEventListener('click', function() {
      closeModal(btn.getAttribute('data-close-modal'));
    });
  });

  // 點擊背景關閉
  document.querySelectorAll('.settings-modal-backdrop').forEach(function(backdrop) {
    backdrop.addEventListener('click', function(e) {
      if (e.target === backdrop) {
        backdrop.classList.remove('active');
      }
    });
  });
}

// ── Sunmi 印表機工具 ──
function hasSunmi() {
  return !!(window.SunmiPrinter && window.SunmiPrinter.isPrinterReady);
}

function refreshSunmiStatus() {
  var box = document.getElementById('sunmiStatusBox');
  if (!box) return;
  if (!hasSunmi()) {
    box.innerHTML = '<span class="sm-status disconnected">● 未偵測到 Sunmi 印表機</span>';
    return;
  }
  var ready = window.SunmiPrinter.isPrinterReady();
  var status = ready ? '已連線' : '未就緒';
  var cls = ready ? 'connected' : 'disconnected';
  var extra = '';
  if (ready && window.SunmiPrinter.getPrinterStatus) {
    var code = window.SunmiPrinter.getPrinterStatus();
    var map = { 1:'正常', 2:'準備中', 3:'通訊異常', 4:'缺紙', 5:'過熱', 6:'開蓋', 7:'切刀異常', 505:'未連線' };
    extra = ' / 狀態：' + (map[code] || '未知(' + code + ')');
  }
  box.innerHTML = '<span class="sm-status ' + cls + '">● ' + status + extra + '</span>';
}

// ── 藍牙印表機工具 ──
function refreshBtStatus() {
  var box = document.getElementById('btStatusBox');
  if (!box) return;
  if (!hasSunmi() || !window.SunmiPrinter.isBtPrinterConnected) {
    box.innerHTML = '<span class="sm-status unknown">● 無法偵測（需透過 APK）</span>';
    return;
  }
  var connected = window.SunmiPrinter.isBtPrinterConnected();
  var addr = connected && window.SunmiPrinter.getBtConnectedAddress ? window.SunmiPrinter.getBtConnectedAddress() : '';
  box.innerHTML = connected
    ? '<span class="sm-status connected">● 已連線' + (addr ? ' / ' + addr : '') + '</span>'
    : '<span class="sm-status disconnected">● 未連線</span>';
}

function refreshBtDevices() {
  var sel = document.getElementById('btDeviceSelect');
  if (!sel || !hasSunmi() || !window.SunmiPrinter.getBtPrinters) return;
  try {
    var list = JSON.parse(window.SunmiPrinter.getBtPrinters());
    sel.innerHTML = '';
    if (!list.length) {
      sel.innerHTML = '<option value="">無已配對裝置</option>';
      return;
    }
    list.forEach(function(d) {
      var opt = document.createElement('option');
      opt.value = d.address;
      opt.textContent = (d.name || 'Unknown') + ' / ' + d.address;
      sel.appendChild(opt);
    });
  } catch (e) {
    sel.innerHTML = '<option value="">讀取失敗</option>';
  }
}

// ── 網路印表機工具 ──
function refreshNetStatus() {
  var box = document.getElementById('netStatusBox');
  if (!box) return;
  if (!hasSunmi() || !window.SunmiPrinter.isNetPrinterConnected) {
    box.innerHTML = '<span class="sm-status unknown">● 無法偵測（需透過 APK）</span>';
    return;
  }
  var connected = window.SunmiPrinter.isNetPrinterConnected();
  var info = connected && window.SunmiPrinter.getNetConnectedInfo ? window.SunmiPrinter.getNetConnectedInfo() : '';
  box.innerHTML = connected
    ? '<span class="sm-status connected">● 已連線' + (info ? ' / ' + info : '') + '</span>'
    : '<span class="sm-status disconnected">● 未連線</span>';
}

// ── 列印設定：讀取欄位 ──
function loadPrintSettingsToForm() {
  var cfg = getPrintSettings();
  var el = function(id) { return document.getElementById(id); };
  if (el('printStoreName')) el('printStoreName').value = cfg.storeName || '';
  if (el('printStorePhone')) el('printStorePhone').value = cfg.storePhone || '';
  if (el('printStoreAddress')) el('printStoreAddress').value = cfg.storeAddress || '';
  if (el('printReceiptFooter')) el('printReceiptFooter').value = cfg.receiptFooter || '';
  if (el('printReceiptPaperWidth')) el('printReceiptPaperWidth').value = cfg.receiptPaperWidth || '58';
  if (el('printLabelPaperWidth')) el('printLabelPaperWidth').value = Number(cfg.labelPaperWidth || 60);
  if (el('printLabelPaperHeight')) el('printLabelPaperHeight').value = Number(cfg.labelPaperHeight || 40);
  if (el('printReceiptFontSize')) el('printReceiptFontSize').value = Number(cfg.receiptFontSize || 12);
  if (el('printLabelFontSize')) el('printLabelFontSize').value = Number(cfg.labelFontSize || 12);
  if (el('printReceiptOffsetX')) el('printReceiptOffsetX').value = Number(cfg.receiptOffsetX || 0);
  if (el('printReceiptOffsetY')) el('printReceiptOffsetY').value = Number(cfg.receiptOffsetY || 0);
  if (el('printLabelOffsetX')) el('printLabelOffsetX').value = Number(cfg.labelOffsetX || 0);
  if (el('printLabelOffsetY')) el('printLabelOffsetY').value = Number(cfg.labelOffsetY || 0);
  if (el('printKitchenCopies')) el('printKitchenCopies').value = Number(cfg.kitchenCopies || 1);
  if (el('printAutoCheckout')) el('printAutoCheckout').checked = !!cfg.autoPrintCheckout;
  if (el('printAutoKitchen')) el('printAutoKitchen').checked = !!cfg.autoPrintKitchen;
}

// ── 即時接單：讀取欄位 ──
function loadRealtimeSettingsToForm() {
  var s = state.settings || {};
  var rt = s.realtimeOrder || {};
  var el = function(id) { return document.getElementById(id); };
  if (el('realtimeOrderEnabled')) el('realtimeOrderEnabled').checked = !!rt.enabled;
  if (el('deviceRole')) el('deviceRole').value = rt.deviceRole || 'master';
  if (el('firebaseApiKey')) el('firebaseApiKey').value = rt.apiKey || '';
  if (el('firebaseAuthDomain')) el('firebaseAuthDomain').value = rt.authDomain || '';
  if (el('firebaseDatabaseUrl')) el('firebaseDatabaseUrl').value = rt.databaseURL || '';
  if (el('firebaseProjectId')) el('firebaseProjectId').value = rt.projectId || '';
  if (el('firebaseStorageBucket')) el('firebaseStorageBucket').value = rt.storageBucket || '';
  if (el('firebaseMessagingSenderId')) el('firebaseMessagingSenderId').value = rt.messagingSenderId || '';
  if (el('firebaseAppId')) el('firebaseAppId').value = rt.appId || '';
  if (el('firebaseMeasurementId')) el('firebaseMeasurementId').value = rt.measurementId || '';
  if (el('onlineStoreTitle')) el('onlineStoreTitle').value = rt.onlineStoreTitle || '';
  if (el('onlineStoreSubtitle')) el('onlineStoreSubtitle').value = rt.onlineStoreSubtitle || '';
  if (el('onlineConfirmAutoPrintKitchen')) el('onlineConfirmAutoPrintKitchen').checked = !!rt.autoPrintKitchenOnConfirm;
  if (el('onlineConfirmAutoPrintReceipt')) el('onlineConfirmAutoPrintReceipt').checked = !!rt.autoPrintReceiptOnConfirm;
  if (el('onlineIncomingSoundEnabled')) el('onlineIncomingSoundEnabled').checked = rt.incomingSoundEnabled !== false;
}


// ── Google 備份：讀取欄位 ──
function loadGoogleSettingsToForm() {
  var s = state.settings || {};
  var g = s.googleDriveBackup || {};   // ← 改為 googleDriveBackup
  var el = function(id) { return document.getElementById(id); };
  if (el('googleClientId')) el('googleClientId').value = g.clientId || '';
  if (el('googleFolderId')) el('googleFolderId').value = g.folderId || '';
  if (el('googleAutoBackupEnabled')) el('googleAutoBackupEnabled').checked = !!g.autoBackupEnabled;
  if (el('googleAutoBackupMinutes')) el('googleAutoBackupMinutes').value = g.autoBackupMinutes || 60;
}

// ── 提示音：讀取狀態 ──
function loadSoundStatus() {
  var statusBox = document.getElementById('customSoundStatusBox');
  if (statusBox) {
    var saved = localStorage.getItem('customAlertSound');
    statusBox.textContent = saved ? '已設定自訂提示音' : '尚未設定自訂提示音';
  }
}

// ── 主函式 ──
export function initSettingsPage() {

  initModalSystem();

  // ============================
  // Tile 開啟事件（每個 tile 開啟前先載入最新資料）
  // ============================

  // 列印設定
  document.querySelector('[data-modal="modalPrint"]')?.addEventListener('click', function() {
    loadPrintSettingsToForm();
    openModal('modalPrint');
  });

  // Sunmi 印表機
  document.querySelector('[data-modal="modalSunmi"]')?.addEventListener('click', function() {
    refreshSunmiStatus();
    openModal('modalSunmi');
  });

  // 藍牙印表機
  document.querySelector('[data-modal="modalBluetooth"]')?.addEventListener('click', function() {
    refreshBtStatus();
    refreshBtDevices();
    openModal('modalBluetooth');
  });

  // 網路印表機
  document.querySelector('[data-modal="modalNetwork"]')?.addEventListener('click', function() {
    refreshNetStatus();
    openModal('modalNetwork');
  });

  // 即時接單
  document.querySelector('[data-modal="modalRealtime"]')?.addEventListener('click', function() {
    loadRealtimeSettingsToForm();
    openModal('modalRealtime');
  });

  // Google 備份
  document.querySelector('[data-modal="modalGoogle"]')?.addEventListener('click', function() {
    loadGoogleSettingsToForm();
    openModal('modalGoogle');
  });

  // 本機資料
  document.querySelector('[data-modal="modalLocalData"]')?.addEventListener('click', function() {
    openModal('modalLocalData');
  });

  // 進單提示音
  document.querySelector('[data-modal="modalSound"]')?.addEventListener('click', function() {
    loadSoundStatus();
    openModal('modalSound');
  });

  // ============================
  // 列印設定 — 儲存
  // ============================
  document.getElementById('savePrintSettingsBtn')?.addEventListener('click', function() {
    var cfg = getPrintSettings();
    cfg.storeName = (document.getElementById('printStoreName')?.value || '').trim();
    cfg.storePhone = (document.getElementById('printStorePhone')?.value || '').trim();
    cfg.storeAddress = (document.getElementById('printStoreAddress')?.value || '').trim();
    cfg.receiptFooter = (document.getElementById('printReceiptFooter')?.value || '').trim();
    cfg.receiptPaperWidth = Number(document.getElementById('printReceiptPaperWidth')?.value) || 58;
    cfg.labelPaperWidth = Number(document.getElementById('printLabelPaperWidth')?.value) || 60;
    cfg.labelPaperHeight = Number(document.getElementById('printLabelPaperHeight')?.value) || 40;
    cfg.receiptFontSize = Number(document.getElementById('printReceiptFontSize')?.value) || 12;
    cfg.labelFontSize = Number(document.getElementById('printLabelFontSize')?.value) || 12;
    cfg.receiptOffsetX = Number(document.getElementById('printReceiptOffsetX')?.value) || 0;
    cfg.receiptOffsetY = Number(document.getElementById('printReceiptOffsetY')?.value) || 0;
    cfg.labelOffsetX = Number(document.getElementById('printLabelOffsetX')?.value) || 0;
    cfg.labelOffsetY = Number(document.getElementById('printLabelOffsetY')?.value) || 0;
    cfg.kitchenCopies = Math.max(1, Number(document.getElementById('printKitchenCopies')?.value) || 1);
    cfg.autoPrintCheckout = !!document.getElementById('printAutoCheckout')?.checked;
    cfg.autoPrintKitchen = !!document.getElementById('printAutoKitchen')?.checked;
    persistAll();

    // 同步到 APK
    if (hasSunmi() && window.SunmiPrinter.saveSettings) {
      try { window.SunmiPrinter.saveSettings(JSON.stringify(cfg)); } catch(e) {}
    }
    alert('列印設定已儲存');
  });

  // ============================
  // 列印預覽
  // ============================
  function buildPreviewOrder() {
    if (Array.isArray(state.cart) && state.cart.length) return buildCartPreviewOrder();
    return {
      orderNo: 'PREVIEW-' + Date.now(),
      createdAt: new Date().toISOString(),
      orderType: '內用', tableNo: 'A1', paymentMethod: '現金',
      subtotal: 145, discountAmount: 0, total: 145,
      items: [{
        rowId: 'p1', productId: 'p1', name: '範例商品',
        basePrice: 70, qty: 2, note: '不要切',
        selections: [
          { moduleName: '辣度', optionName: '小辣', price: 0 },
          { moduleName: '灑粉', optionName: '梅粉', price: 5 }
        ],
        extraPrice: 5
      }]
    };
  }
  /** 把表單上目前填的值即時寫入設定（這樣預覽才會用到最新的數值） */
  function applyFormToConfig() {
    var cfg = getPrintSettings();
    cfg.storeName = (document.getElementById('printStoreName')?.value || '').trim();
    cfg.storePhone = (document.getElementById('printStorePhone')?.value || '').trim();
    cfg.storeAddress = (document.getElementById('printStoreAddress')?.value || '').trim();
    cfg.receiptFooter = (document.getElementById('printReceiptFooter')?.value || '').trim();
    cfg.receiptPaperWidth = Number(document.getElementById('printReceiptPaperWidth')?.value) || 58;
    cfg.labelPaperWidth = Number(document.getElementById('printLabelPaperWidth')?.value) || 60;
    cfg.labelPaperHeight = Number(document.getElementById('printLabelPaperHeight')?.value) || 40;
    cfg.receiptFontSize = Number(document.getElementById('printReceiptFontSize')?.value) || 12;
    cfg.labelFontSize = Number(document.getElementById('printLabelFontSize')?.value) || 12;
    cfg.receiptOffsetX = Number(document.getElementById('printReceiptOffsetX')?.value) || 0;
    cfg.receiptOffsetY = Number(document.getElementById('printReceiptOffsetY')?.value) || 0;
    cfg.labelOffsetX = Number(document.getElementById('printLabelOffsetX')?.value) || 0;
    cfg.labelOffsetY = Number(document.getElementById('printLabelOffsetY')?.value) || 0;
    cfg.kitchenCopies = Math.max(1, Number(document.getElementById('printKitchenCopies')?.value) || 1);
  }

  document.getElementById('previewReceiptPrintBtn')?.addEventListener('click', function() {
    applyFormToConfig();
    previewInModal(getReceiptHtml(buildPreviewOrder(), 'customer'));
  });
  document.getElementById('previewKitchenPrintBtn')?.addEventListener('click', function() {
    applyFormToConfig();
    previewInModal(getReceiptHtml(buildPreviewOrder(), 'kitchen'));
  });
  document.getElementById('previewLabelPrintBtn')?.addEventListener('click', function() {
    applyFormToConfig();
    previewInModal(getLabelHtml(buildPreviewOrder()));
  });

  document.getElementById('previewReceiptPrintBtn')?.addEventListener('click', function() {
    previewInModal(getReceiptHtml(buildPreviewOrder(), 'customer'));
  });
  document.getElementById('previewKitchenPrintBtn')?.addEventListener('click', function() {
    previewInModal(getReceiptHtml(buildPreviewOrder(), 'kitchen'));
  });
  document.getElementById('previewLabelPrintBtn')?.addEventListener('click', function() {
    previewInModal(getLabelHtml(buildPreviewOrder()));
  });

  // ============================
  // Sunmi 印表機
  // ============================
  document.getElementById('sunmiRefreshStatusBtn')?.addEventListener('click', function() {
    refreshSunmiStatus();
  });
  document.getElementById('sunmiTestPrintBtn')?.addEventListener('click', function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.printTestReceipt ? window.SunmiPrinter.printTestReceipt() : false;
    alert(ok ? '測試列印成功' : '測試列印失敗');
  });
  document.getElementById('sunmiTestCutBtn')?.addEventListener('click', function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.cutPaper ? window.SunmiPrinter.cutPaper() : false;
    alert(ok ? '切紙成功' : '切紙失敗');
  });
  document.getElementById('sunmiTestDrawerBtn')?.addEventListener('click', function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.openCashDrawer ? window.SunmiPrinter.openCashDrawer() : false;
    alert(ok ? '錢箱已開' : '開錢箱失敗');
  });
  document.getElementById('sunmiTestBuzzerBtn')?.addEventListener('click', function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.buzzer ? window.SunmiPrinter.buzzer() : false;
    alert(ok ? '蜂鳴成功' : '蜂鳴失敗');
  });

  // ============================
  // 藍牙印表機
  // ============================
  document.getElementById('btRefreshBtn')?.addEventListener('click', function() {
    refreshBtDevices();
    refreshBtStatus();
  });
  document.getElementById('btConnectBtn')?.addEventListener('click', function() {
    if (!hasSunmi() || !window.SunmiPrinter.connectBtPrinter) { alert('需透過 Sunmi APK 操作'); return; }
    var addr = document.getElementById('btDeviceSelect')?.value;
    if (!addr) { alert('請選擇裝置'); return; }
    var ok = window.SunmiPrinter.connectBtPrinter(addr);
    refreshBtStatus();
    alert(ok ? '藍牙已連線' : '藍牙連線失敗');
  });
  document.getElementById('btDisconnectBtn')?.addEventListener('click', function() {
    if (hasSunmi() && window.SunmiPrinter.disconnectBtPrinter) window.SunmiPrinter.disconnectBtPrinter();
    refreshBtStatus();
  });
  document.getElementById('btTestPrintBtn')?.addEventListener('click', function() {
    if (!hasSunmi() || !window.SunmiPrinter.btPrintText) { alert('需透過 Sunmi APK 操作'); return; }
    var ok = window.SunmiPrinter.btPrintText('藍牙測試列印\n' + new Date().toLocaleString() + '\n');
    alert(ok ? '藍牙測試成功' : '藍牙測試失敗');
  });

  // ============================
  // 網路印表機
  // ============================
  document.getElementById('netConnectBtn')?.addEventListener('click', function() {
    if (!hasSunmi() || !window.SunmiPrinter.connectNetPrinter) { alert('需透過 Sunmi APK 操作'); return; }
    var ip = (document.getElementById('netIpInput')?.value || '').trim();
    var port = parseInt(document.getElementById('netPortInput')?.value) || 9100;
    if (!ip) { alert('請輸入 IP'); return; }
    var ok = window.SunmiPrinter.connectNetPrinter(ip, port);
    refreshNetStatus();
    alert(ok ? '網路已連線：' + ip + ':' + port : '網路連線失敗');
  });
  document.getElementById('netDisconnectBtn')?.addEventListener('click', function() {
    if (hasSunmi() && window.SunmiPrinter.disconnectNetPrinter) window.SunmiPrinter.disconnectNetPrinter();
    refreshNetStatus();
  });
  document.getElementById('netTestPrintBtn')?.addEventListener('click', function() {
    if (!hasSunmi() || !window.SunmiPrinter.netPrintText) { alert('需透過 Sunmi APK 操作'); return; }
    var ok = window.SunmiPrinter.netPrintText('網路測試列印\n' + new Date().toLocaleString() + '\n');
    alert(ok ? '網路測試成功' : '網路測試失敗');
  });

  // ============================
  // 即時接單 — 儲存
  // ============================
    document.getElementById('saveRealtimeOrderSettingsBtn')?.addEventListener('click', function() {
    if (!state.settings) state.settings = {};
    // 保留服務端寫入的狀態欄位
    var existing = state.settings.realtimeOrder || {};
    state.settings.realtimeOrder = {
      enabled: !!document.getElementById('realtimeOrderEnabled')?.checked,
      deviceRole: document.getElementById('deviceRole')?.value || 'master',
      apiKey: (document.getElementById('firebaseApiKey')?.value || '').trim(),
      authDomain: (document.getElementById('firebaseAuthDomain')?.value || '').trim(),
      databaseURL: (document.getElementById('firebaseDatabaseUrl')?.value || '').trim(),
      projectId: (document.getElementById('firebaseProjectId')?.value || '').trim(),
      storageBucket: (document.getElementById('firebaseStorageBucket')?.value || '').trim(),
      messagingSenderId: (document.getElementById('firebaseMessagingSenderId')?.value || '').trim(),
      appId: (document.getElementById('firebaseAppId')?.value || '').trim(),
      measurementId: (document.getElementById('firebaseMeasurementId')?.value || '').trim(),
      onlineStoreTitle: (document.getElementById('onlineStoreTitle')?.value || '').trim(),
      onlineStoreSubtitle: (document.getElementById('onlineStoreSubtitle')?.value || '').trim(),
      autoPrintKitchenOnConfirm: !!document.getElementById('onlineConfirmAutoPrintKitchen')?.checked,
      autoPrintReceiptOnConfirm: !!document.getElementById('onlineConfirmAutoPrintReceipt')?.checked,
      incomingSoundEnabled: !!document.getElementById('onlineIncomingSoundEnabled')?.checked,
      // 保留服務端的狀態欄位
      lastSyncStatus: existing.lastSyncStatus || '',
      lastOrderAt: existing.lastOrderAt || '',
      lastConfirmedAt: existing.lastConfirmedAt || '',
      lastSyncTime: existing.lastSyncTime || ''
    };
    persistAll();
    alert('即時接單設定已儲存');

    if (typeof window.reinitRealtimeOrder === 'function') {
      window.reinitRealtimeOrder();
    }
  });


  // 同步菜單到雲端
  document.getElementById('syncMenuBtn')?.addEventListener('click', async function() {
    if (typeof window.syncMenuToCloud === 'function') {
      await window.syncMenuToCloud();
      alert('菜單已同步至雲端');
    } else {
      alert('同步模組未載入');
    }
  });

  // POS Google 登入/登出
  document.getElementById('posGoogleLoginBtn')?.addEventListener('click', function() {
    if (typeof window.posGoogleLogin === 'function') {
      window.posGoogleLogin();
    } else {
      alert('Google 登入模組未載入');
    }
  });
  document.getElementById('posGoogleLogoutBtn')?.addEventListener('click', function() {
    if (typeof window.posGoogleLogout === 'function') {
      window.posGoogleLogout();
    }
    var box = document.getElementById('posGoogleAccountBox');
    if (box) box.textContent = '尚未登入';
    alert('已登出');
  });

  // ============================
  // Google Drive — 儲存
  // ============================
    document.getElementById('saveGoogleBackupSettingsBtn')?.addEventListener('click', function() {
    if (!state.settings) state.settings = {};
    // 保留服務端寫入的狀態欄位
    var existing = state.settings.googleDriveBackup || {};
    state.settings.googleDriveBackup = {   // ← 改為 googleDriveBackup
      clientId: (document.getElementById('googleClientId')?.value || '').trim(),
      folderId: (document.getElementById('googleFolderId')?.value || '').trim(),
      autoBackupEnabled: !!document.getElementById('googleAutoBackupEnabled')?.checked,
      autoBackupMinutes: parseInt(document.getElementById('googleAutoBackupMinutes')?.value) || 60,
      // 保留服務端的狀態欄位
      lastBackupAt: existing.lastBackupAt || '',
      lastRestoreAt: existing.lastRestoreAt || '',
      lastBackupStatus: existing.lastBackupStatus || '',
      lastRestoreStatus: existing.lastRestoreStatus || ''
    };
    persistAll();
    alert('Google Drive 設定已儲存');

    // 重啟自動備份
    if (typeof window.startGoogleAutoBackup === 'function') {
      window.startGoogleAutoBackup();
    }
  });


  document.getElementById('googleLoginBtn')?.addEventListener('click', function() {
    if (typeof window.googleDriveLogin === 'function') {
      window.googleDriveLogin();
    } else {
      alert('Google Drive 模組未載入');
    }
  });
  document.getElementById('googleLogoutBtn')?.addEventListener('click', function() {
    if (typeof window.googleDriveLogout === 'function') {
      window.googleDriveLogout();
    }
    var box = document.getElementById('googleDriveAccountBox');
    if (box) box.textContent = '尚未登入';
    alert('已登出 Google Drive');
  });

  document.getElementById('manualGoogleBackupBtn')?.addEventListener('click', async function() {
    if (typeof window.googleDriveBackup === 'function') {
      var statusBox = document.getElementById('googleBackupStatusBox');
      if (statusBox) statusBox.textContent = '備份中...';
      try {
        await window.googleDriveBackup();
        if (statusBox) statusBox.textContent = '備份完成 ' + new Date().toLocaleString();
      } catch (e) {
        if (statusBox) statusBox.textContent = '備份失敗: ' + e.message;
      }
    } else {
      alert('Google Drive 備份模組未載入');
    }
  });

  document.getElementById('manualGoogleRestoreBtn')?.addEventListener('click', async function() {
    if (!confirm('確定要從 Google Drive 還原？本機資料將被覆蓋。')) return;
    if (typeof window.googleDriveRestore === 'function') {
      var statusBox = document.getElementById('googleBackupStatusBox');
      if (statusBox) statusBox.textContent = '還原中...';
      try {
        await window.googleDriveRestore();
        if (statusBox) statusBox.textContent = '還原完成，重新載入中...';
        setTimeout(function() { location.reload(); }, 1500);
      } catch (e) {
        if (statusBox) statusBox.textContent = '還原失敗: ' + e.message;
      }
    } else {
      alert('Google Drive 還原模組未載入');
    }
  });

  // ============================
  // 本機資料
  // ============================
  document.getElementById('exportJsonBtn')?.addEventListener('click', function() {
    try {
      var allData = state.exportAllData ? state.exportAllData() : state;
      var blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'pos-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      alert('匯出完成');
    } catch (e) {
      alert('匯出失敗: ' + e.message);
    }
  });

  document.getElementById('importJsonInput')?.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (!confirm('匯入將覆蓋現有資料，確定繼續？')) {
      e.target.value = '';
      return;
    }
    var reader = new FileReader();
    reader.onload = function(ev) {
      try {
        var data = JSON.parse(ev.target.result);
        if (state.importAllData) {
          state.importAllData(data);
        }
        alert('匯入完成，重新載入中...');
        setTimeout(function() { location.reload(); }, 1000);
      } catch (err) {
        alert('匯入失敗: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('seedDemoBtn')?.addEventListener('click', function() {
    if (!confirm('確定要重建預設資料？現有商品及分類將被覆蓋。')) return;
    if (typeof state.seedDemoData === 'function') {
      state.seedDemoData();
      alert('預設資料已重建，重新載入中...');
      setTimeout(function() { location.reload(); }, 1000);
    }
  });

  document.getElementById('showProductImagesToggle')?.addEventListener('change', function(e) {
    if (!state.settings) state.settings = {};
    state.settings.showProductImages = e.target.checked;
    persistAll();
  });

  // ============================
  // 進單提示音
  // ============================
  document.getElementById('uploadCustomSoundBtn')?.addEventListener('click', function() {
    var input = document.getElementById('customSoundFileInput');
    if (!input) return;
    // 觸發檔案選擇
    input.click();
  });

  document.getElementById('customSoundFileInput')?.addEventListener('change', function(e) {
    var file = e.target.files[0];
    if (!file) return;
    if (file.size > 500 * 1024) { alert('檔案過大，上限 500 KB'); return; }
    var reader = new FileReader();
    reader.onload = function(ev) {
      localStorage.setItem('customAlertSound', ev.target.result);
      var statusBox = document.getElementById('customSoundStatusBox');
      if (statusBox) statusBox.textContent = '已設定自訂提示音: ' + file.name;
      alert('提示音已上傳');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('previewCustomSoundBtn')?.addEventListener('click', function() {
    var saved = localStorage.getItem('customAlertSound');
    if (!saved) { alert('尚未設定提示音'); return; }
    var audio = new Audio(saved);
    audio.play().catch(function() { alert('播放失敗'); });
  });

  document.getElementById('removeCustomSoundBtn')?.addEventListener('click', function() {
    localStorage.removeItem('customAlertSound');
    var statusBox = document.getElementById('customSoundStatusBox');
    if (statusBox) statusBox.textContent = '尚未設定自訂提示音';
    alert('已移除自訂提示音');
  });

  // ============================
  // 初始化完成
  // ============================
  console.log('settings-page.js initialized (modal mode)');
}
