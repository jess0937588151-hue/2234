# AI 協作備忘錄（POS 專案）

> 本檔目的：跨對話讓 AI 助手快速理解專案現況、避免重複問已知資訊。
> 新對話開始時，第一句話貼這份檔案的 raw 網址 + 你想做的事即可。
> Raw URL: `https://raw.githubusercontent.com/jess0937588151-hue/2234/main/aiREADME.md`

---

## 1. 專案 Repo

| 用途 | 網址 |
|---|---|
| 網頁主程式（目前在用） | https://github.com/jess0937588151-hue/2234 |
| APK 端（包 WebView） | https://github.com/jess0937588151-hue/sunmi-pos-v2 |
| 舊版可參考（功能相對乾淨） | https://github.com/jess0937588151-hue/2332 |
| 部署網址（GitHub Pages） | https://jess0937588151-hue.github.io/2234/ |

---

## 2. 使用環境（重要）

- **主要裝置**：Sunmi T2 安卓平板
  - Android 7.1.1（API 25）
  - 記憶體 2GB（**寫程式時注意記憶體佔用**）
- **APK 版本**：versionName 4.0（versionCode 4，2026-04-27）
- **次要裝置**：iPad（用瀏覽器開部署網址）
- **APK 編譯**：GitHub Actions 自動編譯（`.github/workflows/build.yml`）

### WebView 已知限制（API 25 + Android 7.1.1）

| 限制 | 影響 | 繞過方式 |
|---|---|---|
| `window.open()` 預設被擋（沒設 setSupportMultipleWindows） | 新分頁、彈出視窗失效 | 網頁端用 DOM overlay 取代 |
| `<a download>` / Blob URL 下載失效（沒設 setDownloadListener） | CSV/Excel 匯出按了沒反應 | 網頁端用 textarea + 複製到剪貼簿取代 |
| Google OAuth 嵌入式 WebView 被 Google 政策封鎖 | Firebase / Drive 登入失敗（顯示「不符合 Google 規範」） | 改用 Email+密碼登入或放棄 |

---

## 3. 每日使用功能（全部都在用）

- 點餐 / 結帳
- 廚房單列印
- 收據列印
- 標籤列印
- 線上點餐（Firebase 即時接單）
- 預約 30 分鐘提醒
- Google Drive 備份
- 報表匯出
- 訂單查詢

**所有功能都是每天必用，沒有「次要」可以犧牲**。

---

## 4. 印表機配置

- **紙寬**：80mm
- **內建 Sunmi 印表機**：印全部單（收據／廚房／標籤都印）
- **外接藍牙印表機**：完整備援，印全部單
- **外接網路印表機**：完整備援，印全部單

備援邏輯：iPad 開時走藍牙／網路；Sunmi T2 開時走內建。

---

## 5. AI 助手協作守則（請嚴格遵守）

1. **不要猜原因**。每次回答前先用 crawler 工具讀取相關檔案，看到實際程式碼再說。
2. **每次只改一個檔案的一個函式**，除非使用者明確同意大改。
3. **修改前先報告**：要改哪個檔案、哪一段、為什麼。等使用者同意才動手。
4. **同一頁面同一功能要一次改完**（例如報表頁兩個匯出按鈕一起改，不要分兩次）。
5. **不要叫使用者按 F12**：使用者用 Sunmi T2 安卓平板，沒有 F12。
6. **錯誤訊息以 app.js 內建的紅色橫條為準**（畫面最下方會顯示）。
7. **不要假設使用者懂程式**：給步驟要明確（哪個檔、哪一行、貼什麼）。
8. **CSV / Excel 不要玩文字遊戲**：使用者要的是「Excel 雙擊能開的檔」，CSV 加 BOM 就行，不需要強推 .xlsx。
9. **WebView 限制要記住**：不要再寫 `window.open`、`<a download>`、`Blob` 下載、Google OAuth。

---

## 6. 已修正的事項

### 網頁端（2234）

- [x] 報表頁三個按鈕（歷史紀錄／匯出／成本管理）搬到頁首 topbar
- [x] 歷史班次紀錄讀取路徑修正（`state.reports.sessions`）
- [x] 列印欄位三欄獨立勾選（receipt / kitchen / label 矩陣）
- [x] `getFieldFlags(mode)` 改讀 `cfg.fields[mode]`
- [x] 收據分隔線動態長度（避免換行）
- [x] 收據結尾留白減少（部分，硬體限制無法完全消除）
- [x] CSV 匯出改用 overlay 文字框 + 複製到剪貼簿（相容 Android WebView）

### APK 端（sunmi-pos-v2）

（暫無）

---

## 7. 待修事項（依優先順序）

### 🔴 高優（影響每日使用）

1. **Google 登入無法使用**（Firebase + Drive 兩個都掛）
   - 根因：Google 政策禁止嵌入式 WebView 跑 OAuth
   - 候選方案 A：Firebase 改 Email+密碼登入，密碼寫死在 JS（最小改動，**只動網頁**）
   - 候選方案 B：Drive 備份改成「Email 寄 CSV 附件」（用 `mailto:` 連結）
   - 候選方案 C：放棄 Drive，改本機儲存
   - **使用者偏好**：能不改 APK 最好；最好直接寫死帳密自動登入
   - **狀態**：方案 A 可行，待開工
2. **收據結尾留白還是太多**
   - 已嘗試前端刪空白行但效果有限
   - 真正解法：改 APK 端 `SunmiPrinterManager.java` 的 `cutPaper()` 走紙距離
   - 或改用 ESC/POS 指令 `[0x1B,0x4A,n]` 自訂走紙

### 🟡 中優

3. **APK WebView 設定下載／彈窗支援**（一勞永逸解決匯出問題）
   - 改 `MainActivity.java` 加 `setDownloadListener` + `setSupportMultipleWindows(true)`
   - 改完後網頁端可以恢復用 `Blob` + `<a download>`
4. **開錢箱條件邏輯**：確認只在現金付款時才開
5. **線上接單背景觸發**：APK 殺掉後預約 30 分提醒能否準時觸發
6. **設定頁 `getFieldFlags()` 死碼清理**（B1/B2/B4，不影響功能但留著佔空間）

### 🟢 低優

7. 熱銷 TOP10 詳細展開效果
8. 成本管理功能（A2）：商品成本輸入 + 班次成本/利潤計算

---

## 8. 主要檔案速查（網頁端 2234）

| 檔案 | 內容 |
|---|---|
| `index.html` | UI 結構、所有 modal、xlsx CDN 載入 |
| `service-worker.js` | PWA 快取（CACHE_NAME 改字串會強制更新） |
| `js/app.js` | 入口、初始化、全域錯誤紅條、Google 登入入口 |
| `js/core/store.js` | state 結構、預設值、persistAll |
| `js/core/utils.js` | downloadFile、escapeHtml、money、fmtLocalDateTime |
| `js/pages/pos-page.js` | 點餐結帳、商品選項配置 |
| `js/pages/orders-page.js` | 訂單查詢、線上待確認、待付款、已完成 |
| `js/pages/reports-page.js` | 報表、班次、匯出 CSV、列印報表 |
| `js/pages/products-page.js` | 商品管理、分類、模組 |
| `js/pages/settings-page.js` | 列印設定、Sunmi、藍牙、網路、即時接單、Drive 備份 |
| `js/modules/print-service.js` | 列印核心（Sunmi Bridge 呼叫） |
| `js/modules/realtime-order-service.js` | Firebase 即時接單、POS Google 登入 |
| `js/modules/google-backup-service.js` | Drive 備份、登入 |
| `js/modules/report-session.js` | 班次（開/結班、累計） |

---

## 9. 主要檔案速查（APK 端 sunmi-pos-v2）

| 檔案 | 內容 |
|---|---|
| `app/build.gradle` | versionName/Code、minSdk 19、targetSdk 25 |
| `app/src/main/AndroidManifest.xml` | 權限、Activity 註冊 |
| `app/src/main/java/com/pos/sunmiprinter/MainActivity.java` | WebView 設定、Sunmi 綁定、登入入口 |
| `app/src/main/java/com/pos/sunmiprinter/SettingsActivity.java` | APK 內設定頁（網址、藍牙、網路） |
| `app/src/main/java/com/pos/sunmiprinter/AppSettings.java` | 設定持久化 |
| `app/src/main/java/com/pos/sunmiprinter/printer/SunmiPrinterManager.java` | Sunmi AIDL 印表機（cutPaper、走紙） |
| `app/src/main/java/com/pos/sunmiprinter/printer/BluetoothPrinterManager.java` | 藍牙印表機 |
| `app/src/main/java/com/pos/sunmiprinter/printer/NetworkPrinterManager.java` | 網路印表機 |
| `app/src/main/java/com/pos/sunmiprinter/web/PrintJsBridge.java` | JS Bridge（網頁呼叫 Sunmi） |
| `app/src/main/assets/inject-bridge.js` | 啟動時注入網頁的橋接 JS |
| `.github/workflows/build.yml` | GitHub Actions 自動編譯 |

---

## 10. 下次新對話建議起手式

