/* 中文備註：報表頁 v2.1.26 — Batch 06.16/3
 * 班次主導：只顯示「當班即時數據」與「歷史班次」。
 * 依賴 report-session.js 的 startSession / endSession / 等 API。
 */
import { state, persistAll } from '../core/store.js';
import { escapeHtml, money, downloadFile, fmtLocalDateTime } from '../core/utils.js';
import {
  CASH_DENOMINATIONS,
  calcCashTotal,
  emptyCashDetail,
  getCurrentSession,
  hasOpenSession,
  startSession,
  endSession,
  getSessionOrders,
  calcSessionStats,
  getRecentSessions
} from '../modules/report-session.js';

// ──────────────────────────────────────────────
// 工具：把 session 訂單抓出來（含 fallback 給尚未寫入 sessionId 的舊單）
// ──────────────────────────────────────────────
function getCurrentSessionOrders(){
  const cur = getCurrentSession();
  if(!cur) return [];
  const startTs = new Date(cur.startedAt).getTime();
  return (state.orders || []).filter(o => {
    if(o.sessionId === cur.id) return true;
    if(!o.sessionId){
      const t = new Date(o.createdAt || 0).getTime();
      return t >= startTs;
    }
    return false;
  });
}

// ──────────────────────────────────────────────
// 班次狀態列
// ──────────────────────────────────────────────
function renderSessionStatusBar(){
  const bar = document.getElementById('sessionStatusText');
  const startBtn = document.getElementById('startSessionBtn');
  const endBtn = document.getElementById('endSessionBtn');
  const panel = document.getElementById('currentSessionPanel');
  const lock = document.getElementById('posLockOverlay');

  const cur = getCurrentSession();
  if(cur){
    const startedAt = new Date(cur.startedAt);
    const elapsed = Math.floor((Date.now() - startedAt.getTime()) / 1000);
    const hh = String(Math.floor(elapsed/3600)).padStart(2,'0');
    const mm = String(Math.floor((elapsed%3600)/60)).padStart(2,'0');
    const ss = String(elapsed%60).padStart(2,'0');
    const orderCount = getCurrentSessionOrders().length;
    if(bar){
      bar.innerHTML = `🟢 <strong>值班中</strong>　${escapeHtml(cur.staffId)}　已開班 ${hh}:${mm}:${ss}　${orderCount} 筆`;
    }
    if(startBtn) startBtn.style.display = 'none';
    if(endBtn) endBtn.style.display = 'inline-block';
    if(panel) panel.style.display = '';
    if(lock) lock.style.display = 'none';
  } else {
    if(bar){ bar.innerHTML = '⚪ <strong>未開班</strong>　請先開始值班'; }
    if(startBtn) startBtn.style.display = 'inline-block';
    if(endBtn) endBtn.style.display = 'none';
    if(panel) panel.style.display = 'none';
    if(lock) lock.style.display = 'flex';
  }
}

// 每秒刷新一次計時
let statusTimer = null;
function startStatusTimer(){
  if(statusTimer) clearInterval(statusTimer);
  statusTimer = setInterval(renderSessionStatusBar, 1000);
}

// ──────────────────────────────────────────────
// 數據區渲染
// ──────────────────────────────────────────────
function renderCurrentSessionData(){
  const cur = getCurrentSession();
  if(!cur) return;
  const orders = getCurrentSessionOrders();

  // 卡片
  const sales = orders.reduce((s,o)=>s+Number(o.total||0),0);
  const count = orders.length;
  const avg = count ? Math.round(sales/count) : 0;
  const discount = orders.reduce((s,o)=>s+Number(o.discountAmount||0),0);
  const cards = document.getElementById('reportCards');
  if(cards){
    cards.innerHTML = [
      ['營業額', money(sales)],
      ['訂單數', count],
      ['客單價', money(avg)],
      ['折扣', money(discount)]
    ].map(p => `<div class="stat-card"><div class="label">${p[0]}</div><div class="value">${p[1]}</div></div>`).join('');
  }

  // 訂單類型
  const typeMap = {};
  orders.forEach(o => {
    const k = o.orderType || '未分類';
    typeMap[k] = typeMap[k] || {count:0, sales:0};
    typeMap[k].count++;
    typeMap[k].sales += Number(o.total||0);
  });
  const typeEl = document.getElementById('orderTypeStats');
  if(typeEl){
    const keys = Object.keys(typeMap);
    typeEl.innerHTML = keys.length
      ? keys.map(k=>`<div class="list-row"><div>${escapeHtml(k)}</div><strong>${typeMap[k].count}單</strong><span>${money(typeMap[k].sales)}</span></div>`).join('')
      : '<div class="muted">尚無資料</div>';
  }

  // 付款方式
  const payMap = {};
  orders.forEach(o => {
    const k = o.paymentMethod || '未設定';
    payMap[k] = (payMap[k]||0) + Number(o.total||0);
  });
  const payEl = document.getElementById('paymentStats');
  if(payEl){
    const keys = Object.keys(payMap);
    payEl.innerHTML = keys.length
      ? keys.map(k=>`<div class="list-row"><div>${escapeHtml(k)}</div><strong>${money(payMap[k])}</strong><span></span></div>`).join('')
      : '<div class="muted">尚無資料</div>';
  }

  // 熱銷 TOP10
  const prodMap = {};
  orders.forEach(o => (o.items||[]).forEach(i=>{
    prodMap[i.name] = (prodMap[i.name]||0) + Number(i.qty||0);
  }));
  const top = Object.entries(prodMap).sort((a,b)=>b[1]-a[1]).slice(0,10);
  const topEl = document.getElementById('topProducts');
  if(topEl){
    topEl.innerHTML = top.length
      ? top.map(p=>`<div class="list-row"><div>${escapeHtml(p[0])}</div><strong>${p[1]}</strong><span>份</span></div>`).join('')
      : '<div class="muted">尚無資料</div>';
  }

  // 時段分布
  const hourMap = {};
  orders.forEach(o => {
    const h = new Date(o.createdAt).getHours();
    const k = String(h).padStart(2,'0') + ':00';
    hourMap[k] = hourMap[k] || {count:0, sales:0};
    hourMap[k].count++;
    hourMap[k].sales += Number(o.total||0);
  });
  const hourEl = document.getElementById('hourAnalysis');
  if(hourEl){
    const arr = Object.entries(hourMap).sort((a,b)=>a[0].localeCompare(b[0]));
    hourEl.innerHTML = arr.length
      ? arr.map(p=>`<div class="list-row"><div>${p[0]}</div><strong>${p[1].count}單</strong><span>${money(p[1].sales)}</span></div>`).join('')
      : '<div class="muted">尚無資料</div>';
  }
}

// 歷史班次列表
function renderHistorySessions(){
  const el = document.getElementById('reportSessionList');
  if(!el) return;
  const list = getRecentSessions(30);
  if(!list.length){
    el.innerHTML = '<div class="muted">近 30 天尚無已結束班次</div>';
    return;
  }
  el.innerHTML = list.map(s => {
    const start = fmtLocalDateTime(s.startedAt).slice(5);  // 顯示 MM-DD HH:mm
    const end = s.endedAt ? fmtLocalDateTime(s.endedAt).slice(11) : '進行中';  // 只顯示 HH:mm
    const sales = s.stats ? money(s.stats.salesTotal) : money(0);
    const count = s.stats ? s.stats.orderCount : 0;
    const diffNum = Number(s.cashDiff||0);
    let diffHtml = '';
    if(s.endedAt){
      if(diffNum===0) diffHtml = '<span style="color:#10b981;font-weight:bold">✓ 平衡</span>';
      else if(diffNum<0) diffHtml = `<span style="color:#ef4444;font-weight:bold">短少 ${diffNum}</span>`;
      else diffHtml = `<span style="color:#f59e0b;font-weight:bold">溢收 +${diffNum}</span>`;
    }
    return `
      <div style="border:1px solid #e2e8f0;border-radius:10px;padding:12px;margin-bottom:8px;background:#fff">
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:6px">
          <strong>${escapeHtml(start)} ~ ${escapeHtml(end)}</strong>
          <span style="font-size:13px;color:#64748b">${escapeHtml(s.staffId||'')}${s.endStaffId&&s.endStaffId!==s.staffId?' / '+escapeHtml(s.endStaffId):''}</span>
        </div>
        <div style="display:flex;gap:12px;flex-wrap:wrap;font-size:13px;color:#475569">
          <span>${count} 單</span>
          <span>營業額 <strong style="color:#0f172a">${sales}</strong></span>
          <span>${diffHtml}</span>
        </div>
        ${s.note?`<div style="margin-top:6px;font-size:12px;color:#64748b">備註：${escapeHtml(s.note)}</div>`:''}
      </div>
    `;
  }).join('');
}

// ──────────────────────────────────────────────
// 主刷新 export
// ──────────────────────────────────────────────
export function renderReports(){
  renderSessionStatusBar();
  renderCurrentSessionData();
  renderHistorySessions();
}

// ──────────────────────────────────────────────
// 開始/結束值班 — 浮動視窗
// ──────────────────────────────────────────────
function renderCashGrid(containerId, prefix, onChange){
  const el = document.getElementById(containerId);
  if(!el) return;
  el.innerHTML = CASH_DENOMINATIONS.map(d => `
    <div style="display:flex;align-items:center;gap:6px;background:#fff;padding:6px 10px;border:1px solid #e2e8f0;border-radius:6px">
      <span style="font-size:13px;width:50px">$${d}</span>
      <span style="font-size:12px;color:#94a3b8">×</span>
      <input type="tel" inputmode="numeric" pattern="[0-9]*" value="0" data-denom="${d}" id="${prefix}_${d}" style="flex:1;padding:6px;border:1px solid #cbd5e1;border-radius:4px;font-size:14px;text-align:right;-webkit-appearance:none;appearance:none">
      <span style="font-size:12px;color:#64748b;width:60px;text-align:right" id="${prefix}_${d}_sub">$0</span>
    </div>
  `).join('');
    el.querySelectorAll('input[data-denom]').forEach(input => {
    input.addEventListener('focus', () => input.select());
    input.addEventListener('input', () => {
      // 過濾非數字
      input.value = input.value.replace(/[^0-9]/g, '');
      const d = Number(input.dataset.denom);
      const n = Math.max(0, Number(input.value)||0);
      const sub = document.getElementById(`${prefix}_${d}_sub`);
      if(sub) sub.textContent = '$' + (d*n);
      if(onChange) onChange(getCashDetailFromGrid(prefix));
    });
  });

}

function getCashDetailFromGrid(prefix){
  const detail = emptyCashDetail();
  CASH_DENOMINATIONS.forEach(d => {
    const el = document.getElementById(`${prefix}_${d}`);
    if(el) detail[d] = Math.max(0, Number(el.value)||0);
  });
  return detail;
}

function openStartSessionModal(){
  const modal = document.getElementById('startSessionModal');
  if(!modal) return;
  document.getElementById('startStaffSelect').value = 'A1';
  renderCashGrid('startCashGrid', 'startCash', detail => {
    document.getElementById('startCashTotal').textContent = '$' + calcCashTotal(detail);
  });
  document.getElementById('startCashTotal').textContent = '$0';
  modal.classList.remove('hidden');
}

function confirmStartSession(){
  try{
    const staffId = document.getElementById('startStaffSelect').value;
    const cashDetail = getCashDetailFromGrid('startCash');
    startSession({ staffId, cashDetail });
        document.getElementById('startSessionModal').classList.add('hidden');
    renderReports();
    if(typeof window.refreshPosLockState === 'function') window.refreshPosLockState();
    if(typeof window.refreshAllViews === 'function') window.refreshAllViews();

    alert(`已開始值班\n人員：${staffId}\n備用金：$${calcCashTotal(cashDetail)}`);
  }catch(err){
    alert('開班失敗：' + err.message);
  }
}

function openEndSessionModal(){
  const cur = getCurrentSession();
  if(!cur){ alert('目前沒有進行中的班次'); return; }
  const modal = document.getElementById('endSessionModal');
  if(!modal) return;

  // 計算本班統計
  const orders = getCurrentSessionOrders();
  const cashSales = orders
    .filter(o => o.paymentMethod === '現金')
    .reduce((s,o)=>s+Number(o.total||0),0);
  const expected = Number(cur.openingCash||0) + cashSales;

  // 寫入應收欄位
  document.getElementById('endSessionInfo').textContent =
    `班次 ${cur.staffId}　開班 ${fmtLocalDateTime(cur.startedAt)}　${orders.length} 筆訂單`;
  document.getElementById('endOpeningCash').textContent = '$' + Number(cur.openingCash||0);
  document.getElementById('endCashSales').textContent = '$' + cashSales;
  document.getElementById('endExpectedCash').textContent = '$' + expected;
  document.getElementById('endStaffSelect').value = cur.staffId || 'A1';
  document.getElementById('endSessionNote').value = '';

  renderCashGrid('endCashGrid', 'endCash', detail => {
    const closing = calcCashTotal(detail);
    document.getElementById('endClosingCash').textContent = '$' + closing;
    const diff = closing - expected;
    const diffEl = document.getElementById('endCashDiff');
    if(diff === 0){
      diffEl.textContent = '$0 ✓';
      diffEl.style.color = '#10b981';
      diffEl.parentElement.style.background = '#f0fdf4';
    } else if(diff < 0){
      diffEl.textContent = `$${diff}（短少）`;
      diffEl.style.color = '#ef4444';
      diffEl.parentElement.style.background = '#fef2f2';
    } else {
      diffEl.textContent = `+$${diff}（溢收）`;
      diffEl.style.color = '#f59e0b';
      diffEl.parentElement.style.background = '#fffbeb';
    }
  });
  document.getElementById('endClosingCash').textContent = '$0';
  const diffEl = document.getElementById('endCashDiff');
  diffEl.textContent = `$${0-expected}（短少）`;
  diffEl.style.color = '#ef4444';
  diffEl.parentElement.style.background = '#fef2f2';

  modal.classList.remove('hidden');
}

function confirmEndSession(){
  try{
    const staffId = document.getElementById('endStaffSelect').value;
    const cashDetail = getCashDetailFromGrid('endCash');
    const note = document.getElementById('endSessionNote').value || '';
    const ended = endSession({ staffId, cashDetail, note });
    document.getElementById('endSessionModal').classList.add('hidden');
    renderReports();

    if(typeof window.refreshPosLockState === 'function') window.refreshPosLockState();
    if(typeof window.refreshAllViews === 'function') window.refreshAllViews();

    const diff = Number(ended.cashDiff||0);
    let msg = `已結束值班\n營業額：${money(ended.stats.salesTotal)}\n訂單數：${ended.stats.orderCount}\n`;
    if(diff===0) msg += '現金平衡 ✓';
    else if(diff<0) msg += `現金短少 $${-diff}`;
    else msg += `現金溢收 $${diff}`;
    alert(msg);
  }catch(err){
    alert('結束值班失敗：' + err.message);
  }
}

// ──────────────────────────────────────────────
// 列印 / 匯出（簡化版，06.16/8 會做選擇對話框）
// ──────────────────────────────────────────────
function printCurrentReport(){
  const cur = getCurrentSession();
  if(!cur){ alert('尚未開班，無法列印'); return; }
  const orders = getCurrentSessionOrders();
  const sales = orders.reduce((s,o)=>s+Number(o.total||0),0);
  const html = `
    <html><head><meta charset="utf-8"><title>班次報表</title>
    <style>body{font-family:sans-serif;padding:20px}h1{text-align:center}table{width:100%;border-collapse:collapse;margin-top:12px}td,th{border:1px solid #ccc;padding:6px}</style>
    </head><body>
    <h1>班次報表</h1>
    <p>人員：${escapeHtml(cur.staffId)}　開班：${escapeHtml(fmtLocalDateTime(cur.startedAt))}</p>
    <table><tr><td>營業額</td><td style="text-align:right">${money(sales)}</td></tr>
    <tr><td>訂單數</td><td style="text-align:right">${orders.length}</td></tr></table>
    </body></html>`;
  const w = window.open('', '_blank');
  if(!w){ alert('請允許彈出視窗'); return; }
  w.document.write(html);
  w.document.close();
  setTimeout(()=>w.print(), 300);
}

function exportCurrentReportCsv(){
  const cur = getCurrentSession();
  if(!cur){ alert('尚未開班，無法匯出'); return; }
  const orders = getCurrentSessionOrders();
  const rows = [['訂單編號','時間','類型','付款','金額']];
    orders.forEach(o => rows.push([
    o.orderNo||o.id,
    fmtLocalDateTime(o.createdAt),
    o.orderType||'',
    o.paymentMethod||'',
    Number(o.total||0)
  ]));
  // BOM 修正中文
  const csv = '\uFEFF' + rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n');
  downloadFile(`班次_${cur.staffId}_${new Date().toISOString().slice(0,10)}.csv`, csv, 'text/csv');
}

// ──────────────────────────────────────────────
// 初始化
// ──────────────────────────────────────────────
export function initReportsPage(){
  document.getElementById('startSessionBtn')?.addEventListener('click', openStartSessionModal);
  document.getElementById('endSessionBtn')?.addEventListener('click', openEndSessionModal);
  document.getElementById('confirmStartSessionBtn')?.addEventListener('click', confirmStartSession);
  document.getElementById('confirmEndSessionBtn')?.addEventListener('click', confirmEndSession);
  document.getElementById('reportPrintBtn')?.addEventListener('click', printCurrentReport);
  document.getElementById('reportExportBtn')?.addEventListener('click', exportCurrentReportCsv);
  document.getElementById('costManageBtn')?.addEventListener('click', () => {
    alert('💰 成本管理功能將在 Batch 06.16/7 提供');
  });
  document.getElementById('toggleTopProductsBtn')?.addEventListener('click', () => {
    const el = document.getElementById('topProducts');
    el?.classList.toggle('collapsed');
  });
  document.getElementById('goToReportsBtn')?.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelector('[data-view="reportsView"]')?.classList.add('active');
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('reportsView')?.classList.add('active');
  });

  startStatusTimer();
  renderReports();
}
