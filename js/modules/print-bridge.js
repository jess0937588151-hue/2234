/* ============================================================
   js/modules/print-bridge.js  v2026-05-07b
   列印橋接偵測 + 路由
   ─────────────────────────────────────────────────────────
   依序嘗試三種橋接：
     1. HTTP 127.0.0.1:8080  （Sunmi T2 + sunmi-pos-v2 APK）
     2. window.SunmiPrinter   （舊 WebView Bridge，向下相容）
     3. window.print()        （iPad / PC 系統列印對話框）

   v2026-05-07b 變更：
     - 修正：偵測時讀取 sunmiConnected/bluetoothConnected/networkConnected
     - 新增：自動從 APK /ping 取得 X-API-Token（無需手動操作）
            機制：先試「無 token」打 /ping → 若回 unauthorized
                  則代表已啟用 token；改用內建已知端點查詢取得（見下）
            若 APK 提供「公開取 token 端點」(/ping 不需 token，回應內含
            apiToken 欄位則直接讀取)，自動存入 localStorage
     - 新增：所有 /print/* 與 /drawer/open 都帶 X-API-Token
     - 新增：getLastError() 方便除錯
   ============================================================ */


// ── 設定 ──
const HTTP_HOST = '127.0.0.1';
const HTTP_PORT = 8080;
const HTTP_BASE = `http://${HTTP_HOST}:${HTTP_PORT}`;
const PING_TIMEOUT_MS = 1500;
const CACHE_TTL_MS = 8000;
const TOKEN_STORAGE_KEY = 'pos_apk_api_token';

// ── 快取 ──
let _cache = null;
let _detecting = null;
let _lastError = '';

function getToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY) || ''; }
  catch(e) { return ''; }
}

export function setApiToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, String(token));
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
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
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(url, opts)
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * 嘗試從 APK 自動取得 token
 * APK /ping 雖然不需 token，但 v20260603 不會回 token 本身
 * 解法：透過 /test 頁 (HTML 內含 token) 解析出來
 */
async function tryAutoFetchToken() {
  try {
    const resp = await fetchWithTimeout(`${HTTP_BASE}/test`, { method: 'GET' }, 2000);
    if (!resp || !resp.ok) return '';
    const html = await resp.text();
    // /test 頁面的 JS 區塊有 var TOKEN='xxxx';
    const m = html.match(/var\s+TOKEN\s*=\s*'([^']*)'/);
    if (m && m[1]) {
      setApiToken(m[1]);
      return m[1];
    }
  } catch (e) {
    _lastError = 'auto-fetch token failed: ' + (e && e.message || e);
  }
  return '';
}

/**
 * 偵測列印橋接環境
 */
export async function detectPrinters(force = false) {
  if (!force && _cache && (Date.now() - _cache.timestamp) < CACHE_TTL_MS) {
    return _cache;
  }
  if (_detecting) return _detecting;

  _detecting = (async () => {
    let result;

    // 1. HTTP 橋接（APK）
    try {
      const resp = await fetchWithTimeout(`${HTTP_BASE}/ping`, { method: 'GET' }, PING_TIMEOUT_MS);
      if (resp && resp.ok) {
        const j = await resp.json();
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

        // 若沒 token，順便去 /test 抓一下
        if (!getToken()) {
          await tryAutoFetchToken();
        }
      }
    } catch (e) {
      _lastError = 'detect http failed: ' + (e && e.message || e);
    }

    // 2. WebView Bridge（舊架構）
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
      } catch (e) {}
    }

    // 3. 瀏覽器（iPad / PC）
    if (!result) {
      result = {
        mode: 'browser',
        sunmi: null,
        bluetooth: null,
        network: null,
        version: '',
        error: ''
      };
    }

    result.timestamp = Date.now();
    _cache = result;
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
  try {
    const jsonStr = JSON.stringify(body || {});
    // 用 Blob 包成 text/plain，避免 NanoHTTPD 對 application/json 走 parseBody 砍掉中文
    const blob = new Blob([jsonStr], { type: 'text/plain;charset=utf-8' });
    const resp = await fetchWithTimeout(`${HTTP_BASE}/print/${target}`, {
      method: 'POST',
      headers: buildHeaders(),
      body: blob
    }, 8000);
    const j = await resp.json();
    if (!j.ok) _lastError = 'httpPrint ' + target + ' failed: ' + (j.error || 'unknown');
    return { ok: !!j.ok, error: j.error || '' };
  } catch (e) {
    const msg = String(e && e.message || e);
    _lastError = 'httpPrint ' + target + ' exception: ' + msg;
    return { ok: false, error: msg };
  }
}





export async function httpOpenDrawer() {
  try {
    const resp = await fetchWithTimeout(`${HTTP_BASE}/drawer/open`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: '{}'
    }, 5000);
    const j = await resp.json();
    if (!j.ok) _lastError = 'httpOpenDrawer failed: ' + (j.error || 'unknown');
    return { ok: !!j.ok, error: j.error || '' };
  } catch (e) {
    const msg = String(e && e.message || e);
    _lastError = 'httpOpenDrawer exception: ' + msg;
    return { ok: false, error: msg };
  }
}

export function browserPrintHtml(html) {
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
