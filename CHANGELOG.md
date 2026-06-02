# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [2.4.0] - 2026-05-31

### Added
- **Path-aware scraper generation** (`code-generator.js`): `generateCompleteScraper` now turns endpoint placeholders into named method parameters — `GET /api/users/{id}` becomes `def get_users(self, id, **kwargs)` with an f-string URL (`f'.../users/{id}'`), and JSON body fields become keyword-only params assembled into the payload. The `__main__` demo call passes a real recovered example value. Previously every method was `def x(self, **kwargs)` with a hard-coded URL — the README headline example was aspirational; now it is the actual output (verified by `python -m py_compile`).
- **Unit tests** (`test/`, run via `node --test`): cover endpoint-pattern extraction, required/optional param inference, JSON-body parsing, and the new path-aware scraper generation. Wired into `npm test` and CI.
- **Guarded `module.exports`** in `analyzer.js`, `detector.js`, `code-generator.js`, `security-analyzer.js` so the Node test harness can import them; a no-op in the service-worker / content-script runtime.

### Changed
- **`code-generator.js` `generateMethodName`** strips scheme + host before deriving a method name, so names come from the path (`get_users`) not the domain.
- **README / README.zh-TW**: corrected the headline scraper example to match real output; fixed the AI-JSON schema snippet (`parameter_analysis` is keyed per-endpoint with `url_params`/`json_params`/`form_params`; `security_score` uses `rating`, not `grade`).
- **`manifest.json`**: clearer store description focused on the scraper / Postman / LLM-JSON output.

### Removed
- **`manifest.json` `webRequest` permission** — declared but never used anywhere in the code. Dropping it shrinks the permission surface for an `<all_urls>` extension and removes a needless review-time red flag. Disclaimer text in both READMEs updated to match.
- **`detector.js`**: dropped 4 never-called methods (`addCustomDetector`, `getDetectorInfo`, `getAllDetectorNames`, `getAllDetectors`) and inlined `shouldCapture` into `detectApiType` to avoid the per-call indirection.
- **`security-analyzer.js`**: dropped `analyzeTokenSecurity` and `generateSecurityReport` — neither was wired into the export pipeline. Removed the `tokenIssues` parameter from `calculateSecurityScore` and `generateSecurityRecommendations` (every caller passed `[]`).
- **`module.exports` blocks** at the end of `analyzer.js`, `detector.js`, `code-generator.js`, `security-analyzer.js` — dead in both service-worker and content-script contexts; there is no Node test harness.

### Changed
- **`analyzer.js`** trusts the canonical `req.endpoint_pattern` and `req.parsed_data` set by `background.js` and no longer recomputes them via `||` fallback in 5+ call sites. `analyzeParameterPatterns` previously re-parsed the body on every call — now reads the cache.
- **`code-generator.js`**: same change — uses cached `endpoint_pattern` consistently. Removed `dedupeByEndpoint` from the public `CodeGenerator` surface (now module-private). Cleaned two noise comments (`# API request code`, `# Example usage`) that were being emitted into every generated Python snippet / scraper.
- **`security-analyzer.js`** `detectSecurityIssues`: builds a single lower-cased header map per request and reuses it for both the missing-auth-header and CORS checks instead of two separate scans.
- **`analyzer.js`** `analyzeAuthMethods`: lowered-key lookup uses a `Set` instead of `Array.includes`.
- **`recorder.js`** fetch hook: avoids the redundant `clone.json()` + `JSON.stringify(json)` round-trip — reads `text()` once, parses it for sensitive-field extraction, stores the original string verbatim.
- **`popup.html`**: extracted the repeated inline styles (`font-weight: bold; margin-bottom: 6px`, list paddings, `color: #94a3b8`) into `.section-title`, `.muted`, `.accent`, `.row-inline` utility classes.

### Fixed
- **`recorder.js`** status-indicator DOM leak: the existence check used `document.body.contains`, but the indicator is appended to `document.documentElement`. After a SPA route change re-rendered `body`, the check returned false and a duplicate indicator was appended on every navigation. Now checks the correct parent.

## [2.3.0] - 2026-05-03

### Fixed
- **`background.js` `chrome.tabs.onActivated`**: previously called `tryInject(tabId)` without a URL, so `isInjectable(undefined)` was always false and the listener was a silent no-op. Now fetches the tab via `chrome.tabs.get` and passes the URL through.
- **`code-generator.js` Python / curl string escaping**: header values, URLs, and request bodies were only escaping single quotes (Python) or nothing at all (curl). Values containing `\`, newlines, tabs, or single quotes produced invalid Python or shell-injectable curl. Added `escapePythonSingleQuoted` (backslash → `\\`, then `'` → `\'`, plus `\r` `\n` `\t`) and `escapeShellSingleQuoted` (`'` → `'\''`). Also switched the Python scraper's `url = "..."` to single-quoted so URLs containing `"` no longer break the literal.
- **`recorder.js` Alt+R race condition**: the hotkey used to send `toggle-recording` *before* the corresponding `record-event`. On the stop edge, that meant the marker landed in a buffer the toggle had already flushed. Reversed the order — record-event now lands first, then toggle.

### Changed
- **Sensitive-field regex extracted to `sensitive-patterns.js`**: `recorder.js` and `background.js` previously kept two near-identical copies of the credential-detection regex. They are now loaded from a single shared module (via `importScripts` for the service worker, and as the first content script via `manifest.json` for the page side). Edit once, both sides update.

## [2.2.0] - 2026-05-03

### Added
- **Export status surfaced in popup** — last export's success or failure is now shown at the top of the popup with a coloured banner, plus a `!` badge on the toolbar icon when an export fails. Status is persisted in `chrome.storage.local`.
- **Editable SVG icon sources** in `icons/source/` (`eye.svg` for idle, `eye_red.svg` for recording) plus a README explaining how to re-export the PNGs with ImageMagick or Inkscape.
- **ESLint** with `.eslintrc.json` + `package.json` (`npm run lint`); CI now runs lint on every push.
- **Stronger `.gitignore`**: covers `node_modules/`, IDE folders, OS junk (`.DS_Store`, `Thumbs.db`, `desktop.ini`), build artifacts (`dist/`, `*.zip`, `*.crx`, `*.pem`), env files, and per-user temp.

### Changed
- **Unified `apiRequest` schema** in `background.js` — removed the duplicated `postData` / `body` aliases (only `request_body` remains); removed `time` (only `timestamp` remains); removed dead fallbacks. All downstream consumers (`analyzer.js`, `security-analyzer.js`, `code-generator.js`) updated to read the canonical field names. **AI JSON `raw_requests[]` schema is now flatter and ~20% smaller per request.**
- **`recorder.js`** now sends `url` and `method` as explicit payload fields instead of forcing `background.js` to parse them out of the `summary` string.
- **`code-generator.js` deduplication** — `generatePythonRequestsCode`, `generateCurlCommands`, and `generateCompleteScraper` now group requests by `endpoint_pattern + method` before emitting code. A session with 100 calls to the same endpoint now produces 1 snippet / curl / scraper method, not 100. Removed the hard-coded `slice(0, 5)` cap on the scraper class.
- **`analyzer.js` endpoint pattern extraction** broadened — now recognises ISO dates (`2024-01-15` → `{date}`), long hex tokens (`{hex}`), and base64-style slugs of 20+ chars (`{token}`), in addition to the existing numeric ID and UUID patterns. Result: more accurate de-duplication of dynamic URLs.

## [2.1.0] - 2026-05-03

### Removed
- Dead `report-generator.js` HTML report module — its output was generated but never written to disk.

### Fixed
- `code-generator.js` `extractAuthInfo`: removed duplicated `x-api-key` check; all header lookups are now case-insensitive via a normalised lowercase map.
- `security-analyzer.js` weak-password detection: previously fired on any payload substring containing `password`, `admin`, etc. (huge false-positive rate). Now only fires when a JSON / form field whose key is `password` / `pwd` / `passwd` / `pass` actually has a weak value.
- `background.js` hard-coded `Asia/Taipei` timezone in the human-readable report — now uses the user's locale and timezone.
- `popup.html` typos: `Security issuesdetection` → `Security issue detection`, `Extensionidle` → `Extension idle`. `lang` attribute updated to match the (English) content.

### Changed
- README clarified: this tool **does not** mask sensitive fields (the previous claim was false). Both AI JSON and HU TXT contain raw passwords/tokens by design — added warning banner in both READMEs.
- Removed all references to the deleted HTML report from README, README.zh-TW, and the file-layout diagram.

## [2.0.0] - 2026-05-03

### Added
- Public release of the Eagle Eyes Chrome extension.
- Two-file export model: AI JSON (full data) and human-readable TXT.
- Real-time API counter overlay during recording.
- Full request / response body capture.
- localStorage / sessionStorage / cookie capture.
- 10 built-in API category detectors (generic Ticketing, CRM, Financial, Auth, etc.).
- Full security analyser with scoring system and 7 detection rules.
- Code generation: Python `requests`, `curl`, full scraper class, Postman collection.
- CI workflow validating `manifest.json` and JS syntax.

### Changed
- Replaced the vendor-specific ticketing detector with a generic `ticketing` detector — adapt `detector.js` for your target system.
