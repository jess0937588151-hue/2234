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

五、目前實機狀況（2026-05-06，v20260606 診斷中）
使用者實測症狀
設定頁的「列印設定預覽單」：跳出 PDF 列印對話框，Sunmi 沒直接列印
POS 結帳列印（顧客單）：跳 PDF，沒列印
訂單頁補印（顧客單 / 廚房單 / 標籤單）：跳 PDF，沒列印
POS 結帳開錢箱：網頁顯示「未偵測到出單機」，錢箱沒開
APK 端 /test 頁的「測試列印」按鈕：能列印，但中文變問號
APK 端 /test 頁的「開錢箱」按鈕：能正常開錢箱
根因推論（待 v20260606 log 驗證）
症狀 1~4 + 症狀 4 的「未偵測到出單機」訊息 → 強烈指向 web 端 detectPrinters() 判定 mode='browser'，httpPrint / httpOpenDrawer 從未被呼叫。
為什麼 detectPrinters 判錯？三個可能：
fetch /ping 失敗（CORS / mixed content / service worker 攔截 / token 不對）
PING_TIMEOUT_MS = 1500 ms 太短，Sunmi T2 冷啟動超時
service worker 仍快取舊版 print-bridge.js
症狀 5（中文問號）是另一個獨立問題，發生在 APK 內部的 readBody 編碼處理或 SunmiPrinterManager。在症狀 1~4 修好之前，這個問題暫時擱置（連 web 都沒送到 APK，討論編碼為時過早）。
症狀 6 證明 APK 服務本身正常運作，AIDL 綁定 Sunmi 印表機成功，錢箱硬體正常。
走過的彎路（避免重複）
改 detectPrinters 強制 cache refresh：沒解決
改 service-worker.js 移除不存在的 import-page.js + 升 cache 版本：沒解決
改 readBody 用 ISO-8859-1 反轉：對中文問號議題有理論依據，但因為症狀 1~4 沒解決，此修正成果無法驗證
嘗試在 httpPrint 改 Blob + text/plain 繞 NanoHTTPD parseBody：使用者改完沒效果（推測仍是 detectPrinters 判 browser，根本沒走到）
多次猜測修改但缺乏實機 log 證據，使用者強烈不滿（已被指責多次）
六、本輪計劃（v20260606）
目標：純加 log，零邏輯改動。讓使用者只裝一次 APK + 上一次 web，就能拿到完整鏈路證據。

要改的 5 個檔案（網頁 3 個 + APK 2 個）
網頁端：

service-worker.js — 升 CACHE_NAME 強制重抓
js/modules/print-bridge.js — detectPrinters / httpPrint / httpOpenDrawer 全加 log，並把 log 同步到螢幕右上角橘色浮動框（可關閉）
js/modules/print-service.js — printOrderReceipt / printKitchenCopies / printOrderLabels / openCashDrawer 進入點加 log
APK 端：

app/src/main/java/com/pos/sunmiprinter/PrintHttpServer.java — readBody / handlePrintSunmi / handlePrintBluetooth / handlePrintNetwork / handleDrawerOpen 加 log
app/src/main/java/com/pos/sunmiprinter/printer/SunmiPrinterManager.java — printPosReceipt / openCashDrawer / bind 加 log
Web 端 log 點明細
W1. detectPrinters：/ping URL、HTTP status、回傳前 200 字、最終 mode 判定、超時或例外原因 W2. httpPrint：target、URL、headers、body 前 200 字、HTTP status、回傳 text、解析後 ok/error W3. httpOpenDrawer：URL、headers、HTTP status、回傳 text、解析後 ok/error W4. print-service.openCashDrawer：進入時 detect.mode、走哪條路、最終結果 W5. print-service.printOrderReceipt / printKitchenCopies / printOrderLabels：進入時 detect.mode、走哪條路、最終結果 W6. 全部 log 寫進 window.__printLog 陣列 + 螢幕右上角橘色浮動框

APK 端 log 點明細
A. PrintHttpServer.readBody：content-type header、parseBody 例外、postData == null、原始長度、原始字串前 200 字、原始字串前 40 字元 codepoint、ISO-8859-1→UTF-8 還原後前 200 字、還原後前 40 字元 codepoint B. PrintHttpServer.handlePrintSunmi / Bluetooth / Network：進入時間、body 長度、body 前 200 字 C. PrintHttpServer.handleDrawerOpen：進入時間、sunmi/bluetooth/network 各別 != null 與 isConnected() 布林、選到的 via、最終 ok D. SunmiPrinterManager.printPosReceipt：收到 json 前 200 字、解析後 shopName + 前 20 字 codepoint、orderNo / datetime / orderType / payment 各值、items.length()、items[0].name + 前 20 字 codepoint、qty、price、options、footer、openDrawer E. SunmiPrinterManager.openCashDrawer：isConnected、printerService 是否 null、API 回傳、若走 RAW 則 sendRAWData 回傳 F. SunmiPrinterManager.bind / onConnected / onDisconnected：確認 service 真的綁上

使用者測試步驟（拿到 5 個檔案後）
5 個檔案各自 commit 到對應 repo
APK repo commit 後 GitHub Actions 會自動 build，下載新 APK 安裝到 Sunmi T2（會被指責難裝，但這次之後才能精準修正）
等 GitHub Pages 部署完成（30~60 秒）
Sunmi T2 Chrome 完全關閉 2234 分頁（含背景），重開 https://jess0937588151-hue.github.io/2234/
從 POS 頁結帳列印一次（任何按鈕）
從 POS 頁開錢箱按一次
截圖：螢幕右上角橘色 log 框
開 http://127.0.0.1:8080/test → 按「最近日誌」→ 截圖
兩張截圖能讓 AI 看到：web 有沒有送請求、送什麼、APK 有沒有收到、收到什麼 byte、解析後變什麼、最後印什麼。

預期診斷結果（log 拿到後）
若 web log 顯示 mode='browser'：問題在 detectPrinters 的 /ping 判定，下一輪只改 web，不裝 APK
若 web log 顯示 mode='http' 但 httpPrint 失敗：看 HTTP status 與錯誤訊息決定下一步
若 web log 顯示 httpPrint 成功但實際沒印：APK 端 log 看 readBody 是否拿到完整 body、printPosReceipt 是否解析出中文，鎖定 APK 哪一行
若 APK log 顯示 readBody RAW head 是「???」：問題在 NanoHTTPD parseBody，下輪改 readBody
若 APK log 顯示 readBody UTF8 head 是正確中文但收據還是印「?」：問題在 Sunmi printerService 字元集，下輪改 SunmiPrinterManager
七、進度紀錄
v20260601 已完成
APK 重構為純後台 HTTP Server 架構（NanoHTTPD on 127.0.0.1）
APK 三種印表機 Manager 完成（Sunmi / 藍牙 / 網路）
設定頁三欄勾選矩陣（receipt / kitchen / label）
reports-page.js 報表匯出改用 overlay 顯示 CSV
新增 js/modules/print-bridge.js（三層橋接偵測）
改寫 js/modules/print-service.js（列印路由走 bridge）
改寫 js/pages/settings-page.js（三區塊偵測改走 bridge）
D9 線上訂單自動列印
D10 預約 30 分鐘前自動提醒列印
v20260602 已完成
sunmiPrintReceiptByFont 結尾留白縮為 1 行、分隔線動態長度
buildPlainTextFromOrder 修 baseSize ReferenceError、結尾留白縮為 1 行
pos-page.js finalizeOrder 修多餘的 }、開錢箱改 async
APK SunmiPrinterManager.feedAndCut / cutPaper 的 lineWrap 全改 1
APK printPosReceipt 改條件開錢箱（openDrawer flag）
index.html 三模組 modal 加測試列印按鈕、title 改「餐廳 POS V20260602 列印橋接版」
service-worker.js CACHE_NAME 升至 pos-v20260602-cache
v20260603 已完成（APK 商用化補強）
LogManager.java 日誌中心（檔案 + 記憶體 200 筆環形緩衝 + 7 天自動清理 + errors.txt 分檔）
PrintHttpServer 強制綁 127.0.0.1
印表機狀態強化（PrinterStatusInfo + /ping 詳細狀態）
Foreground Service 常駐通知（PrintService.createNotificationChannel）
PrintQueue.java 單線程列印佇列（30 秒上限）
列印失敗紀錄 + SettingsActivity 顯示「最後列印狀態」
MainActivity 健康檢查頁（4 區塊 + 10 筆錯誤日誌 + 4 顆操作按鈕）
API Token 驗證（首次啟動 UUID 隨機生成）
內建測試列印頁 GET /test
v20260606 完工：拿到完整 web + APK log 證據鏈，確認 NanoHTTPD parseBody 對 application/json 走 US-ASCII 導致中文 byte 進來就被吞成 ?。最終修法：PrintHttpServer.readBody 改為從 InputStream 直接讀 Content-Length byte，用 UTF-8 解碼，完全跳過 parseBody。 不做（已確認）：

項目 2、10、13：使用者明確排除
項目 12：自動更新檢查（維持手動更新）
關鍵踩雷紀錄：

compileSdk=28 環境下不可使用 android:foregroundServiceType 屬性
PrintHttpServer 建構子是 4 參數（port + 3 個 manager），不是 5 參數
SunmiPrinterManager 必須保留舊簽名（PrintJsBridge / SettingsActivity 依賴）
BluetoothPrinterManager / NetworkPrinterManager 用 printPosReceipt(json)、openCashDrawer()
LogManager.init(this) 必須寫在 PrintService.onCreate() 內
PrintService.onCreate 已加 PrintQueue.init()、onDestroy 已加 PrintQueue.shutdown()
v20260606 進行中（列印與錢箱回歸診斷）
 5 個檔案加 log（web 3 + APK 2）
 使用者實測拿到兩張 log 截圖
 依 log 結果鎖定問題、提出最小修正
v20260606 已完成（列印與錢箱回歸 + token 同步）
實機驗證結果：收據、廚房單、預覽單中文完全正確，錢箱經 sunmi 路徑開啟成功。

真正根因：APK 每次重啟/重裝會用 UUID 重新生成 API token，但 Web 端 localStorage 還存著舊 token，所有 /print/* 與 /drawer/open 都被 APK checkToken 擋掉回 unauthorized，前端 fallback 到 window.print() 跳 PDF 對話框。先前誤判為「NanoHTTPD parseBody 把中文吃成 ?」，繞了多輪，實際上請求根本沒進到 readBody。

最終修法（兩處）：

APK app/src/main/java/com/pos/sunmiprinter/PrintHttpServer.java 的 handlePing() 在回應 JSON 加上 "token":"..." 欄位（/ping 本來就免驗證，等於免費把 token 公開給本機 web）：
Copydata.append("\"token\":\"").append(escape(settings != null ? settings.getApiToken() : "")).append("\",");

Web js/modules/print-bridge.js： detectPrinters 收到 /ping 回應時，若 data.token 與 localStorage 不一致就自動 setApiToken(data.token) 同步 httpPrint / httpOpenDrawer 收到 401/403/unauthorized 時呼叫 detectPrinters(true) 重抓 token，再重試一次 移除原本依賴 /test HTML 解析 token 的 tryAutoFetchToken 路徑（容易被 CORS / 連線競爭打成 Failed to fetch） 踩雷紀錄：

不要相信「中文變 ?」的表象，先看 APK log 是不是 unauthorized（請求根本沒進 readBody） /ping 是 token 同步的天然管道：免驗證、Web 端本來就會呼叫、cache TTL 8 秒 APK 重裝後 token 會換，這是 v20260603 加 API Token 驗證後的副作用；任何依賴 token 的 endpoint 都要有自動重抓機制 readBody 從 InputStream 直接讀 byte 用 UTF-8 解碼的修法已經保留（雖然這次不是主因，但對未來 application/json POST 仍是正確做法） 一併保留的保活措施（v20260606）：

PrintService 取得 PARTIAL_WAKE_LOCK 防止螢幕關閉時 NanoHTTPD 接收延遲 AndroidManifest 加 WAKE_LOCK 與 REQUEST_IGNORE_BATTERY_OPTIMIZATIONS 權限

v20260607 進行中（fields 勾選矩陣失效 + 開錢箱訊息誤判）
使用者實測症狀（v20260606 修復列印鏈路後新發現）：

顧客單、廚房單三欄勾選矩陣完全沒作用：不管勾或不勾，印出來的內容都一樣（只有店名、單號、時間、類型、付款、品項、合計這幾項，其他 phone/address/customerInfo/subtotal/discount/orderNote/footer 不論勾選都不會印）
按開錢箱按鈕：實際錢箱會開，但畫面跳「開啟錢箱失敗：未偵測到可用印表機，請確認 Sunmi 服務是否運行」
APK 偶爾被 T2 系統殺掉（已確認可透過系統設定加白名單 + 鎖定最近使用解決，非程式問題）
根因推論（待 v20260607 log 驗證）：

症狀 1 雙重原因：(a) APK 端 SunmiPrinterManager.printPosReceipt 沒讀 obj.optJSONObject("fields") 旗標，所有欄位無條件硬印；(b) Web 端 print-service.js buildBridgePayload 送的 key 名稱與 APK 讀的 key 名稱不一致（web 送 shopPhone/shopAddress/customerName/customerPhoneMasked/customerNote/subtotal/discountAmount，APK 只認 storePhone/storeAddress 等舊名）
症狀 2 是 Web 端 print-service.openCashDrawer 的錯誤訊息文字，意思是 detect.mode 又被判成非 http、走不到 httpOpenDrawer。但錢箱實際會開代表別條路徑（可能 window.SunmiPrinter 舊殼或上次成功殘留）有開到。需要 APK log 確認 /drawer/open 到底有沒有收到請求
本輪計劃（一次重刷把所有證據點與修法塞滿，下輪只動 web 不再刷 APK）：

要改的 2 個 APK 檔案：

A. app/src/main/java/com/pos/sunmiprinter/printer/SunmiPrinterManager.java

printPosReceipt 加 fields 勾選邏輯（讀 obj.optJSONObject("fields")，缺鍵預設 true 保留舊行為）
加 web 端新 key fallback：firstNonEmpty(shopName, storeName) / shopPhone↔storePhone / shopAddress↔storeAddress / customerName / customerPhoneMasked / customerNote / subtotal↔subtotalAmount / discountAmount↔discount / orderNote / footer
加完整診斷 log：收到 json 前 200 字、每個欄位原始值（含空字串）、所有 fields 旗標 true/false、items.length()、每個 item 的 name/qty/price/options/note、最終 openDrawer flag
B. app/src/main/java/com/pos/sunmiprinter/PrintHttpServer.java

handleDrawerOpen 加完整 log：進入時間、sunmi/bluetooth/network 各 manager 的 != null 與 isConnected() 布林、選到的 via、各路徑回傳 ok/error、最終回給 web 的 JSON 完整內容
handlePing 多回 printerReady 欄位（直接呼叫 sunmi.isConnected() 結果）給未來 web detect 邏輯使用
下輪只動 web 不刷 APK 的計劃（拿到 v20260607 log 後執行）：

若 APK log 顯示 fields 旗標已生效但勾選還是沒作用 → 改 print-service.js buildBridgePayload 確保 fields 送對 key
若 APK log 顯示 /drawer/open 確實收到請求且回 ok:true → 改 print-service.openCashDrawer 修錯誤訊息誤判
若 APK log 顯示 /drawer/open 根本沒收到請求 → 改 print-bridge.js detectPrinters 與 httpOpenDrawer 路由判定
預期 log 證據點（拿到後對應結論）：

printPosReceipt RAW shopName=[早] shopPhone=[02-1234] shopAddress=[] subtitle=[] orderNo=[A001] customerName=[] customerPhone=[] customerNote=[] subtotal=120 discount=10 total=110 footer=[謝謝光臨] openDrawer=true
printPosReceipt FIELDS storeName=true storePhone=true storeAddress=false customerInfo=false subtotal=true discount=true total=true footer=false ...
printPosReceipt ITEMS count=2 [0] name=漢堡 qty=1 price=100 options=加蛋 note=不要洋蔥 [1] name=可樂 qty=1 price=20 options= note=
handleDrawerOpen ENTRY sunmi=true(isConnected=true) bt=false net=false → via=sunmi → ok=true → response={"ok":true,"data":{"via":"sunmi"}}
待辦項目
 SunmiPrinterManager.java 整檔取代 commit
 PrintHttpServer.java 整檔取代 commit
 GitHub Actions build 完成下載新 APK 重刷一次
 T2 系統設定加白名單（電池優化、自啟動、關聯啟動、最近使用鎖定）防止 APK 被殺
 顧客單勾選不同組合各印一次、廚房單勾選不同組合各印一次、按開錢箱一次
 /logs?lines=200&token=xxx 截圖
 依 log 對應結論修 web（不再刷 APK）
八、待辦
短期
優先	項目	影響範圍	細節
高	v20260607 fields 勾選矩陣失效	APK + 網頁	APK 加 fields 旗標 + log，下輪改 web buildBridgePayload key 對齊
高	v20260607 開錢箱訊息誤判	APK + 網頁	APK 加 handleDrawerOpen log + /ping printerReady，下輪改 web openCashDrawer 訊息與 detect
中	APK 被 T2 系統殺掉	系統設定（非程式）	電池優化白名單 + 自啟動 + 關聯啟動 + 最近使用鎖定
中	Google 登入失敗	網頁或 APK	Custom Tabs 或 Firebase Email 登入
長期
A. 2234 打包成獨立 APK（含市售印表機列印模組：藍牙 / 網路 / USB ESC/POS） B. 多店即時營業看板網站（Firebase 資料源） C. POS 新功能 / 流程改善（待用戶提出）

Android 平台已知限制（不要嘗試突破）：

不可能整合 HP/Epson/Canon 的 Windows 私有驅動
非 ESC/POS 印表機（A4 雷射/噴墨）只能透過 Mopria/IPP
九、關鍵檔案地圖
網頁（jess0937588151-hue/2234）：

index.html — 主頁面 + 各 view 區塊（含 reservationReminderOverlay）
js/app.js — 入口、Service Worker 註冊、startReservationReminderLoop()
service-worker.js — PWA 快取（CACHE_NAME，修改記得改觸發更新）
js/core/store.js — 全域 state 與持久化
js/core/utils.js — 格式化、下載等工具
js/modules/print-bridge.js — 列印橋接偵測（HTTP/WebView/系統），含 X-API-Token header
js/modules/print-service.js — 列印主服務（getReceiptHtml / printOrderReceipt 等）
js/modules/order-service.js — 訂單建立 / 結帳
js/modules/cart-service.js — 購物車
js/modules/realtime-order-service.js — Firebase 線上單監聽 + D9 自動列印 + D10 預約提醒
js/modules/customer-service.js — 顧客資料、電話遮罩
js/modules/report-session.js — 班次 / 報表
js/modules/google-backup-service.js — Google Drive 備份
js/pages/pos-page.js — 點餐頁（finalizeOrder 含開錢箱與雙列印）
js/pages/orders-page.js — 訂單查詢
js/pages/reports-page.js — 報表（含 CSV overlay 匯出）
js/pages/products-page.js — 商品管理
js/pages/settings-page.js — 設定頁（含印表機偵測 UI）
APK（jess0937588151-hue/sunmi-pos-v2）：

app/src/main/java/com/pos/sunmiprinter/MainActivity.java — 健康檢查頁
app/src/main/java/com/pos/sunmiprinter/SettingsActivity.java — APK 設定頁（token + 列印狀態）
app/src/main/java/com/pos/sunmiprinter/AppSettings.java — SharedPreferences 包裝
app/src/main/java/com/pos/sunmiprinter/PrintService.java — Foreground Service
app/src/main/java/com/pos/sunmiprinter/PrintHttpServer.java — NanoHTTPD 路由器
app/src/main/java/com/pos/sunmiprinter/BootReceiver.java — 開機自動啟動
app/src/main/java/com/pos/sunmiprinter/LogManager.java — 全 APK 共用日誌
app/src/main/java/com/pos/sunmiprinter/PrintQueue.java — 列印任務序列化
app/src/main/java/com/pos/sunmiprinter/printer/SunmiPrinterManager.java — AIDL 綁定 + 列印
app/src/main/java/com/pos/sunmiprinter/printer/BluetoothPrinterManager.java — 藍牙 ESC/POS
app/src/main/java/com/pos/sunmiprinter/printer/NetworkPrinterManager.java — 網路 ESC/POS
app/src/main/java/com/pos/sunmiprinter/printer/SunmiCallbackAdapter.java — Sunmi 回調轉接
app/src/main/assets/inject-bridge.js
app/src/main/assets/site-autoprint-adapter.js
app/src/main/assets/test-print.html — 內建測試列印頁
app/src/main/AndroidManifest.xml — INTERNET / BLUETOOTH / FOREGROUND_SERVICE / RECEIVE_BOOT_COMPLETED / WAKE_LOCK
app/build.gradle — compileSdk 28 / minSdk 19 / targetSdk 25
十、給下一個 AI 的工作守則
改前先 fetch 真實檔案：禁止憑記憶或猜測，每次都要從 raw.githubusercontent.com 拉最新版確認
一次一個檔案：commit 訊息標明影響範圍與目的
編譯失敗看 GitHub Actions log：抓真正的錯誤行號與型別訊息
不要新增本 README 未列出的功能：新需求請先請使用者更新本檔
改完更新本檔的「進度紀錄」段落
回傳給使用者的訊息要明確指示「改哪個檔案、貼到哪一段」：使用者不寫程式
遇到 Service Worker 快取問題：修改 service-worker.js 開頭的 CACHE_NAME 強制更新
對於使用者裝置限制（Sunmi T2 / Android 7.1.1 / 2GB / WebView）保持警覺：不要用 ES2022+ 語法、不要假設有 DevTools
APK 端所有改動都必須寫 LogManager：Android 沒 console，try-catch 不寫日誌等於失蹤
APK CORS 不限制來源，但 HTTP Server 必須綁 127.0.0.1
使用者要求「一次貼出完整檔案」時：每個檔案完整內容放在一個 code block 裡，禁止用「前段⋯⋯後段」省略，禁止把同一個檔案拆成多段，禁止只貼差異片段
沒拿到實機 log 證據前禁止亂猜：本專案已多次因猜測修改造成使用者重灌 APK 而被強烈指責。先加 log 拿證據，再修
APK 改一次重灌一次成本很高：使用者每次都要被指責一次。儘量在「加 log 那一次」就把所有可能用到的證據點全部加好，避免下次又要重灌
違反第 11~13 條會直接被使用者指責：本檔已多次因 AI 自己訂規範自己不遵守而被使用者強烈不滿。寫了規範就要照做
十一、使用者偏好
不會寫程式，不要丟程式碼片段不告訴他放哪
主要使用 Sunmi T2，所有方案先以 T2 能用為準
偏好「最小改動、能用就好」
不喜歡反覆猜測與文字遊戲，要求一次到位
修不好寧可保留可用的舊邏輯，不要破壞性改動
中文回覆，不要無故跳英文
要求「aiREADME一次貼出來不要分段」，整個檔案內容必須在同一個 code block，可以一次複製貼上
不要叫使用者在 Sunmi T2 上手打 javascript 指令；要除錯就在程式裡加 log，不是叫使用者打字
說明書必須記下，避免對話壓縮後 AI 又忘記
APK 重刷一次成本極高（有時一小時裝不進去），任何要動 APK 的修改都必須一次塞滿所有可能用到的 log 與修法，禁止分批
十二、版本紀錄
日期	修改者	內容
2026-05-06	Claude (Anthropic)	建立本文件，整理列印橋接架構與市售印表機規劃
2026-05-06	Claude (Anthropic)	v20260602 完工：分隔線動態長度、結尾留白縮為 1/3、現金付款才開錢箱、APK lineWrap(4/3)→lineWrap(1)、cache 升版至 pos-v20260602-cache
2026-05-06	Claude (Anthropic)	v20260603 完工：LogManager、HTTP Server 綁 127.0.0.1、PrinterStatusInfo、Foreground Service、PrintQueue、API Token、/test 內建測試頁、健康檢查頁
2026-05-06	Claude (Anthropic)	v20260606 診斷：列印全跳 PDF、開錢箱顯示「未偵測到出單機」、APK /test 中文變問號。決定純加 log 不改邏輯，5 個檔案一次到位（web 3 + APK 2）
2026-05-06	Claude (Anthropic)	v20260606 完工：token 同步是真正根因，readBody UTF-8 修法保留
2026-05-08	Claude (Anthropic)	v20260607 進行中：fields 勾選矩陣失效 + 開錢箱訊息誤判。APK 一次重刷塞滿 fields 邏輯 + key fallback + 完整診斷 log + /ping printerReady，下輪只動 web。新增守則第 14 條（自訂規範要照做）、使用者偏好新增 APK 重刷成本說明
Copy
