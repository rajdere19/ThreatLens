// ThreatLens Intercept Screen Script

document.addEventListener('DOMContentLoaded', () => {
  const params = new URLSearchParams(window.location.search);
  const targetUrl = params.get('url') || 'Unknown Destination';
  const score = params.get('score') || '95';
  const level = params.get('level') || 'CRITICAL';
  const category = params.get('category') || 'Deceptive Web Threat';
  
  let risks = [];
  try {
    risks = JSON.parse(params.get('risks') || '[]');
  } catch (e) {
    risks = [];
  }

  // Populate Elements
  document.getElementById('targetUrl').textContent = targetUrl;
  document.getElementById('threatScore').textContent = `${score}%`;
  document.getElementById('riskLevel').textContent = level;
  document.getElementById('threatCategory').textContent = category;

  // Render Indicators
  const listEl = document.getElementById('indicatorsList');
  listEl.innerHTML = '';

  if (risks.length === 0) {
    const div = document.createElement('div');
    div.className = 'risk-item';
    div.innerHTML = `
      <div class="risk-header">
        <span class="risk-badge">${level}</span>
        <span class="risk-name">High-Risk Heuristic Match</span>
      </div>
      <div class="risk-detail">This domain triggered high-confidence phishing or brand impersonation signatures.</div>
    `;
    listEl.appendChild(div);
  } else {
    risks.forEach((r) => {
      const div = document.createElement('div');
      div.className = 'risk-item';
      
      const sev = r.severity || 'CRITICAL';
      const name = r.name || 'Threat Signal';
      const detail = r.detail || 'Detected by ThreatLens heuristic engine.';

      div.innerHTML = `
        <div class="risk-header">
          <span class="risk-badge">${escapeHtml(sev)}</span>
          <span class="risk-name">${escapeHtml(name)}</span>
        </div>
        <div class="risk-detail">${escapeHtml(detail)}</div>
      `;
      listEl.appendChild(div);
    });
  }

  // Button: Return to safety
  document.getElementById('btnReturnSafety').addEventListener('click', () => {
    if (window.history.length > 2) {
      window.history.back();
    } else {
      window.location.href = 'https://www.google.com';
    }
  });

  // Button: Toggle Advanced Options
  const drawer = document.getElementById('bypassDrawer');
  document.getElementById('btnToggleBypass').addEventListener('click', () => {
    drawer.classList.toggle('open');
  });

  // Button: Proceed Anyway (Bypass)
  document.getElementById('btnProceedAnyway').addEventListener('click', () => {
    chrome.runtime.sendMessage({
      action: 'bypass_and_proceed',
      url: targetUrl,
      minutes: 30
    }, (resp) => {
      window.location.href = targetUrl;
    });
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
