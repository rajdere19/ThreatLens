// ThreatLens Cyber Shield - Background Service Worker (Manifest V3)

const API_ENDPOINT = 'http://127.0.0.1:8000/api/analyze/url';
const HEALTH_ENDPOINT = 'http://127.0.0.1:8000/api/health';
const INTERCEPT_SCORE_THRESHOLD = 65;
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

// In-memory cache for recent URL analyses: url -> { data, timestamp }
const urlCache = new Map();

// Tab analysis cache: tabId -> { url, data, offline }
const tabAnalysis = new Map();

// Check if a URL should be inspected
function isInspectableUrl(url) {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('http://') && !url.startsWith('https://')) return false;

  try {
    const parsed = new URL(url);
    const host = parsed.hostname.toLowerCase();
    // Do not intercept or badge local development hosts or extension pages
    if (host === 'localhost' || host === '127.0.0.1' || host === '0.0.0.0' || host.endsWith('.local')) {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Extract hostname
function getHostname(url) {
  try {
    return new URL(url).hostname.toLowerCase();
  } catch {
    return url;
  }
}

// Check if hostname has an active temporary bypass
async function checkBypass(hostname) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['threatlens_bypasses'], (res) => {
      const bypasses = res.threatlens_bypasses || {};
      const expiry = bypasses[hostname];
      if (expiry && expiry > Date.now()) {
        resolve(true);
      } else {
        resolve(false);
      }
    });
  });
}

// Set temporary bypass for a hostname (default 30 mins)
async function setBypass(hostname, minutes = 30) {
  return new Promise((resolve) => {
    chrome.storage.local.get(['threatlens_bypasses'], (res) => {
      const bypasses = res.threatlens_bypasses || {};
      bypasses[hostname] = Date.now() + minutes * 60 * 1000;
      chrome.storage.local.set({ threatlens_bypasses: bypasses }, () => {
        resolve(true);
      });
    });
  });
}

// Update extension badge appearance
function updateBadge(tabId, data, offline = false) {
  if (offline) {
    chrome.action.setBadgeText({ tabId, text: 'OFF' });
    chrome.action.setBadgeBackgroundColor({ tabId, color: '#6b7280' }); // slate gray
    chrome.action.setTitle({ tabId, title: 'ThreatLens: Backend Offline (Start python app.py on port 8000)' });
    return;
  }

  if (!data) {
    chrome.action.setBadgeText({ tabId, text: '' });
    chrome.action.setTitle({ tabId, title: 'ThreatLens Cyber Shield' });
    return;
  }

  const score = Math.round(data.risk_score !== undefined ? data.risk_score : (data.score || 0));
  const riskLevel = data.risk_level || (score >= 65 ? 'CRITICAL' : score >= 35 ? 'MODERATE' : 'LOW');

  let badgeColor = '#10b981'; // emerald green
  let badgeText = `${score}`;

  if (score >= 80 || riskLevel === 'CRITICAL') {
    badgeColor = '#ef4444'; // critical red
    badgeText = `${score}`;
  } else if (score >= 65 || riskLevel === 'HIGH') {
    badgeColor = '#f87171'; // high red/coral
    badgeText = `${score}`;
  } else if (score >= 35 || riskLevel === 'MODERATE') {
    badgeColor = '#f59e0b'; // amber
    badgeText = `${score}`;
  } else {
    badgeColor = '#10b981'; // green
    badgeText = score === 0 ? '0' : `${score}`;
  }

  chrome.action.setBadgeText({ tabId, text: badgeText });
  chrome.action.setBadgeBackgroundColor({ tabId, color: badgeColor });
  chrome.action.setTitle({
    tabId,
    title: `ThreatLens: ${riskLevel} (${score}%) - ${data.threat_category || 'Scanned'}`
  });
}

// Perform URL analysis via ThreatLens backend API
async function performUrlAnalysis(targetUrl) {
  // Check cache first
  const cached = urlCache.get(targetUrl);
  if (cached && (Date.now() - cached.timestamp < CACHE_TTL_MS)) {
    return { data: cached.data, offline: false };
  }

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 6000);

    const response = await fetch(API_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        value: targetUrl,
        user_email: 'browser_shield@threatlens.intel'
      }),
      signal: controller.signal
    });
    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`ThreatLens API returned status ${response.status}`);
      return { data: null, offline: false, error: `API status ${response.status}` };
    }

    const data = await response.json();
    urlCache.set(targetUrl, { data, timestamp: Date.now() });
    return { data, offline: false };
  } catch (err) {
    console.warn('ThreatLens backend unreachable:', err.message);
    return { data: null, offline: true, error: err.message };
  }
}

// Process tab navigation
async function handleTabUrl(tabId, url) {
  if (!isInspectableUrl(url)) {
    updateBadge(tabId, null);
    tabAnalysis.delete(tabId);
    return;
  }

  const hostname = getHostname(url);
  const bypassed = await checkBypass(hostname);

  const { data, offline, error } = await performUrlAnalysis(url);

  tabAnalysis.set(tabId, {
    url,
    data,
    offline,
    bypassed,
    timestamp: Date.now()
  });

  updateBadge(tabId, data, offline);

  // Intercept if dangerous and not bypassed
  if (data && !bypassed) {
    const score = data.risk_score !== undefined ? data.risk_score : (data.score || 0);
    const riskLevel = data.risk_level || 'LOW';

    if (score >= INTERCEPT_SCORE_THRESHOLD || riskLevel === 'CRITICAL' || riskLevel === 'HIGH') {
      const interceptParams = new URLSearchParams({
        url: url,
        score: score.toString(),
        level: riskLevel,
        category: data.threat_category || 'Suspicious Threat',
        confidence: (data.confidence || 90).toString(),
        risks: JSON.stringify(data.risks || [])
      });

      const interceptUrl = chrome.runtime.getURL(`blocked.html?${interceptParams.toString()}`);
      chrome.tabs.update(tabId, { url: interceptUrl });
    }
  }
}

// Listener: Tab updated (URL navigation)
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading' && changeInfo.url) {
    handleTabUrl(tabId, changeInfo.url);
  }
});

// Listener: Tab activated (User switches tabs)
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  const tab = await chrome.tabs.get(activeInfo.tabId).catch(() => null);
  if (!tab || !tab.url) return;

  const cached = tabAnalysis.get(activeInfo.tabId);
  if (cached && cached.url === tab.url) {
    updateBadge(activeInfo.tabId, cached.data, cached.offline);
  } else if (isInspectableUrl(tab.url)) {
    handleTabUrl(activeInfo.tabId, tab.url);
  } else {
    updateBadge(activeInfo.tabId, null);
  }
});

// Listener: Tab removed (cleanup)
chrome.tabs.onRemoved.addListener((tabId) => {
  tabAnalysis.delete(tabId);
});

// Message Listener from Popup and Intercept page
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'get_current_status') {
    const tabId = message.tabId;
    const tabData = tabAnalysis.get(tabId) || null;
    sendResponse({ status: 'ok', analysis: tabData });
    return true;
  }

  if (message.action === 'rescan_url') {
    const { tabId, url } = message;
    if (url) {
      urlCache.delete(url);
      handleTabUrl(tabId, url).then(() => {
        sendResponse({ status: 'ok', analysis: tabAnalysis.get(tabId) });
      });
      return true;
    }
  }

  if (message.action === 'bypass_and_proceed') {
    const { url, minutes = 30 } = message;
    const hostname = getHostname(url);
    setBypass(hostname, minutes).then(() => {
      // Find current tab or sender tab
      const tabId = sender.tab ? sender.tab.id : message.tabId;
      if (tabId && url) {
        chrome.tabs.update(tabId, { url });
      }
      sendResponse({ status: 'ok', bypassed: true });
    });
    return true;
  }
});
