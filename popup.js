document.addEventListener('DOMContentLoaded', () => {
  const toggle = document.getElementById('ext-toggle');
  const label = document.getElementById('toggle-state');
  const statusBox = document.getElementById('status');
  const exportStatusBox = document.getElementById('export-status');

  function setStatusText(s) {
    if (statusBox) statusBox.textContent = s;
  }

  function statusLabelFor(s) {
    if (s === 'off') return 'off';
    if (s === 'on') return 'recording';
    return 'idle';
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[c]));
  }

  function renderExportStatus(status) {
    if (!exportStatusBox || !status) return;
    exportStatusBox.classList.remove('success', 'error');
    const when = status.at ? new Date(status.at).toLocaleString() : '';
    const timestamp = when ? `<div class="timestamp">${escapeHtml(when)}</div>` : '';
    if (status.kind === 'error') {
      exportStatusBox.classList.add('error');
      exportStatusBox.innerHTML =
        `<strong>⚠️ Last export failed</strong><div>${escapeHtml(status.message || 'Unknown error')}</div>${timestamp}`;
    } else if (status.kind === 'success') {
      exportStatusBox.classList.add('success');
      exportStatusBox.innerHTML =
        `<strong>✅ Last export OK</strong><div>${status.requestCount} requests captured → ${escapeHtml(status.basename || '')}</div>${timestamp}`;
    }
  }

  chrome.runtime.sendMessage({ action: 'getStatus' }, (res) => {
    if (!res || !res.ok) return;
    if (toggle) toggle.checked = !!res.extensionEnabled;
    if (label) label.textContent = statusLabelFor(res.status);
    setStatusText('Extension idle');
  });

  chrome.storage.local.get(['lastExportStatus'], (r) => {
    if (r && r.lastExportStatus) renderExportStatus(r.lastExportStatus);
  });

  if (toggle) {
    toggle.addEventListener('change', () => {
      chrome.runtime.sendMessage({ action: 'toggleExtension', enabled: toggle.checked }, (res) => {
        if (label && res && res.ok) label.textContent = statusLabelFor(res.status);
      });
    });
  }

  chrome.runtime.onMessage.addListener((req) => {
    if (req.action === 'updateStatus') {
      setStatusText(req.message);
    } else if (req.action === 'export-status') {
      renderExportStatus(req.status);
    }
  });
});
