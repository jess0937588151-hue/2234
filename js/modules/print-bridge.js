/* ============================================================
   js/modules/print-bridge.js  v2026-05-07-debug
   列印橋接偵測 + 路由（純加 log，零邏輯變更）
   ============================================================ */

const HTTP_HOST = '127.0.0.1';
const HTTP_PORT = 8080;
const HTTP_BASE = `http://${HTTP_HOST}:${HTTP_PORT}`;
const PING_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 8000;
const TOKEN_STORAGE_KEY = 'pos_apk_api_token';

let _cache = null;
let _detecting = null;
let _lastError = '';

// ── 螢幕浮動 log 框 ──
if (typeof window !== 'undefined') {
  window.__printLog = window.__printLog || [];
}

function logBox() {
  if (typeof document === 'undefined') return null;
  let box = document.getElementById('__printLogBox');
  if (box) return box;
  box = document.createElement('div');
  box.id = '__printLogBox';
  box.style.cssText = [
    'position:fixed','top:8px','right:8px','width:360px','max-height:60vh',
    'overflow:auto','background:#ff8c00','color:#fff','font:11px/1.4 monospace',
    'padding:6px 8px','border:2px solid #b35c00','border-radius:6px',
    'z-index:2147483647','box-shadow:0 2px 8px rgba(0,0,0,.3)',
    'white-space:pre-wrap','word-break:break-all'
  ].join(';');
  const close = document.createElement('div');
  close.textContent = '✕';
  close.style.cssText = 'position:absolute;top:2px;right:6px;cursor:pointer;font-weight:700;font-size:14px';
  close.onclick = () => { box.style.display = 'none'; };
  const title = document.createElement('div');
  title.textContent = '[print-bridge log]';
  title.style.cssText = 'font-weight:700;margin-bottom:4px';
  const body = document.createElement('div');
  body.id = '__printLogBody';
  box.appendChild(close);
  box.appendChild(title);
  box.appendChild(body);
  document.body.appendChild(box);
  return box;
}

function plog(msg) {
  const ts = new Date().toISOString().slice(11, 23);
  const line = '[' + ts + '] ' + msg;
  try { console.log('[print-bridge]', msg); } catch(e) {}
  try {
    if (typeof window !== 'undefined') {
      if (!window.__printLog) window.__printLog = [];
      window.__printLog.push(line);
      if (window.__printLog.length > 200) window.__printLog.shift();
    }
  } catch(e) {}
  try {
    const box = logBox();
    if (!box) return;
    box.style.display = 'block';
    const body = document.getElementById('__printLogBody');
    if (!body) return;
    const div = document.createElement('div');
    div.textContent = line;
    body.appendChild(div);
    while (body.childNodes.length > 30) body.removeChild(body.firstChild);
    box.scrollTop = box.scrollHeight;
  } catch(e) {}
}

function getToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY) || ''; }
  catch(e) { return ''; }
}

export function setApiToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, String(token));
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
    plog('setApiToken len=' + (token ? String(token).length : 0));
  } catch(e) {}
}

export function getApiToken() {
  return getToken();
}

export function getLastError() {
  return _lastError;
}

function fetchWithTimeout(url, opts, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout ' + ms + 'ms')), ms);
    fetch(url, opts)
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

async function tryAutoFetchToken() {
  try {
    plog('tryAutoFetchToken: GET /test');
    const resp = await fetchWithTimeout(`${HTTP_BASE}/test`, { method: 'GET' }, 2000);
    plog('tryAutoFetchToken: status=' + (resp ? resp.status : 'null'));
    if (!resp || !resp.ok) return '';
    const html = await resp.text();
    const m = html.match(/var\s+TOKEN\s*=\s*'([^']*)'/);
    if (m && m[1]) {
      setApiToken(m[1]);
      plog('tryAutoFetchToken: got token len=' + m[1].length);
      return m[1];
    }
    plog('tryAutoFetchToken: token not found in /test html');
  } catch (e) {
    _lastError = 'auto-fetch token failed: ' + (e && e.message || e);
    plog('tryAutoFetchToken EXCEPTION: ' + _lastError);
  }
  return '';
}

export async function detectPrinters(force = false) {
  if (!force && _cache && (Date.now() - _cache.timestamp) < CACHE_TTL_MS) {
    plog('detectPrinters: cache hit mode=' + _cache.mode);
    return _cache;
  }
  if (_detecting) {
    plog('detectPrinters: already running, awaiting');
    return _detecting;
  }

  _detecting = (async () => {
    plog('detectPrinters: START force=' + force + ' url=' + HTTP_BASE + '/ping');
    let result;

    try {
      const t0 = Date.now();
      const resp = await fetchWithTimeout(`${HTTP_BASE}/ping`, { method: 'GET' }, PING_TIMEOUT_MS);
      const dt = Date.now() - t0;
      plog('detectPrinters: /ping status=' + (resp ? resp.status : 'null') + ' time=' + dt + 'ms');
      if (resp && resp.ok) {
        const text = await resp.text();
        plog('detectPrinters: /ping body=' + text.slice(0, 200));
        let j = {};
        try { j = JSON.parse(text); } catch(e) { plog('detectPrinters: JSON.parse failed'); }
        const data = (j && j.data) ? j.data : (j || {});
        result = {
          mode: 'http',
          sunmi: !!(data.sunmiConnected || data.sunmi),
          bluetooth: !!(data.bluetoothConnected || data.bluetooth),
          network: !!(data.networkConnected || data.network),
          paperOut: !!data.paperOut,
          coverOpen: !!data.coverOpen,
          overheat: !!data.overheat,
          version: data.version || '',
          error: ''
        };
        plog('detectPrinters: HTTP OK mode=http sunmi=' + result.sunmi
          + ' bt=' + result.bluetooth + ' net=' + result.network
          + ' ver=' + result.version);

        if (!getToken()) {
          plog('detectPrinters: no token in storage, try auto fetch');
          await tryAutoFetchToken();
        }
      }
    } catch (e) {
      _lastError = 'detect http failed: ' + (e && e.message || e);
      plog('detectPrinters EXCEPTION: ' + _lastError);
    }

    if (!result && typeof window !== 'undefined' && window.SunmiPrinter
        && typeof window.SunmiPrinter.isPrinterReady === 'function') {
      try {
        result = {
          mode: 'webview',
          sunmi: !!window.SunmiPrinter.isPrinterReady(),
          bluetooth: typeof window.SunmiPrinter.isBtPrinterConnected === 'function'
                       ? !!window.SunmiPrinter.isBtPrinterConnected() : false,
          network: typeof window.SunmiPrinter.isNetPrinterConnected === 'function'
                       ? !!window.SunmiPrinter.isNetPrinterConnected() : false,
          version: 'webview',
          error: ''
        };
        plog('detectPrinters: WebView mode sunmi=' + result.sunmi);
      } catch (e) {
        plog('detectPrinters webview EXCEPTION: ' + (e && e.message || e));
      }
    }

    if (!result) {
      result = {
        mode: 'browser',
        sunmi: null,
        bluetooth: null,
        network: null,
        version: '',
        error: ''
      };
      plog('detectPrinters: fallback to BROWSER mode (HTTP/WebView 都失敗)');
    }

    result.timestamp = Date.now();
    _cache = result;
    plog('detectPrinters: DONE final mode=' + result.mode);
    return result;
  })();

  try {
    return await _detecting;
  } finally {
    _detecting = null;
  }
}

export function getCachedDetect() {
  return _cache;
}

export function clearDetectCache() {
  _cache = null;
}

function buildHeaders(extra) {
  const h = Object.assign({}, extra || {});
  const tk = getToken();
  if (tk) h['X-API-Token'] = tk;
  return h;
}

export async function httpPrint(target, body) {
  const jsonStr = JSON.stringify(body || {});
  const utf8Bytes = new TextEncoder().encode(jsonStr);
  __bridgeLog('httpPrint → ' + target + ' url=' + HTTP_BASE + '/print/' + target + ' bodyLen=' + utf8Bytes.length);
  __bridgeLog('httpPrint body head=' + jsonStr.slice(0, 200));
  __bridgeLog('httpPrint hasToken=' + (getApiToken() ? 'yes' : 'no'));

  const t0 = Date.now();
  let respText = '';
  try {
    const resp = await fetchWithTimeout(`${HTTP_BASE}/print/${target}`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/octet-stream' }),
      body: utf8Bytes
    }, 8000);
    const dt = Date.now() - t0;
    __bridgeLog('httpPrint ← ' + target + ' status=' + resp.status + ' time=' + dt + 'ms');
    respText = await resp.text();
    __bridgeLog('httpPrint resp=' + respText.slice(0, 200));
    let j = {};
    try { j = JSON.parse(respText); } catch(e) {}
    if (!j.ok) _lastError = 'httpPrint ' + target + ' failed: ' + (j.error || respText || 'unknown');
    return { ok: !!j.ok, error: j.error || '' };
  } catch (e) {
    const msg = String(e && e.message || e);
    __bridgeLog('httpPrint EXC ' + target + ' ' + msg);
    _lastError = 'httpPrint ' + target + ' exception: ' + msg;
    return { ok: false, error: msg };
  }
}


export async function httpOpenDrawer() {
  try {
    const url = `${HTTP_BASE}/drawer/open`;
    plog('httpOpenDrawer → url=' + url);
    plog('httpOpenDrawer hasToken=' + (getToken() ? 'yes' : 'no'));
    const t0 = Date.now();
    const resp = await fetchWithTimeout(url, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: '{}'
    }, 5000);
    const dt = Date.now() - t0;
    const text = await resp.text();
    plog('httpOpenDrawer ← status=' + resp.status + ' time=' + dt + 'ms');
    plog('httpOpenDrawer resp=' + text.slice(0, 200));
    let j = {};
    try { j = JSON.parse(text); } catch(e) {}
    if (!j.ok) _lastError = 'httpOpenDrawer failed: ' + (j.error || text || 'unknown');
    return { ok: !!j.ok, error: j.error || '' };
  } catch (e) {
    const msg = String(e && e.message || e);
    _lastError = 'httpOpenDrawer exception: ' + msg;
    plog('httpOpenDrawer EXCEPTION: ' + msg);
    return { ok: false, error: msg };
  }
}

export function browserPrintHtml(html) {
  plog('browserPrintHtml: fallback to system print dialog');
  return new Promise(resolve => {
    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed;right:0;bottom:0;width:0;height:0;border:0';
    document.body.appendChild(iframe);
    const doc = iframe.contentDocument || iframe.contentWindow.document;
    doc.open(); doc.write(html); doc.close();

    const fire = () => {
      try { iframe.contentWindow.focus(); iframe.contentWindow.print(); }
      catch(e) { console.warn('browserPrint failed:', e); }
      setTimeout(() => {
        try { document.body.removeChild(iframe); } catch(e){}
        resolve(true);
      }, 1500);
    };
    iframe.onload = fire;
    setTimeout(fire, 600);
  });
}

export function getBridgeInfo() {
  return { host: HTTP_HOST, port: HTTP_PORT, base: HTTP_BASE, hasToken: !!getToken() };
}
