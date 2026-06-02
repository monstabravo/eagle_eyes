# Eagle Eyes — API Analyzer

**按下 `Alt+R`，操作網站，再按一次 `Alt+R`。即可直接拿到一支可執行的 Python 爬蟲，目標是這個網站的私有 API。**

[![CI](https://github.com/monstabravo/eagle_eyes/actions/workflows/ci.yml/badge.svg)](https://github.com/monstabravo/eagle_eyes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue.svg)](manifest.json)
[![Zero deps](https://img.shields.io/badge/runtime%20deps-0-success)](#系統需求)
[![Pure JS](https://img.shields.io/badge/build-none%20(pure%20JS)-brightgreen)](#系統需求)

> 繁體中文 ・ [English](README.md)

---

> ⚠️ **本工具會完整記錄所有原始資料 —— 包含密碼、token、cookie 與 storage，完全不做任何遮蔽。** 這是刻意設計：目的是讓生成的爬蟲與 parser 能完整還原當時的 session。請務必在獨立的瀏覽器 profile 中，且只對你已獲得授權測試的系統使用。

---

## 你會拿到什麼

只需錄製一次 session，就能得到一支乾淨、可直接執行的爬蟲程式（以 Python class 形式產生）—— 這是完整生成的程式碼，而不是流於形式的骨架：

```python
# 這就是實際產生的輸出(base headers 已精簡)。
class EagleEyesScraper:
    def __init__(self):
        self.session = requests.Session()
        self.base_headers = {
            "user-agent": "...",
            "accept": "application/json",
        }
        self.session.headers.update(self.base_headers)

    def get_users(self, id, **kwargs) -> Dict[str, Any]:
        """
        GET https://example.com/api/users/{id}

        Path / URL params:
        - id (required): str - Example: 123
        """
        url = f'https://example.com/api/users/{id}'
        try:
            params = kwargs.get("params", {})
            response = self.session.get(url, params=params, timeout=30)
            response.raise_for_status()
            ctype = response.headers.get("content-type", "")
            return response.json() if ctype.startswith("application/json") else {"text": response.text}
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return {}

    def post_orders(self, *, customer_id, items, **kwargs) -> Dict[str, Any]:
        """
        POST https://example.com/api/orders

        JSON body params:
        - customer_id (required): int - Example: 1
        - items (required): list - Example: [1, 2]
        """
        url = 'https://example.com/api/orders'
        try:
            payload = {'customer_id': customer_id, 'items': items, **kwargs}
            response = self.session.post(url, json=payload, timeout=30)
            response.raise_for_status()
            ctype = response.headers.get("content-type", "")
            return response.json() if ctype.startswith("application/json") else {"text": response.text}
        except requests.exceptions.RequestException as e:
            print(f"Request failed: {e}")
            return {}
```

此外，你還會拿到一份 `(AI).json` 隨身檔，裡面有每一筆捕捉到的 request、endpoint pattern、參數分析、response tree 以及 Postman collection。這份檔案的設計初衷，就是讓你直接丟給 ChatGPT 或任何 LLM，再搭配一句簡單的 prompt，就能讓它生成你想要的產物：

> *「請參考這份 JSON 的資料，寫一個帶有型別定義（typed）的 Python client。auth header 直接照搬，並加上 retry 與 pagination 機制。」*

## 一個下午就能審計完，不必耗費一個 sprint

任何擁有 `<all_urls>` 權限的擴充套件，都值得被嚴格審查一次，這非常合情合理。因此：

- **僅由 8 個檔案、不到 2,000 行純 JavaScript 組成**。沒有打包工具（bundler）、沒有建置步驟（build step），也不需要執行 `npm install`。
- **執行期零外部依賴**。安裝時不會拉進任何額外的套件。
- **符合 Manifest V3 規範，不含任何遠端程式碼**。你載入的，就是實際執行的內容。

在載入使用前，你完全可以在一個下午內把整套原始碼讀完。這樣的信任交易很公平。

## 跟其他工具怎麼比

| | **Eagle Eyes** | DevTools「Copy as cURL」 | Charles / mitmproxy | Postman recorder |
|---|---|---|---|---|
| 安裝體積 | **一個未封裝擴充套件** | 瀏覽器內建 | 系統 proxy + 安裝憑證 | 桌面 App + 外掛 |
| 完整捕捉 request **與** response body | ✅ | 只有 request | ✅ | ✅ |
| 自動偵測 route 模板（`/users/123` → `/users/{id}`） | ✅ | ❌ | ❌ | ❌ |
| 從實際流量推斷必填 vs 選填 | ✅ | ❌ | ❌ | ❌ |
| 產生可執行的 Python 爬蟲 class | ✅ | ❌ | ❌ | ❌ |
| 輸出 Postman collection | ✅ | ❌ | ✅ | ✅ |
| 為 LLM 而生的單一大 JSON | ✅ | ❌ | ❌ | ❌ |
| 安全氣味檢測（HTTP、弱認證、SQLi 線索） | ✅ | ❌ | ❌ | ❌ |
| 讀取 cookie + localStorage + sessionStorage | ✅ | ❌ | 部分 | ❌ |

DevTools 適合逐筆檢視 request；Charles 在分析即時流量時非常強大；Postman 則擅長整理 collection。然而，沒有任何一款工具能像這樣，把你錄下來的 60 筆 request，轉化為一份讓 ChatGPT 或任何 LLM 看完後就能立刻寫出可執行爬蟲的報告。這正是本工具的核心定位。

## AI JSON 裡有什麼

```json
{
  "summary": {
    "total_apis": 42,
    "unique_endpoints": 15,
    "method_distribution": { "GET": 28, "POST": 11, "DELETE": 3 },
    "security_score": { "score": 72, "rating": "B — Good" }
  },
  "analysis": {
    "endpoint_analysis":   { "/api/users/{id}": { ... } },
    "parameter_analysis":  { "/api/users/{id}": { "url_params": {...}, "json_params": {...}, "form_params": {...} } },
    "response_structures": { "JSON tree + extraction paths": ... },
    "detector_analysis":   { "auth": 4, "crm": 12, "financial": 2, ... },
    "security_issues":     [ { "severity": "high", "type": "...", "evidence": ... } ],
    "recommendations":     [ ... ]
  },
  "code_generation": {
    "python_requests_snippets": [...],
    "curl_commands":            [...],
    "complete_scraper_code":    "class EagleEyesScraper: ...",
    "postman_collection":       {...},
    "auth_info":                "Bearer Token, Cookie"
  },
  "raw_requests": [ /* 每筆 request 的完整 headers + body + response */ ]
}
```

配套的 `(HU).txt` 則是同一份資料攤平、轉成適合人類閱讀的版本 —— 包含 endpoint 列表、參數表與安全發現，只要 60 秒就能快速瀏覽完畢。

## 安裝

1. clone 本專案的 repo。
2. 開啟 Chrome / Edge → 進入 `chrome://extensions` → 打開**開發者模式**。
3. 點選「**載入未封裝項目**」，並選擇 `eagle_eyes/` 資料夾。
4. 釘選此擴充套件（選用，固定在工具列後 popup 比較好開）。

本專案無建置步驟、不需執行 `npm install`，也沒有任何原生二進位檔案（binary）。

## 怎麼用

1. 用獨立的瀏覽器 profile 開啟目標網站。
2. 按下 **`Alt+R`** 開始錄製。
3. 像真實使用者一樣操作網站 —— 登入、瀏覽、送出表單、翻頁等等。
4. 再按一次 **`Alt+R`** 停止錄製，兩份報告便會自動下載。

進階技巧：

- **框選 UI 區域** —— 按住 `Alt` 鍵並拖曳滑鼠，即可標記畫面重點；高亮標記會隨著時間軸一同記錄，方便你事後比對每筆 request 分別是由哪個畫面所觸發。
- **自動捕捉** —— 系統會自動監聽並抓取每一筆 `fetch` 與 `XMLHttpRequest`，不需要任何額外設定。

## 分析裡面在做什麼

- **Endpoint 模板擷取** —— 自動將 `/users/123` 與 `/users/456` 收斂歸納為 `/users/{id}`，讓你看到的是 1 筆結構清晰的 endpoint，而不是繁雜的 200 筆。
- **參數推斷** —— 透過跨多個 request 的對比觀察，將每次都出現的欄位標記為「必填」，其餘則歸類為「選填」。
- **回應結構解析** —— 分析每筆 response 的 JSON tree，並提供可直接複製使用的資料擷取路徑（extraction path）。
- **10 種內建 API 分類偵測器** —— 涵蓋 Auth、CRM、Financial、User Management、Reporting、Notification、File Upload、Search、Admin 與 Ticketing。
- **覆蓋率指標** —— 統計呼叫頻率、unique endpoint 數量與 method 分布。
- **安全氣味檢測（7 條規則）** —— 偵測 URL 中的敏感資料、純 HTTP 明文傳輸、缺少認證 header、弱密碼、CORS 設定錯誤、潛在的 SQL injection 樣式，以及敏感資料外洩。最終輸出 A–F 安全分級，並依風險高低排序提供修補建議。

## 程式碼生成

| 輸出格式 | 主要用途 |
|---|---|
| **完整的 `EagleEyesScraper` Python class** | 可直接整合進專案；每個 endpoint 都對應一個 method，並附帶型別參數與 docstring。 |
| **單一 endpoint 的 `requests` 片段** | 方便把特定 endpoint 的請求邏輯複製並貼進現有腳本。 |
| **`curl` 一行指令** | 適合提供給 QA 或維運人員（ops），可直接貼到 shell 終端機執行。 |
| **Postman 2.1 collection** | 可直接匯入 Postman 進行手動測試與探索，或分享給團隊成員。 |

## 誰適合用這個

✅ 你的工作就是對內部或缺乏文件的 API 進行逆向工程
✅ 你常寫爬蟲，想跳過在 DevTools 裡海底撈針的階段
✅ 你需要把資料丟給 LLM，並希望有一份資訊密度極高的 JSON 當作 grounding 依據
✅ 你正在審計自家的應用程式，想快速確認 client side 是否有外洩敏感資料

❌ 你需要的是系統級的 MITM proxy（此時請用 Charles 或 mitmproxy）
❌ 你需要具備團隊帳號的全託管服務（本工具只是一個未封裝的瀏覽器擴充套件）

## 架構（全部就這些）

```
   page (fetch / XHR)
          |
          v
   recorder.js  -->  background.js  -->  analyzer.js   (endpoint / 參數 / response)
                                    -->  detector.js   (10 種分類)
                                    -->  security-analyzer.js  (7 種氣味檢測)
                                    -->  code-generator.js     (python / curl / postman)
                                            |
                                            v
                                    AI JSON  +  Human TXT
```

本工具本質上是一個 Manifest V3 service worker 搭配一個注入頁面的 recorder。每個模組都是獨立檔案，沒有使用任何框架、不含 router，也沒有引入任何狀態管理 library。若想追蹤資料流，建議從 `background.js` 開始讀起。

## 系統需求

- Chrome 或 Edge（支援 Manifest V3）
- 零外部相依 —— 採用純 JavaScript 編寫，不需經過任何編譯步驟

## 安全相關 —— 醜話說在前面

本工具**不會對資料進行任何遮蔽**。在產出的 AI JSON 與 HU TXT 檔案中，都會原封不動地保留密碼、token、cookie 以及 storage 的數值。這是為了讓生成的爬蟲能完全還原當時的 session 而刻意設計的，但請務必注意以下後果：

- 請務必使用**獨立的瀏覽器 profile** 執行，且該環境裡不要登入任何無關的個人帳號。
- 請把輸出檔案當作敏感的憑證（credential）妥善保管。在提供給公開的 LLM 之前，請務必先手動刪除其中的秘密資料。
- 切勿在仍登入他人帳號的 session 中開啟並執行本工具。

內建的安全氣味檢測**僅供參考**，它絕對不會對你擷取到的原始資料做任何更動。

## 免責聲明

本工具僅供合法的 API 逆向分析、內部系統測試及教育用途使用。由於此擴充套件宣告了 `<all_urls>` 的 host 權限，在錄製期間會擷取目前分頁中的每一筆 fetch / XHR、cookie、storage 以及 auth token。使用者須自行負責遵守目標網站的服務條款與相關適用法律。作者對任何不當或違法之使用行為概不負責。

## 版本歷程

詳見 [CHANGELOG.md](CHANGELOG.md)。

## 授權

MIT —— 詳見 [LICENSE](LICENSE)。
