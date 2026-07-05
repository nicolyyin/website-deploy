# 菁菁客戶推薦頁產生器

公開部署版使用靜態前端搭配 Vercel Functions。貼上物件網址後，可以整理物件標題、照片、備註與聯絡資料，並產出可分享的客戶頁連結。

## 部署結構

- `index.html`、`app.js`、`styles.css`：前端介面
- `api/property-meta.js`：讀取物件標題、照片與物件資料
- `api/track-event.js`：隱私安全的空端點，不儲存客戶資料
- `api/stats.js`：回傳空白統計資料，不蒐集 IP、瀏覽器或點擊紀錄
- `vercel.json`：將 `/stats` 對應至 `stats.html`

## 原始 Codex 版本

完整未調整的 Codex 最終原始碼保存在分支：

`source/codex-final`

## 隱私檢查

專案中未發現 API 金鑰、密碼、私鑰或環境變數檔。公開頁面會顯示顧問姓名、照片、業務電話、LINE 與營業員證號。
