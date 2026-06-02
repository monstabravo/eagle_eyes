# Eagle Eyes — API Analyzer

**Press `Alt+R`, browse a website, press `Alt+R` again. Get a working Python scraper of its private API.**

[![CI](https://github.com/monstabravo/eagle_eyes/actions/workflows/ci.yml/badge.svg)](https://github.com/monstabravo/eagle_eyes/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Manifest V3](https://img.shields.io/badge/Chrome-Manifest%20V3-blue.svg)](manifest.json)
[![Zero deps](https://img.shields.io/badge/runtime%20deps-0-success)](#system-requirements)
[![Pure JS](https://img.shields.io/badge/build-none%20(pure%20JS)-brightgreen)](#system-requirements)

> [繁體中文](README.zh-TW.md) ・ English

---

> ⚠️ **This tool captures full raw data — passwords, tokens, cookies, storage values — with no masking.** That is by design: the goal is full reproducibility for scraper / parser generation. Run it only in an isolated browser profile, against systems you are authorised to test.

---

## What you get back

Record a session, get a clean Python scraper class — generated, not scaffolded:

```python
# Actual generated output (base headers trimmed for brevity).
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

Plus a sidecar `(AI).json` with every captured request, endpoint patterns, parameter analysis, response trees and a Postman collection — designed to be dropped into Claude / GPT with a one-line prompt:

> *"Use the data in this JSON to write a typed Python client for this API. Use the auth headers as-is. Add retries and pagination."*

## Auditable in an afternoon, not a sprint

Every browser extension with `<all_urls>` permissions is, fairly, a trust ask. So:

- **Under 2,000 lines of plain JavaScript** across 8 files. No bundler, no build step, no `npm install`.
- **Zero external runtime dependencies.** Nothing pulled at install time.
- **Manifest V3, no remote code.** What you load is what runs.

You can read the whole thing in an afternoon before you load it. That's the deal.

## How it compares

| | **Eagle Eyes** | DevTools "Copy as cURL" | Charles / mitmproxy | Postman recorder |
|---|---|---|---|---|
| Install footprint | **One unpacked extension** | built-in | system proxy + cert install | desktop app + plugin |
| Captures full raw request **and** response body | ✅ | request only | ✅ | ✅ |
| Auto-detects route templates (`/users/123` → `/users/{id}`) | ✅ | ❌ | ❌ | ❌ |
| Infers required vs. optional params from real traffic | ✅ | ❌ | ❌ | ❌ |
| Generates a runnable Python scraper class | ✅ | ❌ | ❌ | ❌ |
| Exports a Postman collection | ✅ | ❌ | ✅ | ✅ |
| Built for LLM consumption (one big JSON) | ✅ | ❌ | ❌ | ❌ |
| Security smell-check (HTTP, weak auth, SQLi hints) | ✅ | ❌ | ❌ | ❌ |
| Extracts cookies + localStorage + sessionStorage | ✅ | ❌ | partial | ❌ |

DevTools shows you each request. Charles is great at watching live traffic. Postman organises collections. None of them turn 60 captured requests into one report that an LLM can read and write you a working scraper from. That's the gap this fills.

## What's in the AI JSON

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
  "raw_requests": [ /* every request with full headers + body + response */ ]
}
```

The companion `(HU).txt` is the same data flattened for human eyes — endpoint list, parameter table, security findings, in 60 seconds of skim.

## Install

1. Clone this repo
2. Chrome / Edge → `chrome://extensions` → toggle **Developer mode**
3. Click **Load unpacked** and pick the `eagle_eyes/` folder
4. Pin the extension (optional, makes the popup easier to reach)

No build step, no `npm install`, no native binary.

## Use it

1. Open the target site (preferably in an isolated browser profile)
2. Press **`Alt+R`** to start recording
3. Drive the site like a real user — log in, navigate, submit forms, paginate
4. Press **`Alt+R`** again to stop and download both reports

Tips:

- **Highlight UI regions** — hold `Alt` and drag to mark areas of interest; the highlight is recorded with the timeline so you remember which screen each request came from.
- **Auto-capture** — every `fetch` / `XMLHttpRequest` is captured with no extra setup.

## What's inside the analysis

- **Endpoint pattern extraction** — `/users/123` and `/users/456` collapse to `/users/{id}` so you see one row, not 200.
- **Parameter inference** — observed across requests, marks fields as required (always present) vs. optional.
- **Response structure parsing** — JSON-tree of every response, plus extraction paths you can copy.
- **10 built-in API category detectors** — Auth, CRM, Financial, User Management, Reporting, Notification, File Upload, Search, Admin, Ticketing.
- **Coverage metrics** — call frequency, unique endpoint count, method distribution.
- **Security smell-check (7 rules)** — sensitive data in URL, plain HTTP, missing auth headers, weak passwords, CORS misconfig, possible SQL injection patterns, sensitive data leaks. Outputs an A–F grade with prioritised fixes.

## Code generation

| Output | Use case |
|---|---|
| **Full `EagleEyesScraper` Python class** | Drop into a project; methods generated per endpoint, with type-annotated params and docstrings |
| **Per-endpoint `requests` snippet** | Copy a single endpoint into an existing script |
| **`curl` one-liners** | Hand to QA / ops, paste into shell |
| **Postman 2.1 collection** | Import for manual exploration / sharing with the team |

## Who this is for

✅ You reverse-engineer internal / undocumented APIs as part of your job
✅ You build scrapers and want to skip the "DevTools fishing" stage
✅ You feed code to an LLM and want a single rich JSON to ground it
✅ You audit your own apps and want a quick read on what's leaking client-side

❌ You need a system-wide MITM proxy (use Charles / mitmproxy)
❌ You want a fully-managed service with team accounts (this is just an unpacked extension)

## Architecture (everything that exists)

```
   page (fetch / XHR)
          |
          v
   recorder.js  -->  background.js  -->  analyzer.js   (endpoints / params / response)
                                    -->  detector.js   (10 category labels)
                                    -->  security-analyzer.js  (7 smell checks)
                                    -->  code-generator.js     (python / curl / postman)
                                            |
                                            v
                                    AI JSON  +  Human TXT
```

It's a Manifest V3 service worker plus an injected recorder. Each module is one file. No framework, no router, no state management library. Open `background.js` first if you want to follow the data flow.

## System requirements

- Chrome or Edge (Manifest V3)
- No additional dependencies — pure JavaScript, no compilation step

## A blunt note on security

This tool **does not mask anything**. The AI JSON and human TXT contain raw passwords, tokens, cookies, and storage values verbatim. That's deliberate — generated scrapers need to reproduce the exact session — but it has consequences:

- Run it in a **dedicated browser profile** with nothing else logged in.
- Treat the output files like credentials. Don't paste them into a public LLM unless you've stripped the secrets first.
- Don't enable it on a session that has other people's accounts open.

The built-in security smell-check is informational only — it does **not** redact anything from the captured data.

## Disclaimer

For legitimate API reverse-engineering, internal-system testing, and educational use only. Because this extension declares `<all_urls>` host permissions, while recording it captures every fetch / XHR, cookie, storage value, and auth token in the active tab. You are responsible for complying with the target site's terms of service and applicable law. The author assumes no liability for misuse.

## Version history

See [CHANGELOG.md](CHANGELOG.md).

## License

MIT — see [LICENSE](LICENSE).
