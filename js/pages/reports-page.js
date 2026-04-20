import { state, persistAll } from '../core/store.js';
import { escapeHtml, money, todayStr, downloadFile } from '../core/utils.js';
import { startSession, endSession, saveCurrentSnapshot, getSessionListHtml } from '../modules/report-session.js';

function getReportOrders(){
  if(state.viewReportOrders) return state.viewReportOrders;
  const from = document.getElementById('reportDateFrom')?.value || '';
  const to = document.getElementById('reportDateTo')?.value || '';
  return state.orders.filter(function(o){
    var d = (o.createdAt || '').slice(0,10);
    return (!from || d >= from) && (!to || d <= to);
  });
}

export function renderReports(){
  var cards = document.getElementById('reportCards');
  if(!cards) return;

  var orders = getReportOrders();
  var today = todayStr();
  var ordersToday = orders.filter(function(o){ return (o.createdAt || '').slice(0,10) === today; });
  var todaySales = ordersToday.reduce(function(s,o){ return s + Number(o.total || 0); }, 0);
  var seven = orders.filter(function(o){ return Date.now() - new Date(o.createdAt).getTime() <= 7*86400000; }).reduce(function(s,o){ return s + Number(o.total || 0); }, 0);
  var thirty = orders.filter(function(o){ return Date.now() - new Date(o.createdAt).getTime() <= 30*86400000; }).reduce(function(s,o){ return s + Number(o.total || 0); }, 0);

  cards.innerHTML = [
    ['今日營業額', money(todaySales)],
    ['今日訂單數', ordersToday.length],
    ['近7日營業額', money(seven)],
    ['近30日營業額', money(thirty)]
  ].map(function(pair){ return '<div class="stat-card"><div class="label">' + pair[0] + '</div><div class="value">' + pair[1] + '</div></div>'; }).join('');

  var productMap = {};
  orders.forEach(function(o){ (o.items || []).forEach(function(i){
    productMap[i.name] = (productMap[i.name]||0) + Number(i.qty || 0);
  }); });
  var top = Object.entries(productMap).sort(function(a,b){ return b[1]-a[1]; }).slice(0,10);
  var topEl = document.getElementById('topProducts');
  if(topEl){
    topEl.innerHTML = top.length ? top.map(function(pair){ return '<div class="list-row"><div>' + escapeHtml(pair[0]) + '</div><strong>' + pair[1] + '</strong><span>份</span></div>'; }).join('') : '<div class="muted">尚無資料</div>';
  }

  var payMap = {};
  orders.forEach(function(o){
    var key = o.paymentMethod || '未設定';
    payMap[key] = (payMap[key]||0) + Number(o.total || 0);
  });
  var payEl = document.getElementById('paymentStats');
  if(payEl){
    payEl.innerHTML = Object.keys(payMap).length ? Object.entries(payMap).map(function(pair){ return '<div class="list-row"><div>' + escapeHtml(pair[0]) + '</div><strong>' + money(pair[1]) + '</strong><span></span></div>'; }).join('') : '<div class="muted">尚無資料</div>';
  }

  var productAnalysis = {};
  orders.forEach(function(o){ (o.items || []).forEach(function(i){
    var key = i.name;
    productAnalysis[key] = productAnalysis[key] || {qty:0, sales:0};
    productAnalysis[key].qty += Number(i.qty || 0);
    productAnalysis[key].sales += (Number(i.basePrice || 0) + Number(i.extraPrice || 0)) * Number(i.qty || 0);
  }); });
  var pa = Object.entries(productAnalysis).sort(function(a,b){ return b[1].sales - a[1].sales; });
  var paEl = document.getElementById('productAnalysis');
  if(paEl){
    paEl.innerHTML = pa.length ? pa.map(function(pair){ return '<div class="list-row"><div>' + escapeHtml(pair[0]) + '</div><strong>' + pair[1].qty + '份 / ' + money(pair[1].sales) + '</strong><span></span></div>'; }).join('') : '<div class="muted">尚無資料</div>';
  }

  var hourMap = {};
  orders.forEach(function(o){
    var h = new Date(o.createdAt).getHours();
    var key = String(h).padStart(2,'0') + ':00';
    hourMap[key] = hourMap[key] || {count:0, sales:0};
    hourMap[key].count += 1;
    hourMap[key].sales += Number(o.total || 0);
  });
  var ha = Object.entries(hourMap).sort(function(a,b){ return a[0].localeCompare(b[0]); });
  var hourEl = document.getElementById('hourAnalysis');
  if(hourEl){
    hourEl.innerHTML = ha.length ? ha.map(function(pair){ return '<div class="list-row"><div>' + pair[0] + '</div><strong>' + pair[1].count + '單 / ' + money(pair[1].sales) + '</strong><span></span></div>'; }).join('') : '<div class="muted">尚無資料</div>';
  }

  var sessionEl = document.getElementById('reportSessionList');
  if(sessionEl){
    sessionEl.innerHTML = getSessionListHtml(escapeHtml);
  }
}

function calcReportData(orders){
  var today = todayStr();
  var ordersToday = orders.filter(function(o){ return (o.createdAt || '').slice(0,10) === today; });
  var todaySales = ordersToday.reduce(function(s,o){ return s + Number(o.total || 0); }, 0);
  var seven = orders.filter(function(o){ return Date.now() - new Date(o.createdAt).getTime() <= 7*86400000; }).reduce(function(s,o){ return s + Number(o.total || 0); }, 0);
  var thirty = orders.filter(function(o){ return Date.now() - new Date(o.createdAt).getTime() <= 30*86400000; }).reduce(function(s,o){ return s + Number(o.total || 0); }, 0);

  var productMap = {};
  orders.forEach(function(o){ (o.items || []).forEach(function(i){
    productMap[i.name] = (productMap[i.name]||0) + Number(i.qty || 0);
  }); });
  var topProducts = Object.entries(productMap).sort(function(a,b){ return b[1]-a[1]; }).slice(0,10);

  var payMap = {};
  orders.forEach(function(o){
    var key = o.paymentMethod || '未設定';
    payMap[key] = (payMap[key]||0) + Number(o.total || 0);
  });

  var productAnalysis = {};
  orders.forEach(function(o){ (o.items || []).forEach(function(i){
    var key = i.name;
    productAnalysis[key] = productAnalysis[key] || {qty:0, sales:0};
    productAnalysis[key].qty += Number(i.qty || 0);
    productAnalysis[key].sales += (Number(i.basePrice || 0) + Number(i.extraPrice || 0)) * Number(i.qty || 0);
  }); });

  var hourMap = {};
  orders.forEach(function(o){
    var h = new Date(o.createdAt).getHours();
    var key = String(h).padStart(2,'0') + ':00';
    hourMap[key] = hourMap[key] || {count:0, sales:0};
    hourMap[key].count += 1;
    hourMap[key].sales += Number(o.total || 0);
  });

  return {
    todaySales: todaySales,
    todayCount: ordersToday.length,
    sevenSales: seven,
    thirtySales: thirty,
    topProducts: topProducts,
    payMap: payMap,
    productAnalysis: Object.entries(productAnalysis).sort(function(a,b){ return b[1].sales - a[1].sales; }),
    hourMap: Object.entries(hourMap).sort(function(a,b){ return a[0].localeCompare(b[0]); })
  };
}

function buildReportPrintHtml(flags){
  var orders = getReportOrders();
  var d = calcReportData(orders);
  var html = '<div style="font-family:sans-serif;max-width:700px;margin:0 auto;padding:20px">';
  html += '<h1 style="text-align:center;margin-bottom:20px">營業報表</h1>';

  if(flags.summary){
    html += '<h2>營業額摘要</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><td style="border:1px solid #ccc;padding:8px">今日營業額</td><td style="border:1px solid #ccc;padding:8px;text-align:right">' + money(d.todaySales) + '</td></tr>';
    html += '<tr><td style="border:1px solid #ccc;padding:8px">今日訂單數</td><td style="border:1px solid #ccc;padding:8px;text-align:right">' + d.todayCount + '</td></tr>';
    html += '<tr><td style="border:1px solid #ccc;padding:8px">近7日營業額</td><td style="border:1px solid #ccc;padding:8px;text-align:right">' + money(d.sevenSales) + '</td></tr>';
    html += '<tr><td style="border:1px solid #ccc;padding:8px">近30日營業額</td><td style="border:1px solid #ccc;padding:8px;text-align:right">' + money(d.thirtySales) + '</td></tr>';
    html += '</table>';
  }

  if(flags.topProducts){
    html += '<h2>熱銷商品 TOP 10</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><th style="border:1px solid #ccc;padding:6px;text-align:left">商品</th><th style="border:1px solid #ccc;padding:6px;text-align:right">數量</th></tr>';
    d.topProducts.forEach(function(pair){
      html += '<tr><td style="border:1px solid #ccc;padding:6px">' + escapeHtml(pair[0]) + '</td><td style="border:1px solid #ccc;padding:6px;text-align:right">' + pair[1] + ' 份</td></tr>';
    });
    html += '</table>';
  }

  if(flags.paymentStats){
    html += '<h2>付款方式統計</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><th style="border:1px solid #ccc;padding:6px;text-align:left">付款方式</th><th style="border:1px solid #ccc;padding:6px;text-align:right">金額</th></tr>';
    Object.entries(d.payMap).forEach(function(pair){
      html += '<tr><td style="border:1px solid #ccc;padding:6px">' + escapeHtml(pair[0]) + '</td><td style="border:1px solid #ccc;padding:6px;text-align:right">' + money(pair[1]) + '</td></tr>';
    });
    html += '</table>';
  }

  if(flags.productAnalysis){
    html += '<h2>商品販賣分析</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><th style="border:1px solid #ccc;padding:6px;text-align:left">商品</th><th style="border:1px solid #ccc;padding:6px;text-align:right">數量</th><th style="border:1px solid #ccc;padding:6px;text-align:right">營業額</th></tr>';
    d.productAnalysis.forEach(function(pair){
      html += '<tr><td style="border:1px solid #ccc;padding:6px">' + escapeHtml(pair[0]) + '</td><td style="border:1px solid #ccc;padding:6px;text-align:right">' + pair[1].qty + ' 份</td><td style="border:1px solid #ccc;padding:6px;text-align:right">' + money(pair[1].sales) + '</td></tr>';
    });
    html += '</table>';
  }

  if(flags.hourAnalysis){
    html += '<h2>時段販售狀況</h2>';
    html += '<table style="width:100%;border-collapse:collapse;margin-bottom:16px">';
    html += '<tr><th style="border:1px solid #ccc;padding:6px;text-align:left">時段</th><th style="border:1px solid #ccc;padding:6px;text-align:right">訂單數</th><th style="border:1px solid #ccc;padding:6px;text-align:right">營業額</th></tr>';
    d.hourMap.forEach(function(pair){
      html += '<tr><td style="border:1px solid #ccc;padding:6px">' + pair[0] + '</td><td style="border:1px solid #ccc;padding:6px;text-align:right">' + pair[1].count + ' 單</td><td style="border:1px solid #ccc;padding:6px;text-align:right">' + money(pair[1].sales) + '</td></tr>';
    });
    html += '</table>';
  }

  if(flags.sessionList){
    html += '<h2>開始／結束紀錄</h2>';
    html += '<div>' + getSessionListHtml(escapeHtml) + '</div>';
  }

  html += '</div>';
  return html;
}

function openReportPrintPreview(html){
  var modal = document.getElementById('printPreviewModal');
  var body = document.getElementById('printPreviewBody');
  if(!modal || !body) return;
  body.innerHTML = html;
  modal.classList.remove('hidden');

  document.getElementById('printPreviewPrintBtn').onclick = function(){
    var w = window.open('', '_blank');
    w.document.write('<html><head><title>列印報表</title></head><body>' + html + '</body></html>');
    w.document.close();
    w.print();
  };

  document.getElementById('printPreviewCloseBtn').onclick = function(){
    modal.classList.add('hidden');
  };

  document.getElementById('closePrintPreview').onclick = function(){
    modal.classList.add('hidden');
  };

  var backdrop = modal.querySelector('.modal-backdrop');
  if(backdrop){
    backdrop.onclick = function(){ modal.classList.add('hidden'); };
  }
}

export function initReportsPage(){
  document.getElementById('applyReportRangeBtn')?.addEventListener('click', function(){
    state.viewReportOrders = null;
    renderReports();
  });

  document.getElementById('reportBackLiveBtn')?.addEventListener('click', function(){
    var fromEl = document.getElementById('reportDateFrom');
    var toEl = document.getElementById('reportDateTo');
    if(fromEl) fromEl.value = '';
    if(toEl) toEl.value = '';
    state.viewReportOrders = null;
    renderReports();
  });

  document.getElementById('reportStartBtn')?.addEventListener('click', function(){
    startSession();
    persistAll();
    alert('已開始統計');
  });

  document.getElementById('reportEndBtn')?.addEventListener('click', function(){
    var session = endSession();
    persistAll();
    renderReports();
    if(session) alert('已結束統計：' + session.summary.orderCount + ' 單 / ' + session.summary.salesText);
    else alert('尚未開始統計');
  });

  document.getElementById('saveReportSnapshotBtn')?.addEventListener('click', function(){
    var orders = getReportOrders();
    saveCurrentSnapshot(orders);
    persistAll();
    alert('已儲存報表');
  });

  document.getElementById('exportTodayBtn')?.addEventListener('click', function(){
    var rows = [['訂單號','時間','狀態','類型','桌號','付款','總計']];
    state.orders
      .filter(function(o){ return (o.createdAt || '').slice(0,10) === todayStr(); })
      .forEach(function(o){ rows.push([
        o.orderNo || '',
        o.createdAt || '',
        o.status || '',
        o.orderType || '',
        o.tableNo || '',
        o.paymentMethod || '',
        o.total || 0
      ]); });
    downloadFile('today-report.csv', rows.map(function(r){ return r.join(','); }).join('\n'), 'text/csv');
  });

  var printReportBtn = document.getElementById('printReportBtn');
  var reportPrintModal = document.getElementById('reportPrintModal');

  if(printReportBtn && reportPrintModal){
    printReportBtn.addEventListener('click', function(){
      reportPrintModal.classList.remove('hidden');
    });

    document.getElementById('closeReportPrintModal').onclick = function(){
      reportPrintModal.classList.add('hidden');
    };
    document.getElementById('reportPrintCancelBtn').onclick = function(){
      reportPrintModal.classList.add('hidden');
    };

    var backdrop = reportPrintModal.querySelector('.modal-backdrop');
    if(backdrop){
      backdrop.onclick = function(){ reportPrintModal.classList.add('hidden'); };
    }

    document.getElementById('reportPrintConfirmBtn').onclick = function(){
      var flags = {
        summary: document.getElementById('rp_summary').checked,
        topProducts: document.getElementById('rp_topProducts').checked,
        paymentStats: document.getElementById('rp_paymentStats').checked,
        productAnalysis: document.getElementById('rp_productAnalysis').checked,
        hourAnalysis: document.getElementById('rp_hourAnalysis').checked,
        sessionList: document.getElementById('rp_sessionList').checked
      };
      var anyChecked = Object.values(flags).some(function(v){ return v; });
      if(!anyChecked){
        alert('請至少選擇一項報表');
        return;
      }
      reportPrintModal.classList.add('hidden');
      var html = buildReportPrintHtml(flags);
      openReportPrintPreview(html);
    };
  }
}
