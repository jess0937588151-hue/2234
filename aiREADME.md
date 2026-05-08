# POS 專案 AI 接手說明書

> 給每一個新接手的 AI：**動手前先讀完這份文件**，禁止憑記憶或猜測修改。所有改動完成後請更新「進度紀錄」段落。

---

## 一、專案組成

| 角色 | Repo | 部署/用途 |
|---|---|---|
| 網頁主程式 | https://github.com/jess0937588151-hue/2234 | 部署於 https://jess0937588151-hue.github.io/2234/ |
| Sunmi 列印橋接 APK | https://github.com/jess0937588151-hue/sunmi-pos-v2 | 純後台 HTTP Server，僅在 Sunmi T2 上安裝 |
| 舊版參考 | https://github.com/jess0937588151-hue/2332 | 已知可正常使用的版本，遇到回歸問題時對照 |
| 多店看板（規劃中） | 尚未建立 | 老闆用，跨店即時營業狀況 |

---

## 二、執行環境

**主裝置：Sunmi T2**
- Android 7.1.1（API 25）
- 2 GB RAM
- 80 mm 熱感紙
- 內建熱感印表機 + 錢箱
- 安裝 sunmi-pos-v2 APK（純後台列印橋接，無 WebView UI）
- 用 Chrome 直接開 https://jess0937588151-hue.github.io/2234/

**備援裝置：**
- iPad（Safari）— 主要看訂單與簡單操作，列印走系統列印對話框
- Windows 電腦（Chrome）— 完整功能，列印走系統列印對話框
- 其他 Android（未來可能安裝 2234 打包後的 APK）

**關鍵限制：**
- iPad/Safari 不支援 Web Bluetooth、WebUSB、Service Worker 部分行為
- Sunmi T2 Android 7.1.1 不支援部分新 API
- WebView 內 OAuth 被 Google 封鎖（disallowed_useragent）→ 因此採純後台架構
- Android 沒 console / Logcat 不易接：所有錯誤都必須寫到 LogManager 檔案 + HTTP /logs 端點，否則 AI 無法遠端排錯
- 使用者不寫程式：所有改動必須給「完整檔案內容 + 檔案路徑 + GitHub 編輯連結 + Commit message」，禁止只貼片段叫使用者插入

---

## 三、列印架構

網頁端 js/modules/print-bridge.js 依序嘗試三種橋接：
1. HTTP 127.0.0.1:8080（Sunmi T2 跑的 sunmi-pos-v2 APK，或未來打包的新 APK）
2. window.SunmiPrinter（舊 WebView 殼，已停用）
3. window.print()（iPad / PC）

關鍵設計原則：網頁端的偵測邏輯不認牌子、不認機型，只問「本機 127.0.0.1:8080 有沒有橋接服務在跑」。所以未來打包新 APK 時，網頁端不需要改。

---

## 四、HTTP Server API 規格

位址：http://127.0.0.1:8080（埠號可在 APK 設定頁修改）
綁定：強制只綁 127.0.0.1（loopback），外部裝置連不到
所有回應：{"ok": true/false, "data": ..., "error": "..."}
所有 Endpoint 必含 CORS header（Allow-Origin: *）
驗證：所有 /print/*、/drawer/open、/logs 需 header X-API-Token，token 首次啟動時隨機生成

| Method | Path | 用途 |
|---|---|---|
| GET | /ping | 心跳，回 version、印表機連線狀態、paperOut/coverOpen/overheat、lastPrintAt/lastPrintOk、token、printerReady |
| GET | /printer/status | 詳細印表機狀態 |
| GET | /logs?date=YYYY-MM-DD&lines=200 | 查看當日日誌 |
| GET | /test | 內建測試列印頁 |
| POST | /print/sunmi | Sunmi 內建列印 |
| POST | /print/bluetooth | 藍牙 ESC/POS 列印 |
| POST | /print/network | 網路 ESC/POS 列印 |
| POST | /drawer/open | 開錢箱（優先順序：Sunmi > 藍牙 > 網路） |

POST body 範例：
```json
{
  "payload": { "shopName":"...", "items":[...], "total":100, "mode":"receipt", "fields":{ "storeName":true, "total":true } },
  "openDrawer": false
}
