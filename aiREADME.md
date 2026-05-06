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
- **Android 沒 console / Logcat 不易接**：所有錯誤都必須寫到 LogManager 檔案 + HTTP /logs 端點，否則 AI 無法遠端排錯

---

## 三、列印架構（重要）

Copy
Copy        ┌─────────────────────────────────────┐
        │        2234 網頁（瀏覽器）          │
        │   js/modules/print-bridge.js        │
        │   依序嘗試 3 種橋接：               │
        │     1. HTTP 127.0.0.1:8080  (T2/未來新APK)│
        │     2. window.SunmiPrinter   (舊 WebView 殼，已停用) │
        │     3. window.print()        (iPad/PC)│
        └─────────────────────────────────────┘
                      │
   ┌──────────────────┼──────────────────┐
   ▼                  ▼                  ▼
Sunmi T2: iPad/PC: 未來 2234 打包 APK: HTTP API 系統列印對話框 本機 HTTP Server ↓ ↓ sunmi-pos-v2 APK 市售出單機模組（未做） ├ Sunmi 內建（AIDL） ├ 藍牙 ESC/POS ├ 藍牙 ESC/POS ├ 網路 ESC/POS (TCP 9100) └ 網路 ESC/POS (TCP 9100) └ USB ESC/POS (USB Host)

Copy
**關鍵設計原則：網頁端的偵測邏輯不認牌子、不認機型，只問「本機 127.0.0.1:8080 有沒有橋接服務在跑」。** 所以未來打包新 APK 時，網頁端不需要改，新 APK 自動會被網頁的偵測辨認到。

---

## 四、HTTP Server API 規格（sunmi-pos-v2 已實作；未來新 APK 必須遵守相同規格）

**位址：** `http://127.0.0.1:8080`（埠號可在 APK 設定頁修改）
**綁定：** **強制只綁 127.0.0.1（loopback）**，外部裝置連不到，避免同 Wi-Fi 任何人都能呼叫列印
**所有回應：** `{"ok": true/false, "data": ..., "error": "..."}`
**所有 Endpoint 必含 CORS header**（Allow-Origin: \*，因為部署位置可能變動，例如私人 NAS）
**驗證：** 所有 `/print/*`、`/drawer/open`、`/logs` 需 header `X-API-Token: <AppSettings.apiToken>`，token 首次啟動時隨機生成，使用者在網頁端設定一次

| Method | Path | 用途 |
|---|---|---|
| GET | `/ping` | 心跳，回 version、三種印表機連線狀態、paperOut、coverOpen、overheat、lastPrintAt、lastPrintOk |
| GET | `/printer/status` | 詳細印表機狀態 |
| GET | `/logs?date=YYYY-MM-DD&lines=200` | 查看當日日誌（給 AI 遠端排錯用） |
| GET | `/test` | 內建測試列印頁（assets/test-print.html） |
| POST | `/print/sunmi` | Sunmi 內建列印 |
| POST | `/print/bluetooth` | 藍牙 ESC/POS 列印 |
| POST | `/print/network` | 網路 ESC/POS 列印 |
| POST | `/drawer/open` | 開錢箱（依優先順序：Sunmi > 藍牙 > 網路） |

POST body 範例：
```json
{
  "payload": { "shopName":"...", "items":[...], "total":100, "mode":"receipt" },
  "openDrawer": false
}
五、進度紀錄
✅ 已完成
第一階段：APK 重構（v2.0 → v2.1）
 APK 重構為純後台 HTTP Server 架構（NanoHTTPD on 127.0.0.1）
 APK PrintHttpServer.java line 57 OPTIONS preflight 編譯錯誤已修
 APK 三種印表機 Manager 完成（Sunmi/藍牙/網路），可獨立連線、列印、開錢箱
 設定頁三欄勾選矩陣（receipt/kitchen/label 各自勾選欄位）
 reports-page.js 報表匯出改用 overlay 顯示 CSV（Sunmi T2 WebView 限制）
第二階段：網頁端 ↔ APK 橋接（v20260601）
 新增 js/modules/print-bridge.js（三層橋接偵測：HTTP / WebView / window.print）
 改寫 js/modules/print-service.js（列印路由走 bridge，移除重複的 browserPrintHtml，printSessionReportViaBridge 改用 bridgeBrowserPrint）
 改寫 js/pages/settings-page.js（三區塊偵測改走 bridge，iPad/PC 顯示「系統列印模式」）
 D9 線上訂單自動列印（接單時自動印廚房 + 顧客單，由 autoPrintKitchenOnConfirm / autoPrintReceiptOnConfirm 控制）
 D10 預約 30 分鐘前自動提醒列印（startReservationReminderLoop 每 60 秒檢查，到時間彈 overlay 提示）
第三階段：v20260602 列印優化
 sunmiPrintReceiptByFont 結尾留白縮為 1 行（原本 2 行）
 sunmiPrintReceiptByFont 分隔線長度動態計算（依紙寬 58/70/80mm × 字體大小）
 buildPlainTextFromOrder 修掉 baseSize ReferenceError、純依紙寬計算分隔線、結尾留白縮為 1 行
 pos-page.js finalizeOrder 修掉多餘的 }，列印區塊正確包在函式內
 pos-page.js 開錢箱改用 openCashDrawer().catch(e=>...) async 寫法
 APK SunmiPrinterManager.feedAndCut() lineWrap(4) → lineWrap(1)
 APK SunmiPrinterManager.cutPaper() 兩處 lineWrap(3) → lineWrap(1)
 APK SunmiPrinterManager.printPosReceipt() 改成 if (data.optBoolean("openDrawer", false)) openCashDrawer(); 條件開錢箱
 index.html Sunmi、藍牙 modal 加測試列印按鈕
 index.html <title> 改為「餐廳 POS V20260602 列印橋接版」
 service-worker.js CACHE_NAME 升版為 pos-v20260602-cache
🔧 進行中（v20260603 APK 商用化補強）
使用者已確認施工項目：1、3、4、5、6、7、8、9、11、12、14。不做：2、10、13。 關鍵需求：因 Android 沒 console，所有改動都必須整合 LogManager 寫日誌，否則出問題 AI 無法遠端排錯。

第一輪（地基，先做這個）

 項目 14：LogManager.java（新檔） — 全 APK 共用日誌中心

寫到 /sdcard/Android/data/com.pos.sunmiprinter/files/logs/app-YYYY-MM-DD.txt
每天一檔，保留 7 天自動清理
分級：d / i / w / e（e 等級額外存 errors.txt）
記憶體環形緩衝最近 200 筆給 /logs 端點與 MainActivity 用
APK 啟動寫一筆「APK 啟動 v2.x.x」對時
 項目 1：PrintHttpServer 強制綁 127.0.0.1

建構子改 super("127.0.0.1", port);
外部 Wi-Fi 裝置連不到，避免亂印 / 亂開錢箱
 項目 4：印表機狀態回報強化

SunmiPrinterManager.getPrinterStatus() 改回傳 PrinterStatusInfo{connected, paperOut, coverOpen, overheat, raw}
/ping 回應加 paperOut/coverOpen/overheat/lastPrintAt/lastPrintOk/apkVersion
print-bridge.js 偵測結果帶這些欄位
settings-page.js 印表機狀態列顯示紅字警示「⚠ 缺紙 / ⚠ 蓋未關 / ❌ 上次列印失敗」
自動列印（D9/D10）失敗時必須能讓使用者立刻發現
第二輪（穩定性）

 項目 3：Foreground Service 常駐通知

PrintService.onCreate() 建立 NotificationChannel（API 26+ 判斷）
startForeground(1, notification) 顯示「列印橋接服務運作中・埠 8080」
防止系統殺進程
AndroidManifest.xml service 加 android:foregroundServiceType="dataSync"
 項目 5：PrintQueue.java（新檔）

ExecutorService.newSingleThreadExecutor() 序列化所有列印任務
防止同一秒收到多張線上單時搶印表機
三個 Manager 的列印呼叫全部包進 PrintQueue.submit()
 項目 6：列印失敗自動重試 + 失敗紀錄

現有 retry() 已 3 次重試，補上失敗時 LogManager.e + 更新 AppSettings.lastPrintError
列印成功更新 lastPrintAt / lastPrintOk
SettingsActivity 顯示「最後列印狀態」區塊
 項目 7：開機自動啟動補強

MainActivity.onCreate() 也呼叫 ContextCompat.startForegroundService(...)
不再只依賴 BootReceiver
老闆只要點一次 APK 圖示就會啟動
 項目 8：MainActivity 健康檢查頁

畫面分四區：APK 版本＋Server 狀態 / 三台印表機狀態（每 3 秒刷新） / 最近 10 筆錯誤日誌 / 四個按鈕（測試列印、重啟服務、查看完整日誌、設定）
老闆截圖傳給 AI 就能看出問題
第三輪（錦上添花）

 項目 9：API Token 驗證

AppSettings 加 apiToken 欄位（首次啟動隨機生成 32 字元）
所有 /print/*、/drawer/open、/logs endpoint 檢查 header X-API-Token
SettingsActivity 顯示 / 重新生成 token 按鈕
網頁端 settings-page.js 加 token 輸入框
print-bridge.js fetch 帶 X-API-Token header
 項目 11：APK 內建測試列印頁

assets/test-print.html（新檔）
PrintHttpServer 加 GET /test 端點服務這個 HTML
老闆在 Sunmi T2 Chrome 開 http://127.0.0.1:8080/test 就能驗證列印
 項目 12：自動更新檢查

UpdateChecker.java（新檔）
啟動時打 https://api.github.com/repos/jess0937588151-hue/sunmi-pos-v2/releases/latest
比對 BuildConfig.VERSION_NAME，發現新版本在 MainActivity 顯示「有新版可下載」
📋 待辦（短期，下幾輪要處理）
優先	項目	影響範圍	細節
中	Google 登入失敗（Drive + Firebase）	網頁或 APK	WebView 顯示 disallowed_useragent；解法二選一：APK 用 Custom Tabs 跳外部瀏覽器 OAuth、或網頁端改 Firebase Email + 固定密碼登入
🔮 待辦（長期，未來規劃）
A. 2234 打包成獨立 APK（含市售印表機列印模組）
目的： 讓非 Sunmi 的 Android 裝置也能完整使用本系統，連硬體出單機。

規格（給以後做的 AI）：

WebView 載入 https://jess0937588151-hue.github.io/2234/（或內嵌離線版）
同時 跑後台 NanoHTTPD on 127.0.0.1:8080，協定與 sunmi-pos-v2 完全相同
列印模組需含三類市售出單機：
藍牙 ESC/POS：列出已配對裝置 / 連線 / 測試列印（搬 sunmi-pos-v2/BluetoothPrinterManager.java）
網路 ESC/POS：手動輸 IP:9100 或掃描區網 / 連線測試（搬 sunmi-pos-v2/NetworkPrinterManager.java）
USB ESC/POS：UsbManager 列出裝置 / 要求權限 / BulkTransfer 送 ESC/POS（新增 UsbPrinterManager.java）
不含 Sunmi 內建（因為這個 APK 不限定跑在 Sunmi）
設定頁 UI 與目前 sunmi-pos-v2/SettingsActivity.java 一致
WebView 內 Google 登入需用 Custom Tabs 跳外部瀏覽器
WebView 需設 DownloadListener 處理 CSV/Excel 下載
需處理 USB Host 權限、藍牙權限（API 25 與 API 31+ 不同）
LogManager / API Token / 健康檢查頁等 sunmi-pos-v2 已有的商用化機制全部沿用
Android 平台已知限制（不要嘗試突破）：

不可能整合 HP/Epson/Canon 的 Windows 私有驅動（Android 無對等驅動概念）
非 ESC/POS 印表機（A4 雷射/噴墨）只能透過 Mopria/IPP，列印品質與功能受限
B. 多店即時營業看板網站
老闆用，輸入店家代碼 / 帳號可看多家店即時班次狀況
資料源：Firebase（每店上傳當日 sales/count/sessions）
可放 2234 同 repo 的 dashboard.html 或獨立新 repo（待決定）
需要 Firebase 登入機制（與主 POS 同一個 project 或新建）
C. POS 新功能 / 流程改善（可待用戶提出時補充）
（這個段落留給未來補充）
六、關鍵檔案地圖
網頁（jess0937588151-hue/2234）
Copyindex.html                          主頁面 + 各 view 區塊（含 reservationReminderOverlay）
js/app.js                           入口、初始化、Service Worker 註冊、startReservationReminderLoop()
service-worker.js                   PWA 快取（CACHE_NAME = pos-v20260602-cache，修改記得改觸發更新）
js/core/store.js                    全域 state 與持久化
js/core/utils.js                    格式化、下載等工具
js/modules/print-bridge.js          ★ 列印橋接偵測（HTTP/WebView/系統），未來要加 X-API-Token header
js/modules/print-service.js         ★ 列印主服務（getReceiptHtml / printOrderReceipt 等）
js/modules/order-service.js         訂單建立/結帳
js/modules/cart-service.js          購物車
js/modules/realtime-order-service.js Firebase 線上單監聽 + D9 自動列印 + D10 預約 30 分前提醒
js/modules/customer-service.js      顧客資料、電話遮罩、customerLookupKey
js/modules/report-session.js        班次/報表
js/modules/google-backup-service.js Google Drive 備份
js/pages/pos-page.js                點餐頁（finalizeOrder 含開錢箱與雙列印）
js/pages/orders-page.js             訂單查詢
js/pages/reports-page.js            報表（含 CSV overlay 匯出）
js/pages/products-page.js           商品管理
js/pages/settings-page.js           ★ 設定頁（含印表機偵測 UI），未來要加 API Token 輸入框
APK（jess0937588151-hue/sunmi-pos-v2）
Copyapp/src/main/java/com/pos/sunmiprinter/
  MainActivity.java                  服務狀態頁（v20260603 後改健康檢查頁）
  SettingsActivity.java              APK 設定頁（埠號、印表機設定，v20260603 後加 token / 列印狀態）
  AppSettings.java                   SharedPreferences 包裝（v20260603 後加 apiToken / lastPrintAt / lastPrintOk / lastPrintError）
  PrintService.java                  Foreground Service（v20260603 後改加 NotificationChannel + PrintQueue）
  PrintHttpServer.java               NanoHTTPD 路由器（v20260603 後綁 127.0.0.1 + token 驗證 + /logs + /test）
  BootReceiver.java                  開機自動啟動
  LogManager.java                    ★ v20260603 新增，全 APK 共用日誌
  PrintQueue.java                    ★ v20260603 新增，列印任務序列化
  UpdateChecker.java                 ★ v20260603 新增，GitHub Releases 版本檢查
  printer/
    SunmiPrinterManager.java         AIDL 綁定 + 列印（v20260603 後 getPrinterStatus 回 PrinterStatusInfo）
    BluetoothPrinterManager.java     藍牙 ESC/POS
    NetworkPrinterManager.java       網路 ESC/POS
    SunmiCallbackAdapter.java        Sunmi 回調轉接
app/src/main/assets/
  inject-bridge.js                   注入網頁的橋接腳本
  site-autoprint-adapter.js          站點自動列印適配
  test-print.html                    ★ v20260603 新增，內建測試列印頁
app/src/main/AndroidManifest.xml     INTERNET、BLUETOOTH、FOREGROUND_SERVICE、RECEIVE_BOOT_COMPLETED、WAKE_LOCK
app/build.gradle                     compileSdk 28 / minSdk 19 / targetSdk 25
七、給下一個 AI 的工作守則
改前先 fetch 真實檔案：不准憑記憶猜程式碼長相，每次都要從 raw.githubusercontent.com 拉最新版確認。
一次一個檔案：commit 訊息標明影響範圍與目的。
編譯失敗看 GitHub Actions log：抓真正的錯誤行號與型別訊息，不要憑錯誤文字猜。
不要新增本 README 未列出的功能：新需求請先請使用者更新本檔。
改完更新本檔的「進度紀錄」段落：把已完成項打勾，新發現的待辦補進待辦清單。
回傳給使用者的訊息要明確指示「改哪個檔案、貼到哪一段」：使用者不寫程式，不要丟一段 code 沒講放哪。
遇到 Service Worker 快取問題：修改 service-worker.js 開頭的 CACHE_NAME 字串強制更新。
對於使用者裝置限制（Sunmi T2 / Android 7.1.1 / 2GB / WebView）保持警覺：不要用 ES2022+ 語法、不要假設有 DevTools。
APK 端所有改動都必須寫 LogManager：Android 沒 console，try-catch 不寫日誌等於失蹤。
APK CORS 不限制來源（部署位置可能變動如私人 NAS），但HTTP Server 必須綁 127.0.0.1 防止 Wi-Fi 內任何裝置呼叫列印。
八、使用者偏好（重要）
不會寫程式，不要丟程式碼片段不告訴他放哪
主要使用 Sunmi T2，所有方案先以 T2 能用為準
偏好「最小改動、能用就好」
不喜歡反覆猜測與文字遊戲，要求一次到位
修不好寧可保留可用的舊邏輯，不要破壞性改動
中文回覆，不要無故跳英文
九、版本紀錄
日期	修改者	內容
2026-05-06	Claude (Anthropic)	建立本文件，整理列印橋接架構與市售印表機規劃
2026-05-06	Claude (Anthropic)	v20260602 完工：分隔線動態長度、結尾留白縮為 1/3、現金付款才開錢箱、APK lineWrap(4/3)→lineWrap(1)、cache 升版至 pos-v20260602-cache、index 三模組 modal 加測試列印按鈕；確認 D9 線上訂單自動列印、D10 預約 30 分鐘前提醒已實作
2026-05-06	Claude (Anthropic)	規劃 v20260603 APK 商用化補強：LogManager 日誌系統、HTTP Server 綁 127.0.0.1、印表機狀態強化、Foreground Service 常駐通知、列印佇列、健康檢查頁、API Token、測試列印頁、自動更新檢查
之後每次修改本檔請補一行，寫日期、AI 名稱（或使用者）、簡短說明。
