/* ============================================================
   js/modules/print-bridge.js  v2026-05-07
   列印橋接偵測 + 路由
   ─────────────────────────────────────────────────────────
   依序嘗試三種橋接：
     1. HTTP 127.0.0.1:8080  （Sunmi T2 + sunmi-pos-v2 APK）
     2. window.SunmiPrinter   （舊 WebView Bridge，向下相容）
     3. window.print()        （iPad / PC 系統列印對話框）

   v2026-05-07 變更：
     - 修正：偵測時讀取 sunmiConnected/bluetoothConnected/networkConnected（APK 實際欄位）
     - 新增：自動取得並快取 X-API-Token（從 /ping 第一次連線後存到 localStorage）
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
let _cache = null;        // { mode, sunmi, bluetooth, network, version, timestamp }
let _detecting = null;    // Promise 防止同時多次偵測
let _lastError = '';      // 最後一次錯誤訊息（除錯用）

/**
 * 取目前 token（先讀 localStorage，沒值才回空字串）
 */
function getToken() {
  try { return localStorage.getItem(TOKEN_STORAGE_KEY) || ''; }
  catch(e) { return ''; }
}

/**
 * 設定 token（寫入 localStorage）
 */
export function setApiToken(token) {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, String(token));
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch(e) {}
}

/**
 * 取得目前儲存的 token（給設定頁顯示用）
 */
export function getApiToken() {
  return getToken();
}

/**
 * 取最後一次錯誤訊息（給除錯用）
 */
export function getLastError() {
  return _lastError;
}

/**
 * 用 timeout 包 fetch（NanoHTTPD 沒有 AbortController 也能跑）
 */
function fetchWithTimeout(url, opts, ms) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout')), ms);
    fetch(url, opts)
      .then(r => { clearTimeout(timer); resolve(r); })
      .catch(e => { clearTimeout(timer); reject(e); });
  });
}

/**
 * 偵測列印橋接環境
 * 回傳 { mode, sunmi, bluetooth, network, version, error }
 *   mode: 'http' | 'webview' | 'browser'
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
        // ★ 修正：APK 實際欄位是 sunmiConnected / bluetoothConnected / networkConnected
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
      }
    } catch (e) {
      _lastError = 'detect http failed: ' + (e && e.message || e);
    }

    // 2. WebView Bridge（舊架構，保留向下相容）
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

/**
 * 同步取目前快取
 */
export function getCachedDetect() {
  return _cache;
}

/**
 * 清除快取
 */
export function clearDetectCache() {
  _cache = null;
}

/**
 * 組裝帶 token 的 headers
 */
function buildHeaders(extra) {
  const h = Object.assign({}, extra || {});
  const tk = getToken();
  if (tk) h['X-API-Token'] = tk;
  return h;
}

/**
 * 透過 HTTP API 列印
 * @param {'sunmi'|'bluetooth'|'network'} target
 * @param {Object} body POST body
 * @returns {Promise<{ok:boolean,error?:string}>}
 */
export async function httpPrint(target, body) {
  try {
    const resp = await fetchWithTimeout(`${HTTP_BASE}/print/${target}`, {
      method: 'POST',
      headers: buildHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body || {})
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

/**
 * 透過 HTTP API 開錢箱
 */
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

/**
 * 系統列印對話框（iPad / PC fallback）
 */
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

/**
 * 取目前的 HTTP 橋接位址（給設定頁顯示用）
 */
export function getBridgeInfo() {
  return { host: HTTP_HOST, port: HTTP_PORT, base: HTTP_BASE, hasToken: !!getToken() };
}
