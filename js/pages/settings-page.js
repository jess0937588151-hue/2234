/* ============================================================
   js/pages/settings-page.js
   設定頁面：簡潔按鈕 + 浮動視窗
   ============================================================ */

import { state, persistAll, seedDefaults } from '../core/store.js';
import { downloadFile } from '../core/utils.js';
import { buildCartPreviewOrder, printOrderLabels, printOrderReceipt, printKitchenCopies, openCashDrawer, getPrintSettings, previewInModal, getReceiptHtml, getLabelHtml } from '../modules/print-service.js';
import { backupToGoogle, getGoogleBackupConfig, getGoogleDriveSession, initializeGoogleDriveApi, listGoogleBackups, restoreFromGoogle, signInGoogleDrive, signOutGoogleDrive, startGoogleAutoBackup } from '../modules/google-backup-service.js';
import { getRealtimeAuthUser, getRealtimeConfig, signInPOSWithGoogle, signOutPOSGoogle, startPOSRealtimeListener, verifyPOSAccess, waitForAuthReady, fetchMenuFromFirebase, watchMenuFromFirebase } from '../modules/realtime-order-service.js';

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
  // 按鈕開啟對應 Modal
  document.querySelectorAll('.setting-tile[data-modal]').forEach(function(tile) {
    tile.addEventListener('click', function() {
      openModal(tile.getAttribute('data-modal'));
    });
  });

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

// ── 主函式 ──
export function initSettingsPage() {

  initModalSystem();

  // ============================
  // 1. 列印設定 - 初始化欄位
  // ============================
  var printConfig = getPrintSettings();
  document.getElementById('printStoreName').value = printConfig.storeName || '';
  document.getElementById('printStorePhone').value = printConfig.storePhone || '';
  document.getElementById('printStoreAddress').value = printConfig.storeAddress || '';
  document.getElementById('printReceiptFooter').value = printConfig.receiptFooter || '';
  document.getElementById('printReceiptPaperWidth').value = printConfig.receiptPaperWidth || '58';
  document.getElementById('printLabelPaperWidth').value = Number(printConfig.labelPaperWidth || 60);
  document.getElementById('printLabelPaperHeight').value = Number(printConfig.labelPaperHeight || 40);
  document.getElementById('printReceiptFontSize').value = Number(printConfig.receiptFontSize || 12);
  document.getElementById('printLabelFontSize').value = Number(printConfig.labelFontSize || 12);
  document.getElementById('printReceiptOffsetX').value = Number(printConfig.receiptOffsetX || 0);
  document.getElementById('printReceiptOffsetY').value = Number(printConfig.receiptOffsetY || 0);
  document.getElementById('printLabelOffsetX').value = Number(printConfig.labelOffsetX || 0);
  document.getElementById('printLabelOffsetY').value = Number(printConfig.labelOffsetY || 0);
  document.getElementById('printKitchenCopies').value = Number(printConfig.kitchenCopies || 1);
  document.getElementById('printAutoCheckout').checked = !!printConfig.autoPrintCheckout;
  document.getElementById('printAutoKitchen').checked = !!printConfig.autoPrintKitchen;

  // 16. 列印設定 - 儲存
  document.getElementById('savePrintSettingsBtn').onclick = function() {
    var cfg = getPrintSettings();
    cfg.storeName = document.getElementById('printStoreName').value.trim();
    cfg.storePhone = document.getElementById('printStorePhone').value.trim();
    cfg.storeAddress = document.getElementById('printStoreAddress').value.trim();
    cfg.receiptFooter = document.getElementById('printReceiptFooter').value.trim();
    cfg.receiptPaperWidth = Number(document.getElementById('printReceiptPaperWidth').value) || 58;
    cfg.labelPaperWidth = Number(document.getElementById('printLabelPaperWidth').value || 60);
    cfg.labelPaperHeight = Number(document.getElementById('printLabelPaperHeight').value || 40);
    cfg.receiptFontSize = Number(document.getElementById('printReceiptFontSize').value || 12);
    cfg.labelFontSize = Number(document.getElementById('printLabelFontSize').value || 12);
    cfg.receiptOffsetX = Number(document.getElementById('printReceiptOffsetX').value || 0);
    cfg.receiptOffsetY = Number(document.getElementById('printReceiptOffsetY').value || 0);
    cfg.labelOffsetX = Number(document.getElementById('printLabelOffsetX').value || 0);
    cfg.labelOffsetY = Number(document.getElementById('printLabelOffsetY').value || 0);
    cfg.kitchenCopies = Math.max(1, Number(document.getElementById('printKitchenCopies').value || 1));
    cfg.autoPrintCheckout = document.getElementById('printAutoCheckout').checked;
    cfg.autoPrintKitchen = document.getElementById('printAutoKitchen').checked;
    persistAll();
    // 同步到 APK
    if (hasSunmi() && window.SunmiPrinter.saveSettings) {
      try { window.SunmiPrinter.saveSettings(JSON.stringify(cfg)); } catch(e) {}
    }
    alert('列印設定已儲存');
  };

  // 17-20. 列印預覽
  function buildPreviewOrderForSettings() {
    if (Array.isArray(state.cart) && state.cart.length) return buildCartPreviewOrder();
    return {
      orderNo: 'PREVIEW-' + Date.now(),
      createdAt: new Date().toISOString(),
      orderType: '內用', tableNo: 'A1', paymentMethod: '現金',
      subtotal: 145, discountAmount: 0, total: 145,
      items: [{
        rowId: 'preview1', productId: 'preview1', name: '雞排',
        basePrice: 70, qty: 2, note: '不要切',
        selections: [
          { moduleName: '辣度', optionName: '小辣', price: 0 },
          { moduleName: '灑粉', optionName: '梅粉', price: 5 }
        ],
        extraPrice: 5
      }]
    };
  }

  document.getElementById('previewReceiptPrintBtn').onclick = function() {
    previewInModal(getReceiptHtml(buildPreviewOrderForSettings(), 'customer'));
  };
  document.getElementById('previewKitchenPrintBtn').onclick = function() {
    previewInModal(getReceiptHtml(buildPreviewOrderForSettings(), 'kitchen'));
  };
  document.getElementById('previewLabelPrintBtn').onclick = function() {
    previewInModal(getLabelHtml(buildPreviewOrderForSettings()));
  };

  // ============================
  // Sunmi 印表機
  // ============================
  refreshSunmiStatus();

  document.getElementById('sunmiRefreshStatusBtn').onclick = function() {
    refreshSunmiStatus();
  };
  document.getElementById('sunmiTestPrintBtn').onclick = function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.printTestReceipt ? window.SunmiPrinter.printTestReceipt() : false;
    alert(ok ? '測試列印成功' : '測試列印失敗');
  };
  document.getElementById('sunmiTestCutBtn').onclick = function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.cutPaper ? window.SunmiPrinter.cutPaper() : false;
    alert(ok ? '切紙成功' : '切紙失敗');
  };
  document.getElementById('sunmiTestDrawerBtn').onclick = function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.openCashDrawer ? window.SunmiPrinter.openCashDrawer() : false;
    alert(ok ? '錢箱已開' : '開錢箱失敗');
  };
  document.getElementById('sunmiTestBuzzerBtn').onclick = function() {
    if (!hasSunmi()) { alert('未偵測到 Sunmi 印表機'); return; }
    var ok = window.SunmiPrinter.buzzer ? window.SunmiPrinter.buzzer() : false;
    alert(ok ? '蜂鳴成功' : '蜂鳴失敗');
  };

  // ============================
  // 藍牙印表機
  // ============================
  refreshBtStatus();
  refreshBtDevices();

  document.getElementById('btRefreshBtn').onclick = function() {
    refreshBtDevices();
    refreshBtStatus();
  };
  document.getElementById('btConnectBtn').onclick = function() {
    if (!hasSunmi() || !window.SunmiPrinter.connectBtPrinter) { alert('需透過 Sunmi APK 操作'); return; }
    var addr = document.getElementById('btDeviceSelect').value;
    if (!addr) { alert('請選擇裝置'); return; }
    var ok = window.SunmiPrinter.connectBtPrinter(addr);
    refreshBtStatus();
    alert(ok ? '藍牙已連線' : '藍牙連線失敗');
  };
  document.getElementById('btDisconnectBtn').onclick = function() {
    if (hasSunmi() && window.SunmiPrinter.disconnectBtPrinter) window.SunmiPrinter.disconnectBtPrinter();
    refreshBtStatus();
  };
  document.getElementById('btTestPrintBtn').onclick = function() {
    if (!hasSunmi() || !window.SunmiPrinter.btPrintText) { alert('需透過 Sunmi APK 操作'); return; }
    var ok = window.SunmiPrinter.btPrintText('藍牙測試列印\n' + new Date().toLocaleString() + '\n');
    alert(ok ? '藍牙測試成功' : '藍牙測試失敗');
  };

  // ============================
  // 網路印表機
  // ============================
  refreshNetStatus();

  document.getElementById('netConnectBtn').onclick = function() {
    if (!hasSunmi() || !window.SunmiPrinter.connectNetPrinter) { alert('需透過 Sunmi APK 操作'); return; }
    var ip = document.getElementById('netIpInput').value.trim();
    var port = parseInt(document.getElementById('netPortInput').value) || 9100;
    if (!ip) { alert('請輸入 IP'); return; }
    var ok = window.SunmiPrinter.connectNetPrinter(ip, port);
    refreshNetStatus();
    alert(ok ? '網路已連線：' + ip + ':' + port : '網路連線失敗');
  };
  document.getElementById('netDisconnectBtn').onclick = function() {
    if (hasSunmi() && window.SunmiPrinter.disconnectNetPrinter) window.SunmiPrinter.disconnectNetPrinter();
    refreshNetStatus();
  };
  document.getElementById('netTestPrintBtn').onclick = function() {
    if (!hasSunmi() || !window.SunmiPrinter.netPrintText) { alert('需透過 Sunmi APK 操作'); return; }
    var ok = window.SunmiPrinter.netPrintText('網路測試列印\n' + new Date().toLocaleString() + '\n');
    alert(ok ? '網路測試成功' : '網路測試失敗');
  };

  // ============================================================
  // 即时接单设定 Modal
  // ============================================================
  document.getElementById('tile-realtime')?.addEventListener('click', () => {
    const s = state.getSettings();
    const rt = s.realtimeOrder || {};
    document.getElementById('realtimeOrderEnabled').checked = !!rt.enabled;
    document.getElementById('deviceRole').value = rt.deviceRole || 'master';
    document.getElementById('firebaseApiKey').value = rt.firebaseApiKey || '';
    document.getElementById('firebaseAuthDomain').value = rt.firebaseAuthDomain || '';
    document.getElementById('firebaseDatabaseUrl').value = rt.firebaseDatabaseUrl || '';
    document.getElementById('firebaseProjectId').value = rt.firebaseProjectId || '';
    document.getElementById('firebaseStorageBucket').value = rt.firebaseStorageBucket || '';
    document.getElementById('firebaseMessagingSenderId').value = rt.firebaseMessagingSenderId || '';
    document.getElementById('firebaseAppId').value = rt.firebaseAppId || '';
    document.getElementById('firebaseMeasurementId').value = rt.firebaseMeasurementId || '';
    document.getElementById('onlineStoreTitle').value = rt.onlineStoreTitle || '';
    document.getElementById('onlineStoreSubtitle').value = rt.onlineStoreSubtitle || '';
    document.getElementById('onlineConfirmAutoPrintKitchen').checked = !!rt.autoPrintKitchen;
    document.getElementById('onlineConfirmAutoPrintReceipt').checked = !!rt.autoPrintReceipt;
    document.getElementById('onlineIncomingSoundEnabled').checked = rt.incomingSoundEnabled !== false;
    openModal('modalRealtime');
  });

  document.getElementById('saveRealtimeOrderSettingsBtn')?.addEventListener('click', () => {
    const s = state.getSettings();
    s.realtimeOrder = {
      enabled: document.getElementById('realtimeOrderEnabled').checked,
      deviceRole: document.getElementById('deviceRole').value,
      firebaseApiKey: document.getElementById('firebaseApiKey').value.trim(),
      firebaseAuthDomain: document.getElementById('firebaseAuthDomain').value.trim(),
      firebaseDatabaseUrl: document.getElementById('firebaseDatabaseUrl').value.trim(),
      firebaseProjectId: document.getElementById('firebaseProjectId').value.trim(),
      firebaseStorageBucket: document.getElementById('firebaseStorageBucket').value.trim(),
      firebaseMessagingSenderId: document.getElementById('firebaseMessagingSenderId').value.trim(),
      firebaseAppId: document.getElementById('firebaseAppId').value.trim(),
      firebaseMeasurementId: document.getElementById('firebaseMeasurementId').value.trim(),
      onlineStoreTitle: document.getElementById('onlineStoreTitle').value.trim(),
      onlineStoreSubtitle: document.getElementById('onlineStoreSubtitle').value.trim(),
      autoPrintKitchen: document.getElementById('onlineConfirmAutoPrintKitchen').checked,
      autoPrintReceipt: document.getElementById('onlineConfirmAutoPrintReceipt').checked,
      incomingSoundEnabled: document.getElementById('onlineIncomingSoundEnabled').checked
    };
    state.saveSettings(s);
    alert('即时接单设定已储存');

    // 如果有 realtime-order 模块，通知它重新初始化
    if (typeof window.reinitRealtimeOrder === 'function') {
      window.reinitRealtimeOrder();
    }
  });

  // 同步菜单到云端
  document.getElementById('syncMenuBtn')?.addEventListener('click', async () => {
    if (typeof window.syncMenuToCloud === 'function') {
      await window.syncMenuToCloud();
      alert('菜单已同步至云端');
    } else {
      alert('同步模块未载入');
    }
  });

  // POS Google 登入/登出
  document.getElementById('posGoogleLoginBtn')?.addEventListener('click', () => {
    if (typeof window.posGoogleLogin === 'function') {
      window.posGoogleLogin();
    } else {
      alert('Google 登入模块未载入');
    }
  });

  document.getElementById('posGoogleLogoutBtn')?.addEventListener('click', () => {
    if (typeof window.posGoogleLogout === 'function') {
      window.posGoogleLogout();
    }
    const box = document.getElementById('posGoogleAccountBox');
    if (box) box.textContent = '尚未登入';
    alert('已登出');
  });

  // ============================================================
  // Google Drive 备份 Modal
  // ============================================================
  document.getElementById('tile-google')?.addEventListener('click', () => {
    const s = state.getSettings();
    const g = s.googleDrive || {};
    document.getElementById('googleClientId').value = g.clientId || '';
    document.getElementById('googleFolderId').value = g.folderId || '';
    document.getElementById('googleAutoBackupEnabled').checked = !!g.autoBackupEnabled;
    document.getElementById('googleAutoBackupMinutes').value = g.autoBackupMinutes || 30;
    openModal('modalGoogle');
  });

  document.getElementById('saveGoogleBackupSettingsBtn')?.addEventListener('click', () => {
    const s = state.getSettings();
    s.googleDrive = {
      clientId: document.getElementById('googleClientId').value.trim(),
      folderId: document.getElementById('googleFolderId').value.trim(),
      autoBackupEnabled: document.getElementById('googleAutoBackupEnabled').checked,
      autoBackupMinutes: parseInt(document.getElementById('googleAutoBackupMinutes').value) || 30
    };
    state.saveSettings(s);
    alert('Google Drive 设定已储存');
  });

  document.getElementById('googleLoginBtn')?.addEventListener('click', () => {
    if (typeof window.googleDriveLogin === 'function') {
      window.googleDriveLogin();
    } else {
      alert('Google Drive 模块未载入');
    }
  });

  document.getElementById('googleLogoutBtn')?.addEventListener('click', () => {
    if (typeof window.googleDriveLogout === 'function') {
      window.googleDriveLogout();
    }
    const box = document.getElementById('googleDriveAccountBox');
    if (box) box.textContent = '尚未登入';
    alert('已登出 Google Drive');
  });

  document.getElementById('manualGoogleBackupBtn')?.addEventListener('click', async () => {
    if (typeof window.googleDriveBackup === 'function') {
      const statusBox = document.getElementById('googleBackupStatusBox');
      if (statusBox) statusBox.textContent = '备份中...';
      try {
        await window.googleDriveBackup();
        if (statusBox) statusBox.textContent = '备份完成 ' + new Date().toLocaleString();
      } catch (e) {
        if (statusBox) statusBox.textContent = '备份失败: ' + e.message;
      }
    } else {
      alert('Google Drive 备份模块未载入');
    }
  });

  document.getElementById('manualGoogleRestoreBtn')?.addEventListener('click', async () => {
    if (!confirm('确定要从 Google Drive 还原？本机资料将被覆盖。')) return;
    if (typeof window.googleDriveRestore === 'function') {
      const statusBox = document.getElementById('googleBackupStatusBox');
      if (statusBox) statusBox.textContent = '还原中...';
      try {
        await window.googleDriveRestore();
        if (statusBox) statusBox.textContent = '还原完成，重新载入中...';
        setTimeout(() => location.reload(), 1500);
      } catch (e) {
        if (statusBox) statusBox.textContent = '还原失败: ' + e.message;
      }
    } else {
      alert('Google Drive 还原模块未载入');
    }
  });

  // ============================================================
  // 本机资料 Modal
  // ============================================================
  document.getElementById('tile-localdata')?.addEventListener('click', () => {
    openModal('modalLocalData');
  });

  document.getElementById('exportJsonBtn')?.addEventListener('click', () => {
    try {
      const allData = state.exportAllData();
      const blob = new Blob([JSON.stringify(allData, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'pos-backup-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      URL.revokeObjectURL(url);
      alert('汇出完成');
    } catch (e) {
      alert('汇出失败: ' + e.message);
    }
  });

  document.getElementById('importJsonInput')?.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!confirm('汇入将覆盖现有资料，确定继续？')) {
      e.target.value = '';
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = JSON.parse(ev.target.result);
        state.importAllData(data);
        alert('汇入完成，重新载入中...');
        setTimeout(() => location.reload(), 1000);
      } catch (err) {
        alert('汇入失败: ' + err.message);
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('seedDemoBtn')?.addEventListener('click', () => {
    if (!confirm('确定要重建预设资料？现有商品及分类将被覆盖。')) return;
    if (typeof state.seedDemoData === 'function') {
      state.seedDemoData();
      alert('预设资料已重建，重新载入中...');
      setTimeout(() => location.reload(), 1000);
    }
  });

  document.getElementById('showProductImagesToggle')?.addEventListener('change', (e) => {
    const s = state.getSettings();
    s.showProductImages = e.target.checked;
    state.saveSettings(s);
  });

  // ============================================================
  // 自订提示音 Modal
  // ============================================================
  document.getElementById('tile-sound')?.addEventListener('click', () => {
    const statusBox = document.getElementById('customSoundStatusBox');
    if (statusBox) {
      const saved = localStorage.getItem('customAlertSound');
      statusBox.textContent = saved ? '已设定自订提示音' : '尚未设定自订提示音';
    }
    openModal('modalSound');
  });

  document.getElementById('uploadCustomSoundBtn')?.addEventListener('click', () => {
    const input = document.getElementById('customSoundFileInput');
    const file = input?.files?.[0];
    if (!file) { alert('请先选择音档'); return; }
    if (file.size > 500 * 1024) { alert('档案过大，上限 500 KB'); return; }
    const reader = new FileReader();
    reader.onload = (ev) => {
      localStorage.setItem('customAlertSound', ev.target.result);
      const statusBox = document.getElementById('customSoundStatusBox');
      if (statusBox) statusBox.textContent = '已设定自订提示音: ' + file.name;
      alert('提示音已上传');
    };
    reader.readAsDataURL(file);
  });

  document.getElementById('previewCustomSoundBtn')?.addEventListener('click', () => {
    const saved = localStorage.getItem('customAlertSound');
    if (!saved) { alert('尚未设定提示音'); return; }
    const audio = new Audio(saved);
    audio.play().catch(() => alert('播放失败'));
  });

  document.getElementById('removeCustomSoundBtn')?.addEventListener('click', () => {
    localStorage.removeItem('customAlertSound');
    const statusBox = document.getElementById('customSoundStatusBox');
    if (statusBox) statusBox.textContent = '尚未设定自订提示音';
    alert('已移除自订提示音');
  });

  // ============================================================
  // 初始化完成 log
  // ============================================================
  console.log('settings-page.js initialized (modal mode)');
}
