(() => {
  if (window.__eye_recorder__) return;
  window.__eye_recorder__ = true;

  // Patterns are defined in sensitive-patterns.js (loaded as a content script
  // before this one). Edit there — both background.js and recorder.js use the
  // same source.
  const PATTERNS = (typeof window !== 'undefined' && window.EAGLE_EYES_PATTERNS) ||
                   (typeof globalThis !== 'undefined' && globalThis.EAGLE_EYES_PATTERNS) || {};
  const REQUEST_SENSITIVE_RE = PATTERNS.REQUEST_SENSITIVE_RE;
  const RESPONSE_SENSITIVE_RE = PATTERNS.RESPONSE_SENSITIVE_RE;
  const STORAGE_KEY_RE = PATTERNS.STORAGE_KEY_RE;
  const STORAGE_SET_RE = PATTERNS.STORAGE_SET_RE;
  const COOKIE_RE = PATTERNS.COOKIE_RE;

  let isAlt = false;
  let selecting = false;
  let box = null;
  let sx = 0, sy = 0, cx = 0, cy = 0;

  let statusIndicator = null;
  let apiCount = 0;

  function send(msg) {
    try { chrome.runtime.sendMessage(msg); } catch (_) {}
  }

  function loc() {
    try {
      return { href: location.href, title: document.title || '' };
    } catch (_) {
      return { href: '', title: '' };
    }
  }

  // Walks an object and collects key/value pairs whose keys match `re`,
  // using dotted paths so nested matches are not overwritten.
  function extractSensitiveFields(obj, re) {
    const result = {};
    function walk(node, path) {
      if (!node || typeof node !== 'object') return;
      Object.entries(node).forEach(([k, v]) => {
        const fullPath = path ? `${path}.${k}` : k;
        if (re.test(k)) result[fullPath] = v;
        if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, fullPath);
      });
    }
    walk(obj, '');
    return Object.keys(result).length === 0 ? null : result;
  }

  function parseBodyForSensitive(bodyStr, re) {
    try {
      return extractSensitiveFields(JSON.parse(bodyStr), re);
    } catch (_) {
      return null;
    }
  }

  function fetchHeadersToObject(headers) {
    const out = {};
    if (!headers) return out;
    try {
      if (headers instanceof Headers) {
        headers.forEach((v, k) => { out[k] = v; });
      } else if (typeof headers === 'object') {
        Object.entries(headers).forEach(([k, v]) => { out[k] = v; });
      }
    } catch (_) {}
    return out;
  }

  function parseXhrResponseHeaders(headerStr) {
    const out = {};
    if (!headerStr) return out;
    headerStr.split('\r\n').forEach(line => {
      const parts = line.split(': ');
      if (parts.length === 2) out[parts[0]] = parts[1];
    });
    return out;
  }

  function responseHeadersToObject(resHeaders) {
    const out = {};
    resHeaders.forEach((v, k) => { out[k] = v; });
    return out;
  }

  function createStatusIndicator() {
    if (statusIndicator && document.documentElement.contains(statusIndicator)) return;
    statusIndicator = document.createElement('div');
    statusIndicator.style.cssText = `
      position: fixed;
      top: 10px;
      right: 10px;
      background: rgba(17, 24, 39, 0.95);
      color: #10b981;
      padding: 8px 12px;
      border-radius: 8px;
      font-family: monospace;
      font-size: 12px;
      z-index: 2147483646;
      display: none;
      border: 1px solid #10b981;
      box-shadow: 0 4px 6px rgba(0, 0, 0, 0.3);
    `;
    statusIndicator.innerHTML = '🦅 Recording: <span id="api-count">0</span> APIs';
    document.documentElement.appendChild(statusIndicator);
  }

  function setStatusIndicatorVisible(visible) {
    if (visible) createStatusIndicator();
    if (!statusIndicator) return;
    statusIndicator.style.display = visible ? 'block' : 'none';
    if (!visible) apiCount = 0;
  }

  function updateApiCount() {
    apiCount++;
    if (!statusIndicator) return;
    const countSpan = statusIndicator.querySelector('#api-count');
    if (countSpan) countSpan.textContent = apiCount;
  }

  function captureFilteredStorage(store) {
    const out = {};
    try {
      for (let i = 0; i < store.length; i++) {
        const key = store.key(i);
        if (STORAGE_KEY_RE.test(key)) out[key] = store.getItem(key);
      }
    } catch (_) {}
    return out;
  }

  function captureStorageData() {
    return {
      localStorage: captureFilteredStorage(localStorage),
      sessionStorage: captureFilteredStorage(sessionStorage),
      cookies: document.cookie
    };
  }

  function ensureBox() {
    if (box && document.body.contains(box)) return;
    box = document.createElement('div');
    Object.assign(box.style, {
      position: 'fixed',
      border: '2px dashed #3b82f6',
      background: 'rgba(59,130,246,0.08)',
      display: 'none',
      zIndex: '2147483647',
      pointerEvents: 'none',
      boxSizing: 'border-box',
      width: '0',
      height: '0',
      left: '0',
      top: '0'
    });
    document.documentElement.appendChild(box);
  }

  function draw() {
    if (!box) return;
    box.style.left = Math.min(sx, cx) + 'px';
    box.style.top = Math.min(sy, cy) + 'px';
    box.style.width = Math.abs(cx - sx) + 'px';
    box.style.height = Math.abs(cy - sy) + 'px';
  }

  function end() {
    if (!selecting) return;
    selecting = false;
    if (box) box.style.display = 'none';
    const rect = {
      left: Math.min(sx, cx),
      top: Math.min(sy, cy),
      width: Math.abs(cx - sx),
      height: Math.abs(cy - sy)
    };
    if (rect.width >= 4 && rect.height >= 4) {
      send({
        action: 'record-highlight',
        rect,
        note: `blue highlight ${Math.round(rect.width)}x${Math.round(rect.height)}`
      });
    }
  }

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Alt') isAlt = true;
    if (e.altKey && (e.key === 'r' || e.key === 'R')) {
      e.preventDefault();
      // Send the hotkey record-event FIRST so it lands in the buffer that the
      // upcoming toggle-recording is about to flush. Reverse order would race
      // with the stop-side flush and could drop the hotkey marker.
      send({
        action: 'record-event',
        payload: {
          type: 'hotkey',
          summary: 'Alt+R',
          page: loc(),
          storageData: captureStorageData()
        }
      });
      send({ action: 'toggle-recording' });
    }
  }, true);

  document.addEventListener('keyup', (e) => {
    if (e.key === 'Alt') {
      isAlt = false;
      end();
    }
  }, true);

  document.addEventListener('mousedown', (e) => {
    if (!isAlt || e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    ensureBox();
    selecting = true;
    sx = e.clientX;
    sy = e.clientY;
    cx = sx;
    cy = sy;
    box.style.display = 'block';
    draw();
  }, true);

  document.addEventListener('mousemove', (e) => {
    if (!selecting) return;
    e.preventDefault();
    e.stopPropagation();
    cx = e.clientX;
    cy = e.clientY;
    draw();
  }, true);

  document.addEventListener('mouseup', (e) => {
    if (!selecting) return;
    e.preventDefault();
    e.stopPropagation();
    end();
  }, true);

  document.addEventListener('submit', (e) => {
    try {
      const fd = {};
      new FormData(e.target).forEach((v, k) => {
        fd[k] = typeof v === 'string' ? v : '[binary]';
      });
      send({
        action: 'record-event',
        payload: { type: 'form-submit', summary: 'form submit', formData: fd, page: loc() }
      });
    } catch (_) {}
  }, true);

  chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
    if (req.action === 'recording-started') {
      setStatusIndicatorVisible(true);
      sendResponse({ ok: true });
    } else if (req.action === 'recording-stopped') {
      setStatusIndicatorVisible(false);
      sendResponse({ ok: true });
    }
    return true;
  });

  // The `finally` block guarantees we record the request even if the response
  // throws (network error, abort, etc.) — otherwise failed requests would be
  // invisible in the export.
  try {
    const of = window.fetch;
    window.fetch = async function (input, init) {
      const m = (init && init.method) || 'GET';
      const u = typeof input === 'string' ? input : (input && input.url) || '';
      const headers = fetchHeadersToObject(init && init.headers);

      let requestBody = null;
      let requestData = null;
      if (init && init.body && typeof init.body === 'string') {
        requestBody = init.body;
        requestData = parseBodyForSensitive(init.body, REQUEST_SENSITIVE_RE);
      }

      let r;
      let s = 0;
      let responseBody = null;
      let responseData = null;
      let responseHeaders = {};

      try {
        r = await of.apply(this, arguments);
        s = r.status;

        try {
          const clone = r.clone();
          responseHeaders = responseHeadersToObject(clone.headers);
          const contentType = clone.headers.get('content-type') || '';
          if (contentType.includes('application/json')) {
            responseBody = await clone.text();
            try {
              responseData = extractSensitiveFields(JSON.parse(responseBody), RESPONSE_SENSITIVE_RE);
            } catch (_) {}
          } else if (contentType.includes('text/')) {
            responseBody = await clone.text();
          }
        } catch (_) {}

        updateApiCount();
        return r;
      } finally {
        send({
          action: 'record-event',
          payload: {
            type: 'fetch',
            url: u,
            method: m,
            summary: `${m} ${u} -> ${s}`,
            page: loc(),
            headers,
            requestBody,
            requestData,
            responseStatus: s,
            responseHeaders,
            responseBody,
            responseData,
            timestamp: new Date().toISOString()
          }
        });
      }
    };
  } catch (_) {}

  try {
    const O = window.XMLHttpRequest;
    window.XMLHttpRequest = function () {
      const x = new O();
      let m = 'GET';
      let u = '';
      const requestHeaders = {};
      let requestBody = null;
      let requestData = null;

      const oo = x.open;
      x.open = function (mm, uu) {
        m = mm || 'GET';
        u = uu || '';
        return oo.apply(x, arguments);
      };

      const originalSetRequestHeader = x.setRequestHeader;
      x.setRequestHeader = function (header, value) {
        requestHeaders[header] = value;
        return originalSetRequestHeader.apply(x, arguments);
      };

      const originalSend = x.send;
      x.send = function (data) {
        if (typeof data === 'string') {
          requestBody = data;
          if (data.startsWith('{') || data.startsWith('[')) {
            requestData = parseBodyForSensitive(data, REQUEST_SENSITIVE_RE);
          }
        }
        return originalSend.apply(x, arguments);
      };

      x.addEventListener('loadend', function () {
        let responseBody = null;
        let responseData = null;
        let responseHeaders = {};

        try {
          responseHeaders = parseXhrResponseHeaders(x.getAllResponseHeaders());
          if (x.responseType === '' || x.responseType === 'text') {
            const contentType = x.getResponseHeader('content-type') || '';
            responseBody = x.responseText;
            if (contentType.includes('application/json') && responseBody) {
              responseData = parseBodyForSensitive(responseBody, RESPONSE_SENSITIVE_RE);
            }
          }
        } catch (_) {}

        updateApiCount();
        send({
          action: 'record-event',
          payload: {
            type: 'xhr',
            url: u,
            method: m,
            summary: `${m} ${u} -> ${x.status}`,
            page: loc(),
            headers: requestHeaders,
            requestBody,
            requestData,
            responseStatus: x.status,
            responseHeaders,
            responseBody,
            responseData,
            timestamp: new Date().toISOString()
          }
        });
      });

      return x;
    };
  } catch (_) {}

  try {
    const originalSetItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (STORAGE_SET_RE.test(key)) {
        const storeType = this === localStorage ? 'localStorage' : 'sessionStorage';
        send({
          action: 'record-event',
          payload: {
            type: 'storage',
            summary: `${storeType} set: ${key}`,
            page: loc(),
            storage: { type: storeType, key, value }
          }
        });
      }
      return originalSetItem.apply(this, arguments);
    };
  } catch (_) {}

  try {
    const originalCookie = Object.getOwnPropertyDescriptor(Document.prototype, 'cookie');
    Object.defineProperty(document, 'cookie', {
      get: function () {
        return originalCookie.get.call(this);
      },
      set: function (value) {
        const cookieParts = value.split(';')[0].split('=');
        const cookieName = cookieParts[0].trim();
        const cookieValue = cookieParts.slice(1).join('=');
        if (COOKIE_RE.test(cookieName)) {
          send({
            action: 'record-event',
            payload: {
              type: 'cookie',
              summary: `Cookie set: ${cookieName}`,
              page: loc(),
              cookie: { name: cookieName, value: cookieValue }
            }
          });
        }
        return originalCookie.set.call(this, value);
      },
      enumerable: true,
      configurable: true
    });
  } catch (_) {}
})();
