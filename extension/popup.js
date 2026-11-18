// ThreatLens Shield - Popup Script

const CIRCUMFERENCE = 2 * Math.PI * 42; // ~263.89

document.addEventListener('DOMContentLoaded', async () => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  const targetHostEl = document.getElementById('targetHost');
  const scoreDisplayEl = document.getElementById('scoreDisplay');
  const riskTierPillEl = document.getElementById('riskTierPill');
  const categoryDisplayEl = document.getElementById('categoryDisplay');
  const gaugeFillEl = document.getElementById('gaugeFill');
  const signalsListEl = document.getElementById('signalsList');
  const statusChipEl = document.getElementById('statusChip');
  const statusTextEl = document.getElementById('statusText');
  const offlineBannerEl = document.getElementById('offlineBanner');

  if (!tab.url || !tab.url.startsWith('http')) {
    targetHostEl.textContent = tab.url ? tab.url.slice(0, 35) + '...' : 'Internal Browser Page';
    scoreDisplayEl.textContent = '0';
    setGauge(0, '#10b981');
    riskTierPillEl.textContent = 'INTERNAL';
    riskTierPillEl.style.background = 'rgba(148, 163, 184, 0.2)';
    riskTierPillEl.style.color = '#cbd5e1';
    categoryDisplayEl.textContent = 'Browser System Resource';
    signalsListEl.innerHTML = '<div class="signal-row" style="color: var(--muted);">Internal browser pages are not inspected.</div>';
    return;
  }

  try {
    const host = new URL(tab.url).hostname;
    targetHostEl.textContent = host;
  } catch {
    targetHostEl.textContent = tab.url;
  }

  function setGauge(score, color) {
    scoreDisplayEl.textContent = score;
    scoreDisplayEl.style.color = color;
    const offset = CIRCUMFERENCE - (score / 100) * CIRCUMFERENCE;
    gaugeFillEl.style.strokeDashoffset = Math.max(0, offset);
    gaugeFillEl.style.stroke = color;
  }

  function renderData(data, offline) {
    if (offline) {
      statusChipEl.className = 'status-chip offline';
      statusTextEl.textContent = 'Offline';
      offlineBannerEl.style.display = 'block';
    } else {
      statusChipEl.className = 'status-chip';
      statusTextEl.textContent = 'Active';
      offlineBannerEl.style.display = 'none';
    }

    if (!data) {
      scoreDisplayEl.textContent = '--';
      categoryDisplayEl.textContent = offline ? 'Engine offline' : 'Analyzing...';
      return;
    }

    const score = Math.round(data.risk_score !== undefined ? data.risk_score : (data.score || 0));
    const riskLevel = data.risk_level || (score >= 65 ? 'CRITICAL' : score >= 35 ? 'MODERATE' : 'LOW');
    const category = data.threat_category || 'General';

    let color = '#10b981';
    let pillBg = 'rgba(16, 185, 129, 0.2)';
    let pillColor = '#6ee7b7';

    if (score >= 80 || riskLevel === 'CRITICAL') {
      color = '#ef4444';
      pillBg = 'rgba(239, 68, 68, 0.2)';
      pillColor = '#fca5a5';
    } else if (score >= 65 || riskLevel === 'HIGH') {
      color = '#f87171';
      pillBg = 'rgba(248, 113, 113, 0.2)';
      pillColor = '#fca5a5';
    } else if (score >= 35 || riskLevel === 'MODERATE') {
      color = '#f59e0b';
      pillBg = 'rgba(245, 158, 11, 0.2)';
      pillColor = '#fcd34d';
    }

    setGauge(score, color);
    riskTierPillEl.textContent = riskLevel;
    riskTierPillEl.style.background = pillBg;
    riskTierPillEl.style.color = pillColor;
    categoryDisplayEl.textContent = category;

    // Signals
    const risks = data.risks || [];
    signalsListEl.innerHTML = '';
    if (risks.length === 0) {
      signalsListEl.innerHTML = `
        <div class="signal-row" style="color: #6ee7b7;">
          <span class="signal-dot" style="background: #10b981;"></span>
          <span>Verified authentic. No malicious indicators found.</span>
        </div>
      `;
    } else {
      risks.forEach((r) => {
        const item = document.createElement('div');
        item.className = 'signal-row';
        const dotColor = (r.severity === 'CRITICAL' || r.severity === 'HIGH') ? '#ef4444' : '#f59e0b';
        item.innerHTML = `
          <span class="signal-dot" style="background: ${dotColor};"></span>
          <div>
            <strong style="color: #f3f4f6;">${escapeHtml(r.name || 'Threat Signal')}:</strong>
            <span style="color: var(--muted); margin-left: 4px;">${escapeHtml(r.detail || '')}</span>
          </div>
        `;
        signalsListEl.appendChild(item);
      });
    }
  }

  // Request status from background worker
  chrome.runtime.sendMessage({ action: 'get_current_status', tabId: tab.id }, (resp) => {
    if (resp && resp.analysis) {
      renderData(resp.analysis.data, resp.analysis.offline);
    } else {
      // Trigger scan
      chrome.runtime.sendMessage({ action: 'rescan_url', tabId: tab.id, url: tab.url }, (r2) => {
        if (r2 && r2.analysis) {
          renderData(r2.analysis.data, r2.analysis.offline);
        }
      });
    }
  });

  // Re-scan button
  document.getElementById('btnRescan').addEventListener('click', () => {
    scoreDisplayEl.textContent = '..';
    categoryDisplayEl.textContent = 'Re-analyzing domain...';
    chrome.runtime.sendMessage({ action: 'rescan_url', tabId: tab.id, url: tab.url }, (res) => {
      if (res && res.analysis) {
        renderData(res.analysis.data, res.analysis.offline);
      }
    });
  });

  // Open Dashboard button
  document.getElementById('btnOpenDashboard').addEventListener('click', () => {
    chrome.tabs.create({ url: 'http://127.0.0.1:8000' });
  });
});

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
