/* ============================================================
   js/modules/print-bridge.js
   列印橋接偵測 + 路由
   ─────────────────────────────────────────────────────────
   依序嘗試三種橋接：
     1. HTTP 127.0.0.1:8080  （Sunmi T2 + sunmi-pos-v2 APK，或未來 2234 打包後的 APK）
     2. window.SunmiPrinter   （舊 WebView Bridge，已停用，保留向下相容）
     3. window.print()        （iPad / PC 系統列印對話框）

   結果快取 8 秒，避免每個按鈕都重 fetch
   ============================================================ */

// ── 設定 ──
const HTTP_HOST = '127.0.0.1';
const HTTP_PORT = 8080;
const HTTP_BASE = `http://${HTTP_HOST}:${HTTP_PORT}`;
const PING_TIMEOUT_MS = 800;
const CACHE_TTL_MS = 8000;

// ── 快取 ──
let _cache = null;        // { mode, sunmi, bluetooth, network, version, timestamp }
let _detecting = null;    // Promise 防止同時多次偵測

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
 *   sunmi/bluetooth/network: boolean | null（null 表示此模式下不適用）
 */
export async function detectPrinters(force = false) {
  // 用快取
  if (!force && _cache && (Date.now() - _cache.timestamp) < CACHE_TTL_MS) {
    return _cache;
  }
  // 防止同時多次偵測
  if (_detecting) return _detecting;

  _detecting = (async () => {
    let result;

    // 1. HTTP 橋接
    try {
      const resp = await fetchWithTimeout(`${HTTP_BASE}/ping`, { method: 'GET' }, PING_TIMEOUT_MS);
      if (resp.ok) {
        const j = await resp.json();
        const data = j.data || j;
        result = {
          mode: 'http',
          sunmi: !!data.sunmi,
          bluetooth: !!data.bluetooth,
          network: !!data.network,
          version: data.version || '',
          error: ''
        };
      }
    } catch (e) {
      // HTTP 連不到，往下試
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
      } catch (e) {
        // ignore
      }
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
 * 同步取目前快取（給 print-service.js 路由判斷用，不阻塞列印）
 * 第一次呼叫前若沒偵測過會回 null
 */
export function getCachedDetect() {
  return _cache;
}

/**
 * 清除快取（按鈕「重新偵測」使用）
 */
export function clearDetectCache() {
  _cache = null;
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
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body || {})
    }, 5000);
    const j = await resp.json();
    return { ok: !!j.ok, error: j.error || '' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/**
 * 透過 HTTP API 開錢箱
 */
export async function httpOpenDrawer() {
  try {
    const resp = await fetchWithTimeout(`${HTTP_BASE}/drawer/open`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}'
    }, 3000);
    const j = await resp.json();
    return { ok: !!j.ok, error: j.error || '' };
  } catch (e) {
    return { ok: false, error: String(e && e.message || e) };
  }
}

/**
 * 系統列印對話框（iPad / PC fallback）
 * 接受完整 HTML，建立隱藏 iframe 後呼叫 window.print()
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
    setTimeout(fire, 600);  // 某些 WebView 不觸發 onload
  });
}

/**
 * 取目前的 HTTP 橋接位址（給設定頁顯示用）
 */
export function getBridgeInfo() {
  return { host: HTTP_HOST, port: HTTP_PORT, base: HTTP_BASE };
}
