importScripts('sensitive-patterns.js', 'analyzer.js', 'detector.js', 'code-generator.js', 'security-analyzer.js');

const RecordingStatus = { OFF: 'off', IDLE: 'idle', ON: 'on' };

const ICONS_DEFAULT = {
  "16": "icons/icon16.png",
  "32": "icons/icon32.png",
  "48": "icons/icon48.png",
  "128": "icons/icon128.png"
};
const ICONS_RECORDING = {
  "16": "icons/icon16_red.png",
  "32": "icons/icon32_red.png",
  "48": "icons/icon48_red.png",
  "128": "icons/icon128_red.png"
};

let extensionEnabled = true;
let recording = false;
let sessionId = null;
const perTabBuffers = new Map();

function getStatus() {
  if (!extensionEnabled) return RecordingStatus.OFF;
  return recording ? RecordingStatus.ON : RecordingStatus.IDLE;
}
function nowIso() { return new Date().toISOString(); }

function setBadge() {
  const s = getStatus();
  chrome.action.setBadgeText({ text: '' });
  chrome.action.setIcon({ path: s === RecordingStatus.ON ? ICONS_RECORDING : ICONS_DEFAULT });
  const title = s === RecordingStatus.ON ? 'recording' : (s === RecordingStatus.OFF ? 'disabled' : 'idle');
  chrome.action.setTitle({ title });
}

function ensureTabBuffer(tabId) {
  if (!perTabBuffers.has(tabId)) {
    perTabBuffers.set(tabId, { events: [], highlights: [], api_requests: [] });
  }
  return perTabBuffers.get(tabId);
}

function notifyAllTabs(action) {
  chrome.tabs.query({}, (tabs) => {
    tabs.forEach(tab => {
      if (tab.id && tab.url && (tab.url.startsWith('http://') || tab.url.startsWith('https://'))) {
        chrome.tabs.sendMessage(tab.id, { action }).catch(() => {});
      }
    });
  });
}

function startSession() {
  recording = true;
  sessionId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  perTabBuffers.clear();
  setBadge();
  console.log('[Eagle Eyes] recording session started:', sessionId);
  notifyAllTabs('recording-started');
}

// FileReader is used because Blob.text()/URL.createObjectURL aren't available
// for chrome.downloads.download in MV3 service workers across all Chrome versions.
function blobToDataUrl(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

async function stopSessionAndExport() {
  recording = false;
  setBadge();
  notifyAllTabs('recording-stopped');

  const exportTime = new Date();
  const mmdd = String(exportTime.getMonth() + 1).padStart(2, '0') + String(exportTime.getDate()).padStart(2, '0');

  try {
    const urlMap = new Map();
    const tabs = await chrome.tabs.query({});
    tabs.forEach(t => { if (t.id && t.url) urlMap.set(t.id, t.url); });

    const allApiRequests = [];
    for (const data of perTabBuffers.values()) {
      allApiRequests.push(...data.api_requests);
    }

    console.log(`[Eagle Eyes] total captured ${allApiRequests.length} API requests`);

    allApiRequests.forEach(req => {
      req.endpoint_pattern = APIAnalyzer.extractEndpointPattern(req.url);
      req.parsed_data = APIAnalyzer.parseRequestData(req);
    });

    const paramAnalysis = APIAnalyzer.analyzeRequestParameters(allApiRequests);
    const responseStructures = APIAnalyzer.analyzeResponseStructure(allApiRequests);
    const apiDocs = APIAnalyzer.generateApiDocumentation(allApiRequests);
    const apiCoverage = APIAnalyzer.calculateApiCoverage(allApiRequests);
    const apiPatterns = APIAnalyzer.analyzeApiPatterns(allApiRequests);
    const detectorAnalysis = APIDetectors.categorizeRequests(allApiRequests);
    const securityIssues = SecurityAnalyzer.detectSecurityIssues(allApiRequests);
    const securityScore = SecurityAnalyzer.calculateSecurityScore(securityIssues);
    const pythonCodes = CodeGenerator.generatePythonRequestsCode(allApiRequests);
    const curlCommands = CodeGenerator.generateCurlCommands(allApiRequests);
    const authInfo = CodeGenerator.extractAuthInfo(allApiRequests);
    const completeScraper = CodeGenerator.generateCompleteScraper(allApiRequests, 'eagle_eyes_scraper', paramAnalysis, authInfo);
    const postmanCollection = CodeGenerator.exportPostmanCollection(allApiRequests, 'Eagle Eyes API Collection');
    const recommendations = SecurityAnalyzer.generateSecurityRecommendations(securityIssues, []);

    const aiPayload = {
      sessionId,
      exportedAt: exportTime.toISOString(),
      summary: {
        total_apis: allApiRequests.length,
        unique_endpoints: Object.keys(apiDocs).length,
        api_coverage: apiCoverage,
        security_issues: securityIssues.length,
        security_score: securityScore
      },
      tabs: [],
      analysis: {
        endpoint_analysis: apiDocs,
        parameter_analysis: paramAnalysis,
        response_structures: responseStructures,
        api_patterns: apiPatterns,
        detector_analysis: detectorAnalysis,
        security_issues: securityIssues,
        security_score: securityScore,
        recommendations
      },
      code_generation: {
        python_requests_snippets: pythonCodes,
        curl_commands: curlCommands,
        complete_scraper_code: completeScraper,
        postman_collection: postmanCollection,
        auth_info: authInfo
      },
      raw_requests: allApiRequests
    };

    for (const [tabId, data] of perTabBuffers.entries()) {
      aiPayload.tabs.push({
        tabId,
        url: urlMap.get(tabId) || '(unknown)',
        events: data.events,
        highlights: data.highlights,
        api_requests: data.api_requests
      });
    }

    let humanText = `=== Eagle Eyes API Analysis Report ===\n`;
    humanText += `Generated: ${exportTime.toLocaleString()}\n`;
    humanText += `Session ID: ${sessionId}\n\n`;

    humanText += `[Summary]\n`;
    humanText += `- Total requests: ${aiPayload.summary.total_apis}\n`;
    humanText += `- Unique endpoints: ${aiPayload.summary.unique_endpoints}\n`;
    const methodStr = Object.entries(apiCoverage.method_distribution || {}).map(([m, c]) => `${m} (${c})`).join(', ');
    if (methodStr) humanText += `- HTTP methods: ${methodStr}\n`;
    humanText += `- Security score: ${securityScore.score}/100 (${securityScore.rating})\n`;
    humanText += `- Security issues: ${securityIssues.length}\n\n`;

    if (Object.keys(detectorAnalysis).length > 0) {
      humanText += `[API Categories]\n`;
      Object.values(detectorAnalysis).forEach(detector => {
        if (detector.detected_count > 0) {
          humanText += `- ${detector.name}: ${detector.detected_count} requests\n`;
        }
      });
      humanText += `\n`;
    }

    humanText += `[API Endpoints]\n\n`;
    let endpointIndex = 1;
    Object.entries(apiDocs).forEach(([endpoint, data]) => {
      humanText += `${endpointIndex}. ${data.methods.join(', ')} ${endpoint}\n`;
      humanText += `   - Request count: ${data.frequency}\n`;

      const params = paramAnalysis[endpoint];
      if (params) {
        const urlParams = Object.keys(params.url_params || {});
        const jsonParams = Object.keys(params.json_params || {});
        const formParams = Object.keys(params.form_params || {});
        if (urlParams.length > 0) humanText += `   - URL params: ${urlParams.join(', ')}\n`;
        if (jsonParams.length > 0) humanText += `   - JSON params: ${jsonParams.join(', ')}\n`;
        if (formParams.length > 0) humanText += `   - Form params: ${formParams.join(', ')}\n`;
      }

      if (data.response_types && data.response_types.length > 0) {
        humanText += `   - Response type: ${data.response_types.join(', ')}\n`;
      }
      if (data.examples && data.examples.length > 0) {
        humanText += `   - Example: ${data.examples[0].url}\n`;
      }

      humanText += `\n`;
      endpointIndex++;
    });

    if (securityIssues.length > 0) {
      humanText += `【Security issues】\n`;
      const bySeverity = { high: [], medium: [], low: [] };
      securityIssues.forEach(i => { if (bySeverity[i.severity]) bySeverity[i.severity].push(i); });

      if (bySeverity.high.length > 0) {
        humanText += `\n⚠️ High severity (${bySeverity.high.length}):\n`;
        bySeverity.high.forEach(issue => {
          humanText += `- ${issue.description}\n  ${issue.method} ${issue.url}\n`;
        });
      }
      if (bySeverity.medium.length > 0) {
        humanText += `\n⚠️ Medium severity (${bySeverity.medium.length}):\n`;
        bySeverity.medium.forEach(issue => {
          humanText += `- ${issue.description}\n  ${issue.method} ${issue.url}\n`;
        });
      }
      if (bySeverity.low.length > 0) {
        humanText += `\nℹ️ Low severity (${bySeverity.low.length}):\n`;
        bySeverity.low.forEach(issue => {
          humanText += `- ${issue.description}\n`;
        });
      }
      humanText += `\n`;
    }

    if (recommendations.length > 0) {
      humanText += `[Recommendations]\n`;
      recommendations.forEach((rec, idx) => {
        humanText += `${idx + 1}. [${rec.priority.toUpperCase()}] ${rec.title}\n   ${rec.description}\n\n`;
      });
    }

    let mainUrl = 'session';
    try {
      const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (active && active.url) {
        let host = new URL(active.url).hostname;
        if (host.startsWith('www.')) host = host.substring(4);
        const parts = host.split('.');
        mainUrl = (parts.length >= 2 ? parts.slice(-2).join('.') : host)
          .replace(/[^a-zA-Z0-9._-]/g, '_').slice(0, 40) || 'session';
      }
    } catch (_) {}

    const aiUrl = await blobToDataUrl(new Blob([JSON.stringify(aiPayload, null, 2)], { type: 'application/json' }));
    const huUrl = await blobToDataUrl(new Blob([humanText], { type: 'text/plain;charset=utf-8' }));

    // Track download failures separately so we can surface partial success.
    const downloadErrors = [];
    await chrome.downloads.download({ url: aiUrl, filename: `${mainUrl}+${mmdd}+(AI).json`, saveAs: false })
      .catch(e => { downloadErrors.push(`AI JSON: ${e.message || e}`); console.error('[Eagle Eyes] Failed to download AI JSON:', e); });
    await chrome.downloads.download({ url: huUrl, filename: `${mainUrl}+${mmdd}+(HU).txt`, saveAs: false })
      .catch(e => { downloadErrors.push(`HU TXT: ${e.message || e}`); console.error('[Eagle Eyes] Failed to download HU TXT:', e); });

    if (downloadErrors.length > 0) {
      reportExportError(`Download failed: ${downloadErrors.join('; ')}`);
    } else {
      reportExportSuccess(allApiRequests.length, `${mainUrl}+${mmdd}`);
    }

    sessionId = null;
  } catch (error) {
    console.error('[Eagle Eyes] Export error:', error);
    reportExportError(`Export failed: ${error.message || error}`);
    sessionId = null;
  }
}

// Persist last-export status so the popup can read it whenever it opens, and
// also broadcast a live message in case the popup is currently open.
function reportExportError(message) {
  const status = { kind: 'error', message, at: nowIso() };
  chrome.storage.local.set({ lastExportStatus: status });
  chrome.action.setBadgeText({ text: '!' });
  chrome.action.setBadgeBackgroundColor({ color: '#dc2626' });
  chrome.runtime.sendMessage({ action: 'export-status', status }).catch(() => {});
}

function reportExportSuccess(requestCount, basename) {
  const status = { kind: 'success', requestCount, basename, at: nowIso() };
  chrome.storage.local.set({ lastExportStatus: status });
  chrome.runtime.sendMessage({ action: 'export-status', status }).catch(() => {});
}

function summarizeFormData(formDataObj) {
  const display = {};
  const sensitive = {};
  const sensitiveRe = EAGLE_EYES_PATTERNS.REQUEST_SENSITIVE_RE;
  for (const [k, v] of Object.entries(formDataObj)) {
    if (sensitiveRe.test(k)) {
      display[k] = '[REDACTED]';
      sensitive[k] = v;
    } else if (typeof v === 'string' && v.length > 200) {
      display[k] = v.slice(0, 200) + '…';
    } else {
      display[k] = v;
    }
  }
  return { display, sensitive };
}

chrome.runtime.onInstalled.addListener(() => {
  chrome.storage.sync.set({ extensionEnabled: true });
  setBadge();
});
chrome.runtime.onStartup.addListener(() => {
  chrome.storage.sync.get(['extensionEnabled'], r => {
    extensionEnabled = r.extensionEnabled !== false;
    setBadge();
  });
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === 'toggleExtension') {
    extensionEnabled = !!req.enabled;
    if (!extensionEnabled) recording = false;
    chrome.storage.sync.set({ extensionEnabled });
    setBadge();
    sendResponse({ ok: true, status: getStatus() });
    return true;
  }
  if (req.action === 'getStatus') {
    sendResponse({ ok: true, status: getStatus(), recording, extensionEnabled });
    return true;
  }
  if (req.action === 'record-event' && extensionEnabled && recording) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) {
      const buf = ensureTabBuffer(tabId);
      const payload = req.payload || {};

      if (payload.type === 'form-submit' && payload.formData) {
        const { display, sensitive } = summarizeFormData(payload.formData);
        payload.formData = display;
        payload.sensitiveFormData = sensitive;
      }

      if (payload.type === 'fetch' || payload.type === 'xhr') {
        buf.api_requests.push({
          timestamp: payload.timestamp || nowIso(),
          url: payload.url || '',
          method: payload.method || 'GET',
          headers: payload.headers || {},
          request_body: payload.requestBody || null,
          request_data: payload.requestData || null,
          response_status: payload.responseStatus ?? null,
          response_headers: payload.responseHeaders || {},
          response_body: payload.responseBody || null,
          response_data: payload.responseData || null,
          response_mime_type: payload.responseHeaders ? payload.responseHeaders['content-type'] : null,
          page: payload.page || {},
          storage_data: payload.storageData || null
        });
      }

      buf.events.push({
        time: nowIso(),
        type: payload.type || 'event',
        summary: payload.summary || '',
        data: payload
      });
    }
    sendResponse({ ok: true });
    return true;
  }
  if (req.action === 'record-highlight' && extensionEnabled && recording) {
    const tabId = sender.tab && sender.tab.id;
    if (tabId) ensureTabBuffer(tabId).highlights.push({ time: nowIso(), rect: req.rect, note: req.note || 'selected' });
    sendResponse({ ok: true });
    return true;
  }
  if (req.action === 'toggle-recording' && extensionEnabled) {
    if (recording) {
      stopSessionAndExport().then(() => sendResponse({ ok: true, status: getStatus() }));
    } else {
      startSession();
      sendResponse({ ok: true, status: getStatus() });
    }
    return true;
  }
  if (req.action === 'start-recording' && extensionEnabled) {
    if (!recording) startSession();
    sendResponse({ ok: true, status: getStatus() });
    return true;
  }
  if (req.action === 'stop-recording' && extensionEnabled) {
    if (recording) {
      stopSessionAndExport().then(() => sendResponse({ ok: true, status: getStatus() }));
    } else {
      sendResponse({ ok: true, status: getStatus() });
    }
    return true;
  }
});

const RESTRICTED = ['chrome:', 'chrome-extension:', 'edge:', 'moz-extension:', 'about:', 'chrome-devtools:'];
function isInjectable(url) {
  if (!url) return false;
  try {
    const u = new URL(url);
    return !RESTRICTED.some(prefix => u.protocol.startsWith(prefix));
  } catch (_) {
    return false;
  }
}

function tryInject(tabId, url) {
  if (!tabId || !isInjectable(url)) return;
  chrome.scripting.executeScript({
    target: { tabId, allFrames: true },
    files: ['recorder.js']
  }).catch(err => {
    console.debug('[Eagle Eyes] Cannot inject into tab:', tabId, err.message);
  });
}

function handleNavigation(eventType) {
  return (d) => {
    if (!d.url || !isInjectable(d.url)) return;
    tryInject(d.tabId, d.url);
    if (recording && extensionEnabled) {
      ensureTabBuffer(d.tabId).events.push({ time: nowIso(), type: eventType, summary: d.url });
    }
  };
}

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if ((changeInfo.status === 'loading' || changeInfo.status === 'complete') && tab && tab.url) tryInject(tabId, tab.url);
});
chrome.tabs.onActivated.addListener(({ tabId }) => {
  chrome.tabs.get(tabId, (tab) => {
    if (chrome.runtime.lastError) return;
    if (tab && tab.url) tryInject(tabId, tab.url);
  });
});

try {
  chrome.webNavigation.onCommitted.addListener(handleNavigation('navigation-committed'));
  chrome.webNavigation.onDOMContentLoaded.addListener(handleNavigation('navigation-domcontentloaded'));
  chrome.webNavigation.onHistoryStateUpdated.addListener(handleNavigation('navigation-historystate'));
  chrome.webNavigation.onReferenceFragmentUpdated.addListener(handleNavigation('navigation-hash'));
  chrome.webNavigation.onCreatedNavigationTarget.addListener((d) => {
    if (!d.url || !isInjectable(d.url)) return;
    tryInject(d.tabId, d.url);
    // popup/redirect targets sometimes need re-injection after the page settles
    setTimeout(() => d.url && isInjectable(d.url) && tryInject(d.tabId, d.url), 400);
    setTimeout(() => d.url && isInjectable(d.url) && tryInject(d.tabId, d.url), 1200);
    if (recording && extensionEnabled) {
      ensureTabBuffer(d.tabId).events.push({ time: nowIso(), type: 'popup-or-redirect', summary: d.url || 'about:blank' });
    }
  });
} catch (_) {}
