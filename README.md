# WebForChingFang

給牙醫師使用的小工具網站。

## 1. 語音轉文字（已完成）

開啟 `index.html`，按下麥克風按鈕開始說話，文字會即時出現在畫面上。

功能：
- 即時顯示辨識中的文字（灰色斜體），講完一句後寫入文字框
- 中文（台灣）／英文／日文切換
- 句尾自動加「，」、每句換行、加上時間標記
- 文字框可直接修改；複製、下載 .txt
- 「存成一筆紀錄」：存在這台裝置的瀏覽器裡，可再載入、複製、下載、刪除
- 自訂詞彙修正：例如 `牙周北=牙周病`，專有名詞被聽錯時自動替換
- 錄音時保持螢幕不關閉；電腦上可按空白鍵開始／停止

支援的瀏覽器：Chrome、Edge（電腦、Android），iPhone／iPad 的 Safari。
Firefox 不支援語音辨識。

> 注意：瀏覽器內建的語音辨識會把聲音送到 Google（Chrome）或 Apple／Microsoft 的伺服器處理。
> 請避免唸出病人的身分證號等敏感個資。

### 架設方式

麥克風只能在 `https://` 或 `localhost` 下使用，直接雙擊打開檔案可能無法使用麥克風。

最簡單：在 GitHub 這個 repo 的 **Settings → Pages**，Source 選 `Deploy from a branch`，
選分支後儲存，幾分鐘後就會有一個 `https://<帳號>.github.io/WebForChingFang/` 網址，
手機、平板、電腦都能直接打開使用。

本機測試：

```sh
python3 -m http.server 8000
# 然後打開 http://localhost:8000
```

## 2. 照片處理與雲端分類（規劃中）
