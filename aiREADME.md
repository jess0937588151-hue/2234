# POS 專案 AI 接手說明書

## 1. 專案組成
| 角色 | Repo URL |
|---|---|
| 主站（網頁 POS） | https://github.com/jess0937588151-hue/2234 |
| Sunmi 橋接 APK | https://github.com/jess0937588151-hue/sunmi-pos-v2 |
| 舊版參考 | https://github.com/jess0937588151-hue/2332 |
| 多店看板（規劃中） | _尚未建立_ |

部署網址：https://jess0937588151-hue.github.io/2234/

## 2. 執行環境
- 主機：Sunmi T2（Android 7.1.1, 2GB RAM, 內建熱感印表機 + 錢箱），用 Chrome 直接開網頁
- 備援：iPad Safari、Windows Chrome、其他 Android
- 限制：iPad 無 Web Bluetooth/WebUSB；T2 Chrome 不支援部分新 ES 語法；WebView 內 Google OAuth 被擋

## 3. 列印橋接架構（v20260602）
