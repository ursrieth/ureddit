// popup.js — Ureddit popup controller (v3.0)
// Handles: thread mode, sub bulk mode, history archive, prompt templates,
// progressive render, combined filters, session cache.

'use strict';

const $  = id => document.getElementById(id);
const $$ = sel => Array.from(document.querySelectorAll(sel));

// ═══════════════════════════════════════════════════════════════════════
// DOM refs
// ═══════════════════════════════════════════════════════════════════════
const notReddit        = $('notReddit');
const viewThreadSetup  = $('viewThreadSetup');
const viewSubSetup     = $('viewSubSetup');
const viewHistory      = $('viewHistory');
const viewPreview      = $('viewPreview');

// Thread setup
const scrapeBtn        = $('scrapeBtn');
const btnLabel         = $('btnLabel');
const statusDot        = $('statusDot');
const progressWrap     = $('progressWrap');
const progressFill     = $('progressFill');
const progressLabel    = $('progressLabel');
const statusMsg        = $('statusMsg');
const pageTitle        = $('pageTitle');
const subredditChip    = $('subredditChip');
const commentLimit     = $('commentLimit');
const includeReplies   = $('includeReplies');
const autoExpand       = $('autoExpand');
const footMeta         = $('footMeta');
const setupFormatToggle = $('setupFormatToggle');
const tsHistoryBtn     = $('tsHistoryBtn');
const tsHistoryBadge   = $('tsHistoryBadge');

// Sub setup
const bulkScrapeBtn    = $('bulkScrapeBtn');
const bulkBtnLabel     = $('bulkBtnLabel');
const subStatusDot     = $('subStatusDot');
const subProgressWrap  = $('subProgressWrap');
const subProgressFill  = $('subProgressFill');
const subProgressLabel = $('subProgressLabel');
const subStatusMsg     = $('subStatusMsg');
const subPageTitle     = $('subPageTitle');
const subSortBadge     = $('subSortBadge');
const subTimeChip      = $('subTimeChip');
const threadLimit      = $('threadLimit');
const subSortSelect    = $('subSortSelect');
const timeFilterRow    = $('timeFilterRow');
const timeFilter       = $('timeFilter');
const bulkCommentLimit = $('bulkCommentLimit');
const minComments      = $('minComments');
const bulkAutoExpand   = $('bulkAutoExpand');
const subFootMeta      = $('subFootMeta');
const ssHistoryBtn     = $('ssHistoryBtn');
const ssHistoryBadge   = $('ssHistoryBadge');

// History
const historyBackBtn   = $('historyBackBtn');
const historyScroll    = $('historyScroll');
const historyCountSub  = $('historyCountSub');
const historyStatCount = $('historyStatCount');
const historyStatKb    = $('historyStatKb');
const exportAllBtn     = $('exportAllBtn');
const clearAllBtn      = $('clearAllBtn');
const nrHistoryBtn     = $('nrHistoryBtn');

// Preview
const backBtn          = $('backBtn');
const pvTitle          = $('pvTitle');
const pvSub            = $('pvSub');
const pvPromptBtn      = $('pvPromptBtn');
const pvCopyBtn        = $('pvCopyBtn');
const pvDownloadBtn    = $('pvDownloadBtn');
const pvScroll         = $('pvScroll');
const bulkHeader       = $('bulkHeader');
const threadListArea   = $('threadListArea');
const postCardEl       = $('postCard');
const commentTreeEl    = $('commentTree');
const treeHeader       = $('treeHeader');
const topCommenters    = $('topCommenters');
const pvToolbar        = $('pvToolbar');
const fcAll            = $('fcAll');
const fcPain           = $('fcPain');
const fcRequest        = $('fcRequest');
const fcPraise         = $('fcPraise');
const sfComments       = $('sfComments');
const sfReplies        = $('sfReplies');
const sfWords          = $('sfWords');
const sfSource         = $('sfSource');
const searchInput      = $('searchInput');
const searchClear      = $('searchClear');
const searchWrap       = $('searchWrap');
const minUpvotes       = $('minUpvotes');
const restoreBanner    = $('restoreBanner');
const dismissBanner    = $('dismissBanner');
const previewFormatToggle = $('previewFormatToggle');
const filterChips      = $$('.filter-chip');

// Tabs + clusters + analysis
const pvTabs           = $('pvTabs');
const clustersArea     = $('clustersArea');
const analysisArea     = $('analysisArea');
const tabCountComments = $('tabCountComments');
const tabCountClusters = $('tabCountClusters');
const tabCountAnalysis = $('tabCountAnalysis');
const tabButtons       = $$('.pv-tab');

// Settings
const settingsBackdrop   = $('settingsBackdrop');
const settingsModal      = $('settingsModal');
const settingsClose      = $('settingsClose');
const settingsCancelBtn  = $('settingsCancelBtn');
const settingsSaveBtn    = $('settingsSaveBtn');
const anthropicKeyInput  = $('anthropicKeyInput');
const openaiKeyInput     = $('openaiKeyInput');
const modelSelect        = $('modelSelect');
const anthropicStatus    = $('anthropicStatus');
const openaiStatus       = $('openaiStatus');
const tsSettingsBtn      = $('tsSettingsBtn');
const ssSettingsBtn      = $('ssSettingsBtn');

// Prompt menu
const promptMenu         = $('promptMenu');
const promptMenuBackdrop = $('promptMenuBackdrop');
const promptMenuItems    = $('promptMenuItems');

// ═══════════════════════════════════════════════════════════════════════
// STATE
// ═══════════════════════════════════════════════════════════════════════
let selectedFormat = 'md';
let activeFilter   = 'all';
let searchQuery    = '';
let minScore       = 0;
let authorFilter   = null;
let isScraping     = false;
let searchDebounce = null;
let currentContext = null;

/**
 * preview.mode:
 *   'single'      — a single thread (from thread setup or history)
 *   'bulk_list'   — list of threads from a bulk scrape
 *   'bulk_thread' — drilled-down into one thread within a bulk
 * preview.data — the top-level payload
 * preview.bulk — the bulk payload (when in bulk_list / bulk_thread)
 * preview.drillIdx — index of the drilled thread in bulk.threads
 * preview.returnView — where to go when exiting preview (via back button)
 */
let preview = {
  mode:          'single',
  data:          null,
  stats:         null,
  bulk:          null,
  drillIdx:      -1,
  returnView:    'viewThreadSetup',
  tab:           'comments',   // 'comments' | 'clusters'
  clusterResult: null,         // cached { clusters, unclustered, stats, items }
};

const commentMeta = new WeakMap();
const RENDER_BATCH = 40;
const TRUNCATE_CHARS = 600;

// ═══════════════════════════════════════════════════════════════════════
// SETTINGS (BYO-key: Anthropic + OpenAI)
// ═══════════════════════════════════════════════════════════════════════
let settings = {
  anthropicKey: '',
  openaiKey:    '',
  model:        'claude-sonnet-4-6',
};

const SETTINGS_KEY = 'ureddit_settings_v1';

async function loadSettings() {
  try {
    const r = await chrome.storage.local.get([SETTINGS_KEY]);
    if (r[SETTINGS_KEY]) settings = { ...settings, ...r[SETTINGS_KEY] };
  } catch (e) { console.warn('load settings failed', e); }
  refreshSettingsUI();
}
async function saveSettingsObj() {
  try { await chrome.storage.local.set({ [SETTINGS_KEY]: settings }); }
  catch (e) { console.warn('save settings failed', e); }
  refreshSettingsUI();
}
function refreshSettingsUI() {
  if (!anthropicStatus || !openaiStatus) return;
  if (settings.anthropicKey) {
    anthropicStatus.textContent = '✓ Configured';
    anthropicStatus.className = 'sm-status';
  } else {
    anthropicStatus.textContent = 'Not configured';
    anthropicStatus.className = 'sm-status unset';
  }
  if (settings.openaiKey) {
    openaiStatus.textContent = '✓ Configured — semantic clustering enabled';
    openaiStatus.className = 'sm-status';
  } else {
    openaiStatus.textContent = 'Not configured — using TF-IDF';
    openaiStatus.className = 'sm-status unset';
  }
}

function openSettings() {
  anthropicKeyInput.value = settings.anthropicKey || '';
  openaiKeyInput.value    = settings.openaiKey || '';
  modelSelect.value       = settings.model || 'claude-sonnet-4-6';
  refreshSettingsUI();
  settingsBackdrop.classList.add('visible');
  settingsModal.classList.add('visible');
}
function closeSettings() {
  settingsBackdrop.classList.remove('visible');
  settingsModal.classList.remove('visible');
}
settingsBackdrop.addEventListener('click', closeSettings);
settingsClose.addEventListener('click', closeSettings);
settingsCancelBtn.addEventListener('click', closeSettings);
settingsSaveBtn.addEventListener('click', async () => {
  settings.anthropicKey = (anthropicKeyInput.value || '').trim();
  settings.openaiKey    = (openaiKeyInput.value || '').trim();
  settings.model        = modelSelect.value || 'claude-sonnet-4-6';
  await saveSettingsObj();
  closeSettings();
  const msg = settings.anthropicKey
    ? '✓ Settings saved — in-app AI analysis unlocked'
    : '✓ Settings saved';
  if (!viewPreview.classList.contains('hidden')) toast(msg);
  else showStatus(msg, 'success');
});
if (tsSettingsBtn) tsSettingsBtn.addEventListener('click', openSettings);
if (ssSettingsBtn) ssSettingsBtn.addEventListener('click', openSettings);

// Close settings on Escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && settingsModal.classList.contains('visible')) closeSettings();
});

const AVATAR_COLORS = [
  ['#d97757', '#b85a3d'], ['#c49569', '#9f7448'], ['#a89165', '#81703e'],
  ['#c27b6d', '#8a4f42'], ['#8fa876', '#65824b'], ['#b8a189', '#927a5f'],
  ['#9e7a84', '#78545e'], ['#7a9a8d', '#4f7168'], ['#c09168', '#946843'],
  ['#b0897c', '#875e51'],
];

// ═══════════════════════════════════════════════════════════════════════
// FORMAT TOGGLE SYNC
// ═══════════════════════════════════════════════════════════════════════
function wireFormatToggle(container) {
  container.querySelectorAll('.fmt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedFormat = btn.dataset.fmt;
      syncFormatToggles();
    });
  });
}
function syncFormatToggles() {
  [setupFormatToggle, previewFormatToggle].forEach(container => {
    container.querySelectorAll('.fmt-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.fmt === selectedFormat);
    });
  });
}
wireFormatToggle(setupFormatToggle);
wireFormatToggle(previewFormatToggle);

// ═══════════════════════════════════════════════════════════════════════
// VIEW SWITCHING
// ═══════════════════════════════════════════════════════════════════════
function showView(name) {
  notReddit.classList.remove('visible');
  [viewThreadSetup, viewSubSetup, viewHistory, viewPreview].forEach(v => v.classList.add('hidden'));

  if (name === 'notReddit')        notReddit.classList.add('visible');
  if (name === 'viewThreadSetup')  viewThreadSetup.classList.remove('hidden');
  if (name === 'viewSubSetup')     viewSubSetup.classList.remove('hidden');
  if (name === 'viewHistory')      viewHistory.classList.remove('hidden');
  if (name === 'viewPreview')      viewPreview.classList.remove('hidden');
}

backBtn.addEventListener('click', handlePreviewBack);
historyBackBtn.addEventListener('click', () => {
  if (currentContext?.type === 'sub')         showView('viewSubSetup');
  else if (currentContext?.type === 'thread') showView('viewThreadSetup');
  else                                         showView('notReddit');
});
tsHistoryBtn.addEventListener('click', () => openHistory());
ssHistoryBtn.addEventListener('click', () => openHistory());
nrHistoryBtn.addEventListener('click', () => openHistory());

function handlePreviewBack() {
  if (preview.mode === 'bulk_thread') {
    // Drill up to bulk list
    showBulkList();
  } else {
    showView(preview.returnView || 'viewThreadSetup');
  }
}

// ═══════════════════════════════════════════════════════════════════════
// CONTEXT DETECTION
// ═══════════════════════════════════════════════════════════════════════
async function detectContext() {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';

  // Use unified multi-source detector from utils.js
  const d = UR.detectSource(url, tab);
  if (!d) return { type: 'not-reddit', url, tab };

  if (d.source === 'reddit') {
    // Map to legacy field names that popup.js already uses
    if (d.type === 'item') {
      return { type: 'thread', source: 'reddit', subreddit: d.subreddit, threadId: d.threadId, url, tab };
    }
    return { type: 'sub', source: 'reddit', subreddit: d.subreddit, sort: d.sort, timeFilter: d.timeFilter, url, tab };
  }

  // HN / SO / GitHub — unified type names
  // Single-item sources route to viewThreadSetup UI (still the "single scrape" view)
  // Listing sources route to viewSubSetup (the "bulk scrape" view)
  if (d.type === 'item') {
    return { ...d, type: 'thread', tab };   // reuse thread-setup UI
  }
  return { ...d, type: 'sub', tab };          // reuse sub-setup UI
}

// ═══════════════════════════════════════════════════════════════════════
// THREAD-SETUP helpers
// ═══════════════════════════════════════════════════════════════════════
function setDot(el, state) {
  el.className = 'status-dot ' + state;
}
function setBusy(busy, btn, label, defaultText, busyText) {
  isScraping = busy;
  if (btn) btn.disabled = busy;
  if (label) label.textContent = busy ? busyText : defaultText;
}

function showSetupProgress(wrap, fill, label, text) {
  wrap.classList.add('visible');
  fill.classList.add('indeterminate');
  fill.style.width = '';
  label.textContent = text;
}
function setSetupProgressPct(fill, wrap, pct, labelEl, text) {
  wrap.classList.add('visible');
  fill.classList.remove('indeterminate');
  fill.style.width = Math.min(100, Math.max(0, pct)) + '%';
  if (labelEl && text) labelEl.textContent = text;
}
function hideSetupProgress(wrap, fill) {
  wrap.classList.remove('visible');
  fill.classList.remove('indeterminate');
  fill.style.width = '';
}

function showSetupStatus(el, msg, type = 'info') {
  el.textContent = msg;
  el.className = `status-msg visible ${type}`;
}
function hideSetupStatus(el) { el.className = 'status-msg'; }

// ═══════════════════════════════════════════════════════════════════════
// PROGRESS MESSAGE LISTENER (global)
// ═══════════════════════════════════════════════════════════════════════
chrome.runtime.onMessage.addListener((message) => {
  if (message.type !== 'UREDDIT_PROGRESS') return;

  // Route to the active setup view's progress UI
  const inThread = currentContext?.type === 'thread';
  const fill     = inThread ? progressFill : subProgressFill;
  const wrap     = inThread ? progressWrap : subProgressWrap;
  const labelEl  = inThread ? progressLabel : subProgressLabel;

  if (message.label) labelEl.textContent = message.label;
  if (typeof message.current === 'number' && typeof message.total === 'number' && message.total > 0) {
    const pct = Math.min(99, (message.current / message.total) * 100);
    setSetupProgressPct(fill, wrap, pct);
  } else if (message.phase === 'morechildren_done' || message.phase === 'bulk_done' || message.phase === 'done') {
    setSetupProgressPct(fill, wrap, 100);
  }
});

// ═══════════════════════════════════════════════════════════════════════
// SINGLE-THREAD SCRAPE
// ═══════════════════════════════════════════════════════════════════════
scrapeBtn.addEventListener('click', runSingleScrape);

async function runSingleScrape() {
  if (isScraping) return;
  if (!currentContext) return;

  // Branch: Reddit uses content script, others use direct API adapters
  if (currentContext.source === 'reddit') return runRedditSingleScrape();
  return runAdapterSingleScrape();
}

async function runRedditSingleScrape() {
  const tab = currentContext?.tab;
  if (!tab) return;

  setBusy(true, scrapeBtn, btnLabel, 'Scrape & preview', 'Scraping…');
  setDot(statusDot, 'working');
  hideSetupStatus(statusMsg);
  showSetupProgress(progressWrap, progressFill, progressLabel, 'Injecting scraper…');

  const options = {
    limit:          parseInt(commentLimit.value, 10),
    includeReplies: includeReplies.checked,
    autoExpand:     autoExpand.checked,
  };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['content.js'],
    });
  } catch (_) {}

  let resolved = false;
  const listener = (msg, sender) => {
    if (sender.tab?.id !== tab.id) return;
    if (msg.type !== 'UREDDIT_RESULT') return;
    resolved = true;
    chrome.runtime.onMessage.removeListener(listener);
    handleSingleResult(msg.payload);
  };
  chrome.runtime.onMessage.addListener(listener);

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'UREDDIT_SCRAPE', options });
    setTimeout(() => {
      if (resolved || !isScraping) return;
      chrome.runtime.onMessage.removeListener(listener);
      setBusy(false, scrapeBtn, btnLabel, 'Scrape & preview', 'Scraping…');
      hideSetupProgress(progressWrap, progressFill);
      showSetupStatus(statusMsg, '⚠ Scrape timed out. Try reducing limit or disabling auto-expand.', 'error');
      setDot(statusDot, 'error');
    }, 180000);
  } catch (err) {
    chrome.runtime.onMessage.removeListener(listener);
    setBusy(false, scrapeBtn, btnLabel, 'Scrape & preview', 'Scraping…');
    hideSetupProgress(progressWrap, progressFill);
    showSetupStatus(statusMsg, '❌ Could not reach page. Reload the Reddit tab and try again.', 'error');
    setDot(statusDot, 'error');
  }
}

async function runAdapterSingleScrape() {
  const adapter = UR.sources[currentContext.source];
  if (!adapter) {
    showSetupStatus(statusMsg, '❌ No adapter for ' + currentContext.source, 'error');
    return;
  }

  setBusy(true, scrapeBtn, btnLabel, 'Scrape & preview', 'Scraping…');
  setDot(statusDot, 'working');
  hideSetupStatus(statusMsg);
  showSetupProgress(progressWrap, progressFill, progressLabel, 'Initializing…');

  const options = {
    limit:          parseInt(commentLimit.value, 10),
    includeReplies: includeReplies.checked,
  };

  try {
    const payload = await adapter.scrapeItem(currentContext, options, (p) => {
      if (p.label) progressLabel.textContent = p.label;
      if (typeof p.current === 'number' && typeof p.total === 'number' && p.total > 0) {
        setSetupProgressPct(progressFill, progressWrap, (p.current / p.total) * 100);
      }
    });
    handleSingleResult(payload);
  } catch (err) {
    setBusy(false, scrapeBtn, btnLabel, 'Scrape & preview', 'Scraping…');
    hideSetupProgress(progressWrap, progressFill);
    showSetupStatus(statusMsg, '❌ ' + (err.message || 'Scraping failed'), 'error');
    setDot(statusDot, 'error');
  }
}

async function handleSingleResult(payload) {
  setBusy(false, scrapeBtn, btnLabel, 'Scrape & preview', 'Scraping…');
  hideSetupProgress(progressWrap, progressFill);

  if (!payload || payload.error) {
    showSetupStatus(statusMsg, '❌ ' + (payload?.error || 'Unknown scraping error.'), 'error');
    setDot(statusDot, 'error');
    return;
  }

  setDot(statusDot, 'ready');
  footMeta.textContent = payload.data.source === 'json' ? 'JSON API' : 'DOM scrape';

  await archiveSave('single', payload.data, payload.stats);
  await refreshHistoryBadges();

  preview.mode       = 'single';
  preview.data       = payload.data;
  preview.stats      = payload.stats;
  preview.bulk       = null;
  preview.drillIdx   = -1;
  preview.returnView = 'viewThreadSetup';

  renderPreview();
  showView('viewPreview');
}

// ═══════════════════════════════════════════════════════════════════════
// BULK (SUBREDDIT) SCRAPE
// ═══════════════════════════════════════════════════════════════════════
bulkScrapeBtn.addEventListener('click', runBulkScrape);

subSortSelect.addEventListener('change', () => {
  const v = subSortSelect.value;
  timeFilterRow.style.display = (v === 'top' || v === 'controversial') ? 'flex' : 'none';
  subSortBadge.textContent = v;
});

async function runBulkScrape() {
  if (isScraping) return;
  if (!currentContext || currentContext.type !== 'sub') return;

  if (currentContext.source === 'reddit') return runRedditBulkScrape();
  return runAdapterBulkScrape();
}

async function runRedditBulkScrape() {
  const tab = currentContext?.tab;
  if (!tab) return;

  setBusy(true, bulkScrapeBtn, bulkBtnLabel, 'Scrape & aggregate', 'Scraping…');
  setDot(subStatusDot, 'working');
  hideSetupStatus(subStatusMsg);
  showSetupProgress(subProgressWrap, subProgressFill, subProgressLabel, 'Injecting scraper…');

  const options = {
    subreddit:     currentContext.subreddit,
    sort:          subSortSelect.value,
    timeFilter:    timeFilter.value,
    threadLimit:   parseInt(threadLimit.value, 10),
    commentLimit:  parseInt(bulkCommentLimit.value, 10),
    minComments:   parseInt(minComments.value, 10),
    includeReplies: true,
    autoExpand:    bulkAutoExpand.checked,
    throttleMs:    700,
  };

  try {
    await chrome.scripting.executeScript({
      target: { tabId: tab.id },
      files:  ['content.js'],
    });
  } catch (_) {}

  let resolved = false;
  const listener = (msg, sender) => {
    if (sender.tab?.id !== tab.id) return;
    if (msg.type !== 'UREDDIT_BULK_RESULT') return;
    resolved = true;
    chrome.runtime.onMessage.removeListener(listener);
    handleBulkResult(msg.payload);
  };
  chrome.runtime.onMessage.addListener(listener);

  try {
    await chrome.tabs.sendMessage(tab.id, { type: 'UREDDIT_SCRAPE_SUB', options });
    setTimeout(() => {
      if (resolved || !isScraping) return;
      chrome.runtime.onMessage.removeListener(listener);
      setBusy(false, bulkScrapeBtn, bulkBtnLabel, 'Scrape & aggregate', 'Scraping…');
      hideSetupProgress(subProgressWrap, subProgressFill);
      showSetupStatus(subStatusMsg, '⚠ Bulk scrape timed out. Try fewer threads or disable expand.', 'error');
      setDot(subStatusDot, 'error');
    }, 600000);
  } catch (err) {
    chrome.runtime.onMessage.removeListener(listener);
    setBusy(false, bulkScrapeBtn, bulkBtnLabel, 'Scrape & aggregate', 'Scraping…');
    hideSetupProgress(subProgressWrap, subProgressFill);
    showSetupStatus(subStatusMsg, '❌ Could not reach page. Reload Reddit and try again.', 'error');
    setDot(subStatusDot, 'error');
  }
}

async function runAdapterBulkScrape() {
  const adapter = UR.sources[currentContext.source];
  if (!adapter) {
    showSetupStatus(subStatusMsg, '❌ No adapter for ' + currentContext.source, 'error');
    return;
  }

  setBusy(true, bulkScrapeBtn, bulkBtnLabel, 'Scrape & aggregate', 'Scraping…');
  setDot(subStatusDot, 'working');
  hideSetupStatus(subStatusMsg);
  showSetupProgress(subProgressWrap, subProgressFill, subProgressLabel, 'Initializing…');

  // Build source-specific options
  const options = {
    threadLimit:   parseInt(threadLimit.value, 10),
    commentLimit:  parseInt(bulkCommentLimit.value, 10),
    sort:          subSortSelect.value,
    timeFilter:    timeFilter.value,
    state:         timeFilter.value,         // reused for GitHub (open/closed/all via the time-filter dropdown)
    throttleMs:    300,
  };

  try {
    const payload = await adapter.scrapeListing(currentContext, options, (p) => {
      if (p.label) subProgressLabel.textContent = p.label;
      if (typeof p.current === 'number' && typeof p.total === 'number' && p.total > 0) {
        setSetupProgressPct(subProgressFill, subProgressWrap, (p.current / p.total) * 100);
      }
    });
    handleBulkResult(payload);
  } catch (err) {
    setBusy(false, bulkScrapeBtn, bulkBtnLabel, 'Scrape & aggregate', 'Scraping…');
    hideSetupProgress(subProgressWrap, subProgressFill);
    showSetupStatus(subStatusMsg, '❌ ' + (err.message || 'Scraping failed'), 'error');
    setDot(subStatusDot, 'error');
  }
}

async function handleBulkResult(payload) {
  setBusy(false, bulkScrapeBtn, bulkBtnLabel, 'Scrape & aggregate', 'Scraping…');
  hideSetupProgress(subProgressWrap, subProgressFill);

  if (!payload || payload.error) {
    showSetupStatus(subStatusMsg, '❌ ' + (payload?.error || 'Unknown bulk-scrape error.'), 'error');
    setDot(subStatusDot, 'error');
    return;
  }

  setDot(subStatusDot, 'ready');
  subFootMeta.textContent = `${payload.data.threads.length} threads`;

  await archiveSave('bulk', payload.data, payload.stats);
  await refreshHistoryBadges();

  preview.mode       = 'bulk_list';
  preview.bulk       = payload.data;
  preview.stats      = payload.stats;
  preview.data       = null;
  preview.drillIdx   = -1;
  preview.returnView = 'viewSubSetup';

  renderPreview();
  showView('viewPreview');
}

// ═══════════════════════════════════════════════════════════════════════
// ARCHIVE (chrome.storage.local)
// ═══════════════════════════════════════════════════════════════════════
const ARCHIVE_KEY = 'ureddit_archive_v3';

async function archiveLoad() {
  try {
    const result = await chrome.storage.local.get([ARCHIVE_KEY]);
    return result[ARCHIVE_KEY] || {};
  } catch (e) { console.error('archive load failed', e); return {}; }
}

async function archiveSaveRaw(archive) {
  try { await chrome.storage.local.set({ [ARCHIVE_KEY]: archive }); }
  catch (e) { console.error('archive save failed', e); }
}

async function archiveSave(type, data, stats) {
  const archive = await archiveLoad();
  let id, title, subreddit;

  if (type === 'single') {
    id = data.name || ('single_' + (data.id || Date.now()));
    title = data.title || '(untitled)';
    subreddit = data.subreddit || '';
  } else {
    id = `bulk_${data.subreddit}_${data.sort}_${Date.now()}`;
    title = `r/${data.subreddit} · ${data.sort}`;
    subreddit = data.subreddit || '';
  }

  // Preserve existing analyses if re-scraping the same thread
  const existingAnalyses = archive[id]?.analyses || [];

  archive[id] = {
    id,
    type,
    title,
    subreddit,
    saved_at: Date.now(),
    data,
    stats,
    analyses: existingAnalyses,
  };
  await archiveSaveRaw(archive);
}

async function archiveDelete(id) {
  const archive = await archiveLoad();
  delete archive[id];
  await archiveSaveRaw(archive);
}

async function archiveClear() {
  await chrome.storage.local.remove([ARCHIVE_KEY]);
}

async function archiveList() {
  const archive = await archiveLoad();
  return Object.values(archive).sort((a, b) => b.saved_at - a.saved_at);
}

async function refreshHistoryBadges() {
  const archive = await archiveLoad();
  const count = Object.keys(archive).length;
  [tsHistoryBadge, ssHistoryBadge].forEach(b => {
    if (!b) return;
    if (count > 0) {
      b.textContent = count > 99 ? '99+' : String(count);
      b.style.display = 'block';
    } else {
      b.style.display = 'none';
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════
// HISTORY VIEW
// ═══════════════════════════════════════════════════════════════════════
async function openHistory() {
  await renderHistory();
  showView('viewHistory');
}

async function renderHistory() {
  const items = await archiveList();
  historyScroll.innerHTML = '';
  historyCountSub.textContent = `${items.length} scrape${items.length === 1 ? '' : 's'} saved`;
  historyStatCount.textContent = items.length;

  // Rough byte estimate
  let bytes = 0;
  try {
    const raw = await chrome.storage.local.getBytesInUse?.([ARCHIVE_KEY]);
    bytes = raw || 0;
  } catch (_) {
    try { bytes = JSON.stringify(items).length; } catch (_) {}
  }
  historyStatKb.textContent = (bytes / 1024).toFixed(1);

  if (!items.length) {
    const empty = el('div', 'history-empty');
    empty.appendChild(el('div', 'history-empty-icon', '∅'));
    empty.appendChild(el('div', 'history-empty-title', 'Nothing saved yet'));
    empty.appendChild(el('div', 'history-empty-desc', 'Scrapes will appear here as you run them. The archive persists across browser sessions.'));
    historyScroll.appendChild(empty);
    return;
  }

  // Group by relative time bucket
  const now = Date.now();
  const groups = { today: [], yesterday: [], thisWeek: [], older: [] };
  for (const item of items) {
    const ageH = (now - item.saved_at) / 3600_000;
    if (ageH < 24)       groups.today.push(item);
    else if (ageH < 48)  groups.yesterday.push(item);
    else if (ageH < 168) groups.thisWeek.push(item);
    else                 groups.older.push(item);
  }

  for (const [key, label] of [['today','Today'], ['yesterday','Yesterday'], ['thisWeek','Earlier this week'], ['older','Older']]) {
    if (!groups[key].length) continue;
    historyScroll.appendChild(el('div', 'history-group-label', label.toLowerCase()));
    groups[key].forEach(item => historyScroll.appendChild(renderHistoryItem(item)));
  }
}

function renderHistoryItem(item) {
  const wrap = el('div', 'history-item');

  const typeLabel = item.type === 'bulk' ? 'BULK' : 'THREAD';
  wrap.appendChild(el('span', 'h-type ' + item.type, typeLabel));

  const body = el('div', 'history-item-body');
  body.appendChild(el('div', 'history-item-title', item.title));

  const subMeta = [];
  if (item.subreddit) subMeta.push(`r/${item.subreddit}`);
  if (item.type === 'bulk') subMeta.push(`${item.data?.threads?.length || 0} threads`);
  else                      subMeta.push(`${(item.stats?.comments || 0) + (item.stats?.replies || 0)} comments`);
  subMeta.push(relTime(new Date(item.saved_at).toISOString()));
  body.appendChild(el('div', 'history-item-sub', subMeta.join(' · ')));
  wrap.appendChild(body);

  const actions = el('div', 'history-item-actions');
  const openBtn = el('button', 'mini-btn', 'Open');
  openBtn.addEventListener('click', () => openFromHistory(item));
  actions.appendChild(openBtn);

  const delBtn = el('button', 'mini-btn danger', 'Delete');
  delBtn.addEventListener('click', async (e) => {
    e.stopPropagation();
    if (!confirm(`Delete this ${item.type === 'bulk' ? 'bulk scrape' : 'thread'}?\n\n"${item.title}"`)) return;
    await archiveDelete(item.id);
    await renderHistory();
    await refreshHistoryBadges();
  });
  actions.appendChild(delBtn);
  wrap.appendChild(actions);

  return wrap;
}

function openFromHistory(item) {
  if (item.type === 'single') {
    preview.mode       = 'single';
    preview.data       = item.data;
    preview.stats      = item.stats;
    preview.bulk       = null;
    preview.drillIdx   = -1;
    preview.returnView = 'viewHistory';
  } else {
    preview.mode       = 'bulk_list';
    preview.bulk       = item.data;
    preview.stats      = item.stats;
    preview.data       = null;
    preview.drillIdx   = -1;
    preview.returnView = 'viewHistory';
  }
  renderPreview();
  showView('viewPreview');
}

exportAllBtn.addEventListener('click', async () => {
  const archive = await archiveLoad();
  const blob = new Blob([JSON.stringify(archive, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const ts = new Date().toISOString().slice(0, 10);
  chrome.downloads.download(
    { url, filename: `ureddit_archive_${ts}.json`, saveAs: true },
    () => URL.revokeObjectURL(url)
  );
});

clearAllBtn.addEventListener('click', async () => {
  const items = await archiveList();
  if (!items.length) return;
  if (!confirm(`Delete all ${items.length} saved scrapes? This cannot be undone.`)) return;
  await archiveClear();
  await renderHistory();
  await refreshHistoryBadges();
});

// ═══════════════════════════════════════════════════════════════════════
// PREVIEW RENDERER
// ═══════════════════════════════════════════════════════════════════════

function hashCode(s) { let h=0; for (let i=0;i<s.length;i++) h=((h<<5)-h+s.charCodeAt(i))|0; return Math.abs(h); }
function avatarColors(username) { const i = hashCode(username || '_') % AVATAR_COLORS.length; return AVATAR_COLORS[i]; }

function relTime(iso) {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '';
  const diff = (Date.now() - t) / 1000;
  if (diff < 60)       return `${Math.floor(diff)}s ago`;
  if (diff < 3600)     return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400)    return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 604800)   return `${Math.floor(diff / 86400)}d ago`;
  if (diff < 2592000)  return `${Math.floor(diff / 604800)}w ago`;
  if (diff < 31536000) return `${Math.floor(diff / 2592000)}mo ago`;
  return `${Math.floor(diff / 31536000)}y ago`;
}

function fmtScore(s) {
  if (s === '' || s == null) return '—';
  const n = parseInt(s, 10);
  if (isNaN(n)) return String(s);
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1000)      return (n / 1000).toFixed(n >= 10000 ? 0 : 1) + 'k';
  return String(n);
}

function el(tag, className, text) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  if (text != null) e.textContent = text;
  return e;
}

function svg(path, strokeWidth = '2') {
  const s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  s.setAttribute('viewBox', '0 0 24 24');
  s.setAttribute('fill', 'none');
  s.setAttribute('stroke', 'currentColor');
  s.setAttribute('stroke-width', strokeWidth);
  s.setAttribute('stroke-linecap', 'round');
  s.setAttribute('stroke-linejoin', 'round');
  s.innerHTML = path;
  return s;
}

function renderPreview() {
  resetFilterState();
  preview.tab = 'comments';
  preview.clusterResult = null;
  preview._analyses = [];
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === 'comments'));
  clustersArea.innerHTML = '';
  analysisArea.innerHTML = '';

  if (preview.mode === 'bulk_list')         renderBulkList();
  else if (preview.mode === 'bulk_thread')  renderSingleThread(preview.bulk.threads[preview.drillIdx]);
  else                                      renderSingleThread(preview.data);

  applyViewState();
  updateTabCounts();
  pvScroll.scrollTop = 0;

  // Load any saved analyses for this scrape (async, updates tab count when loaded)
  loadAnalysesForCurrent().then(() => updateTabCounts());
}

// ═══════════════════════════════════════════════════════════════════════
// TAB SWITCHING + VIEW STATE
// ═══════════════════════════════════════════════════════════════════════
tabButtons.forEach(btn => {
  btn.addEventListener('click', () => {
    if (btn.dataset.view === preview.tab) return;
    setTab(btn.dataset.view);
  });
});

function setTab(tab) {
  preview.tab = tab;
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === tab));
  applyViewState();
  if (tab === 'clusters') ensureClustersRendered();
  if (tab === 'analysis') ensureAnalysisRendered();
  pvScroll.scrollTop = 0;
}

function applyViewState() {
  const mode = preview.mode;
  const tab  = preview.tab;

  // Hide everything
  bulkHeader.style.display     = 'none';
  threadListArea.style.display = 'none';
  postCardEl.style.display     = 'none';
  topCommenters.style.display  = 'none';
  treeHeader.style.display     = 'none';
  commentTreeEl.style.display  = 'none';
  clustersArea.style.display   = 'none';
  analysisArea.style.display   = 'none';

  if (tab === 'clusters') {
    clustersArea.style.display = 'block';
    if (mode === 'bulk_list') bulkHeader.style.display = 'block';
    pvToolbar.classList.add('hidden');
  } else if (tab === 'analysis') {
    analysisArea.style.display = 'block';
    if (mode === 'bulk_list') bulkHeader.style.display = 'block';
    pvToolbar.classList.add('hidden');
  } else {
    // Comments tab
    if (mode === 'bulk_list') {
      bulkHeader.style.display = 'block';
      threadListArea.style.display = 'block';
      pvToolbar.classList.add('hidden');
    } else {
      postCardEl.style.display = 'block';
      if (topCommenters.innerHTML.trim()) topCommenters.style.display = 'block';
      treeHeader.style.display = 'block';
      commentTreeEl.style.display = 'block';
      pvToolbar.classList.remove('hidden');
    }
  }
}

function updateTabCounts() {
  // Comments count (total from stats for the current target)
  const tgt = getCurrentExportTarget();
  if (!tgt || !tgt.data) {
    tabCountComments.textContent = '0';
    tabCountClusters.textContent = '—';
    return;
  }
  if (tgt.kind === 'bulk') {
    const stats = preview.stats || {};
    tabCountComments.textContent = stats.threads || (tgt.data.threads?.length || 0);
  } else {
    const flat = UR.flatten(tgt.data.comments || []);
    tabCountComments.textContent = flat.length;
  }
  // Cluster count (placeholder until computed)
  tabCountClusters.textContent = preview.clusterResult ? String(preview.clusterResult.clusters.length) : '—';
  // Analysis count
  tabCountAnalysis.textContent = (preview._analyses && preview._analyses.length) ? String(preview._analyses.length) : '—';
}

// ═══════════════════════════════════════════════════════════════════════
// CLUSTER RENDERING
// ═══════════════════════════════════════════════════════════════════════
async function ensureClustersRendered() {
  if (preview.clusterResult) {
    renderClustersUI();
    return;
  }
  clustersArea.innerHTML = '';
  const loading = el('div', 'clusters-loading', 'Preparing clustering…');
  clustersArea.appendChild(loading);
  await new Promise(r => setTimeout(r, 30));  // let paint happen

  try {
    const source = preview.mode === 'bulk_list' ? preview.bulk
                 : preview.mode === 'bulk_thread' ? preview.bulk.threads[preview.drillIdx]
                 : preview.data;
    const items = UR.flattenForClustering(preview.mode === 'bulk_list' ? preview.bulk : source);

    let result;

    if (settings.openaiKey && items.length >= 8) {
      // Semantic embeddings path
      loading.textContent = `Computing semantic embeddings for ${items.length} comments…`;

      // Check cache
      const texts = items.map(it => (it.text || '').slice(0, 2000));
      const cacheKey = 'emb_' + UR.hashText(texts.length + '|' + texts.join('|||').slice(0, 3000));
      let embeddings = null;
      try {
        const cached = await chrome.storage.local.get([cacheKey]);
        if (cached[cacheKey]?.length === items.length) {
          embeddings = cached[cacheKey].map(arr => new Float32Array(arr));
        }
      } catch {}

      if (!embeddings) {
        try {
          embeddings = await UR.callOpenAIEmbeddings({
            apiKey: settings.openaiKey,
            texts,
            dimensions: 384,
            onProgress: (cur, tot) => {
              loading.textContent = `Embedding ${cur}/${tot}…`;
            },
          });
          try {
            await chrome.storage.local.set({
              [cacheKey]: embeddings.map(v => Array.from(v)),
            });
          } catch {}
        } catch (e) {
          console.warn('[Ureddit] OpenAI embeddings failed, falling back to TF-IDF:', e.message);
          toast('⚠ Embeddings failed (' + e.message + ') — using TF-IDF', 'error');
          embeddings = null;
        }
      }

      if (embeddings) {
        loading.textContent = 'Clustering with semantic similarity…';
        result = UR.clusterWithEmbeddings(items, embeddings, {
          minClusterSize: preview.mode === 'bulk_list' ? 3 : 2,
        });
      } else {
        loading.textContent = 'Clustering with TF-IDF (fallback)…';
        result = UR.cluster(items, {
          minClusterSize: preview.mode === 'bulk_list' ? 3 : 2,
          similarityThreshold: 0.28,
        });
      }
    } else {
      // TF-IDF path
      loading.textContent = 'Clustering with TF-IDF…';
      result = UR.cluster(items, {
        minClusterSize: preview.mode === 'bulk_list' ? 3 : 2,
        similarityThreshold: 0.28,
      });
    }

    preview.clusterResult = result;
    preview.clusterResult.items = items;
    tabCountClusters.textContent = String(result.clusters.length);
    renderClustersUI();
  } catch (e) {
    console.error('[Ureddit] clustering failed:', e);
    clustersArea.innerHTML = '';
    const err = el('div', 'clusters-empty');
    err.appendChild(el('div', 'clusters-empty-icon', '!'));
    err.appendChild(el('div', 'clusters-empty-title', 'Clustering failed'));
    err.appendChild(el('div', 'clusters-empty-desc', e.message || 'Unknown error'));
    clustersArea.appendChild(err);
  }
}

function renderClustersUI() {
  clustersArea.innerHTML = '';
  const { clusters, stats, items } = preview.clusterResult;

  if (!clusters.length) {
    const empty = el('div', 'clusters-empty');
    empty.appendChild(el('div', 'clusters-empty-icon', '∅'));
    empty.appendChild(el('div', 'clusters-empty-title', 'No clusters detected'));
    empty.appendChild(el('div', 'clusters-empty-desc', stats.total < 20
      ? `Only ${stats.total} comments — clustering needs 20+ for reliable signal.`
      : 'Comments are too dissimilar to form reliable clusters. Try a bulk scrape for cross-thread patterns.'
    ));
    clustersArea.appendChild(empty);
    return;
  }

  // Summary banner
  const summary = el('div', 'clusters-summary');
  summary.innerHTML = `<strong>${clusters.length}</strong> clusters from <strong>${stats.total}</strong> comments · <strong>${stats.clustered}</strong> clustered (${Math.round(stats.clustered / stats.total * 100)}%) · <strong>${stats.total - stats.clustered}</strong> outliers not grouped`;
  clustersArea.appendChild(summary);

  // Cluster cards
  const frag = document.createDocumentFragment();
  clusters.forEach(c => frag.appendChild(renderClusterCard(c, items)));
  clustersArea.appendChild(frag);
}

function renderClusterCard(cluster, items) {
  const card = el('div', 'cluster-card');

  // Header
  const head = el('div', 'cc-header');
  head.appendChild(el('span', 'cc-id', `Cluster ${cluster.id}`));
  head.appendChild(el('span', 'cc-size', `${cluster.size} comments`));
  card.appendChild(head);

  // Meta row
  const meta = el('div', 'cc-meta');
  const authorStat = el('span', '');
  authorStat.innerHTML = `<strong>${cluster.unique_authors}</strong> unique authors`;
  meta.appendChild(authorStat);
  if (cluster.thread_count > 1) {
    const threadStat = el('span', '');
    threadStat.innerHTML = `<strong>${cluster.thread_count}</strong> threads`;
    meta.appendChild(threadStat);
  }
  if (cluster.flag_counts.pain_point) {
    const f = el('span', 'cc-meta-flag pain');
    f.appendChild(document.createTextNode(`${cluster.flag_counts.pain_point} pain`));
    meta.appendChild(f);
  }
  if (cluster.flag_counts.feature_request) {
    const f = el('span', 'cc-meta-flag request');
    f.appendChild(document.createTextNode(`${cluster.flag_counts.feature_request} request`));
    meta.appendChild(f);
  }
  if (cluster.flag_counts.positive) {
    const f = el('span', 'cc-meta-flag praise');
    f.appendChild(document.createTextNode(`${cluster.flag_counts.positive} praise`));
    meta.appendChild(f);
  }
  card.appendChild(meta);

  // Keywords
  if (cluster.keywords.length) {
    const kw = el('div', 'cc-keywords');
    cluster.keywords.forEach(w => kw.appendChild(el('span', 'cc-kw', w)));
    card.appendChild(kw);
  }

  // Sample quotes (3 by default)
  const samples = el('div', 'cc-samples');
  cluster.sample_members.forEach(mi => {
    const m = items[mi];
    const sampleEl = el('div', 'cc-sample');
    const txt = (m.text || '').replace(/\s+/g, ' ').slice(0, 220);
    sampleEl.appendChild(el('div', 'cc-quote', `"${txt}${m.text.length > 220 ? '…' : ''}"`));
    const cite = el('div', 'cc-cite');
    const au = el('span', 'cc-cite-author', '— u/' + (m.author || '?'));
    cite.appendChild(au);
    if (m._threadIdx !== undefined && preview.mode === 'bulk_list' && preview.bulk) {
      cite.appendChild(el('span', 'cc-cite-thread', `[T${m._threadIdx + 1}]`));
    }
    sampleEl.appendChild(cite);
    samples.appendChild(sampleEl);
  });
  card.appendChild(samples);

  // Expanded members (hidden by default)
  const expanded = el('div', 'cc-expanded-members');
  cluster.members.forEach(mi => {
    const m = items[mi];
    const memberEl = el('div', 'cc-member');
    const mh = el('div', 'cc-member-head');
    mh.appendChild(el('span', 'cc-member-author', 'u/' + (m.author || '?')));
    if (m.score !== '' && m.score !== undefined && parseInt(m.score, 10)) {
      mh.appendChild(document.createTextNode(`${fmtScore(m.score)} pts`));
    }
    if (m._timestamp) mh.appendChild(document.createTextNode(relTime(m._timestamp)));
    if (m._threadIdx !== undefined && preview.bulk) {
      mh.appendChild(el('span', 'cc-member-thread', `T${m._threadIdx + 1}`));
    }
    memberEl.appendChild(mh);
    memberEl.appendChild(el('div', 'cc-member-body', m.text || ''));
    expanded.appendChild(memberEl);
  });
  card.appendChild(expanded);

  // Actions
  const actions = el('div', 'cc-actions');

  const expandBtn = el('button', 'cc-action-btn');
  const expSvg = svg('<polyline points="6 9 12 15 18 9"/>');
  expandBtn.appendChild(expSvg);
  expandBtn.appendChild(document.createTextNode(`Show all ${cluster.size}`));
  expandBtn.addEventListener('click', () => {
    const isExp = card.classList.toggle('expanded');
    expandBtn.lastChild.data = isExp ? `Show samples` : `Show all ${cluster.size}`;
  });
  actions.appendChild(expandBtn);

  const copyBtn = el('button', 'cc-action-btn');
  copyBtn.appendChild(svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'));
  copyBtn.appendChild(document.createTextNode('Copy cluster'));
  copyBtn.addEventListener('click', () => copyClusterAsMarkdown(cluster, items));
  actions.appendChild(copyBtn);

  const promptBtn = el('button', 'cc-action-btn');
  promptBtn.appendChild(svg('<path d="M15 4V2"/><path d="M15 16v-2"/><path d="M8 9h2"/><path d="M20 9h2"/><path d="M17.8 11.8 19 13"/><path d="M15 9h.01"/><path d="M17.8 6.2 19 5"/><path d="m3 21 9-9"/><path d="M12.2 6.2 11 5"/>'));
  promptBtn.appendChild(document.createTextNode('Copy + analyze prompt'));
  promptBtn.addEventListener('click', () => copyClusterWithPrompt(cluster, items));
  actions.appendChild(promptBtn);

  card.appendChild(actions);

  return card;
}

function buildClusterMarkdown(cluster, items) {
  const lines = [];
  lines.push(`## Cluster ${cluster.id} — ${cluster.keywords.slice(0, 4).join(', ')}`);
  lines.push('');
  lines.push(`**Size:** ${cluster.size} comments · **Unique authors:** ${cluster.unique_authors}${cluster.thread_count > 1 ? ` · **Threads:** ${cluster.thread_count}` : ''}`);
  if (cluster.flag_counts.pain_point) lines.push(`**Pain signals:** ${cluster.flag_counts.pain_point}`);
  if (cluster.flag_counts.feature_request) lines.push(`**Feature requests:** ${cluster.flag_counts.feature_request}`);
  lines.push(`**Keywords:** ${cluster.keywords.join(', ')}`);
  lines.push('');
  lines.push('### Comments in this cluster');
  lines.push('');
  cluster.members.forEach((mi, i) => {
    const m = items[mi];
    const tag = m._threadIdx !== undefined && preview.bulk
      ? `[T${m._threadIdx + 1}.C${i + 1}]`
      : `[C${i + 1}]`;
    const meta = [`u/${m.author || '?'}`];
    if (m.score) meta.push(`${m.score} pts`);
    if (m._timestamp) meta.push(UR.fmtTime(m._timestamp));
    lines.push(`**${tag}** ${meta.join(' · ')}`);
    lines.push(`> ${m.text.replace(/\n/g, '\n> ')}`);
    lines.push('');
  });
  return lines.join('\n');
}

function copyClusterAsMarkdown(cluster, items) {
  const md = buildClusterMarkdown(cluster, items);
  navigator.clipboard.writeText(md)
    .then(() => toast(`✓ Copied cluster ${cluster.id} as markdown (${(md.length / 1024).toFixed(1)} KB)`))
    .catch(err => toast('❌ Clipboard blocked: ' + err.message, 'error'));
}

// ═══════════════════════════════════════════════════════════════════════
// ANALYSIS TAB — in-app Claude streaming
// ═══════════════════════════════════════════════════════════════════════

function ensureAnalysisRendered() {
  const tgt = getCurrentExportTarget();
  if (!tgt?.data) return;

  if (!settings.anthropicKey) {
    renderAnalysisNoKey();
    return;
  }
  renderAnalysisPanel();
}

function renderAnalysisNoKey() {
  analysisArea.innerHTML = '';
  const empty = el('div', 'analysis-empty');
  empty.appendChild(el('div', 'analysis-empty-icon', 'AI'));
  empty.appendChild(el('div', 'analysis-empty-title', 'Set up AI analysis'));
  empty.appendChild(el('div', 'analysis-empty-desc',
    'Add your Anthropic API key in settings to run research prompts inside Ureddit. Results save to the archive alongside the scrape.'));
  const btn = el('button', 'mini-btn', 'Open settings →');
  btn.addEventListener('click', openSettings);
  empty.appendChild(btn);
  analysisArea.appendChild(empty);
}

function renderAnalysisPanel() {
  analysisArea.innerHTML = '';

  // Config card
  const cfg = el('div', 'ax-config');

  const promptRow = el('div', 'ax-config-row');
  promptRow.appendChild(el('div', 'ax-config-label', 'prompt'));
  const promptSelect = document.createElement('select');
  promptSelect.className = 'ax-prompt-select';
  promptSelect.id = 'axPromptSelect';
  (UR.PROMPTS || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value = p.id;
    opt.textContent = p.label;
    promptSelect.appendChild(opt);
  });
  promptSelect.value = 'decision_memo';
  promptRow.appendChild(promptSelect);
  cfg.appendChild(promptRow);

  const modelRow = el('div', 'ax-config-row');
  modelRow.appendChild(el('div', 'ax-config-label', 'model'));
  const modelSel = document.createElement('select');
  modelSel.className = 'ax-model-select';
  modelSel.id = 'axModelSelect';
  [
    ['claude-haiku-4-5',  'Haiku 4.5 — fast, cheap'],
    ['claude-sonnet-4-6', 'Sonnet 4.6 — balanced (recommended)'],
    ['claude-opus-4-7',   'Opus 4.7 — best quality'],
  ].forEach(([v, l]) => {
    const opt = document.createElement('option');
    opt.value = v;
    opt.textContent = l;
    modelSel.appendChild(opt);
  });
  modelSel.value = settings.model;
  modelRow.appendChild(modelSel);
  cfg.appendChild(modelRow);

  const actions = el('div', 'ax-config-actions');
  const runBtn = el('button', 'ax-run-btn');
  runBtn.id = 'axRunBtn';
  runBtn.appendChild(svg('<polygon points="5 3 19 12 5 21 5 3"/>'));
  runBtn.appendChild(document.createTextNode('Run analysis'));
  runBtn.addEventListener('click', () => runAnalysis(promptSelect.value, modelSel.value));
  actions.appendChild(runBtn);

  // Cost estimate
  const costHint = el('span', 'ax-cost-hint');
  try {
    const mdBody = buildContent('md').body;
    const structuredBody = (UR.PROMPTS.find(p => p.id === promptSelect.value)?.needsStructured)
      ? UR.buildStructuredSummary(getCurrentExportTarget().data)
      : '';
    const approxTokens = Math.ceil((mdBody.length + structuredBody.length) / 3.5);
    const costLow = (pricePerM(modelSel.value, 'input') * approxTokens / 1_000_000).toFixed(3);
    costHint.textContent = `~${(approxTokens / 1000).toFixed(0)}k tokens · ~$${costLow} in`;
  } catch { costHint.textContent = ''; }
  actions.appendChild(costHint);

  // Update cost on selection change
  const updateCost = () => {
    try {
      const mdBody = buildContent('md').body;
      const needsStr = (UR.PROMPTS.find(p => p.id === promptSelect.value)?.needsStructured);
      const structuredBody = needsStr ? UR.buildStructuredSummary(getCurrentExportTarget().data) : '';
      const tok = Math.ceil((mdBody.length + structuredBody.length) / 3.5);
      const cost = (pricePerM(modelSel.value, 'input') * tok / 1_000_000).toFixed(3);
      costHint.textContent = `~${(tok / 1000).toFixed(0)}k tokens · ~$${cost} in`;
    } catch {}
  };
  promptSelect.addEventListener('change', updateCost);
  modelSel.addEventListener('change', updateCost);

  cfg.appendChild(actions);
  analysisArea.appendChild(cfg);

  // Previous analyses
  if (preview._analyses && preview._analyses.length) {
    const divider = el('div', 'tree-header');
    divider.style.margin = '14px 0 8px';
    divider.textContent = `saved analyses (${preview._analyses.length})`;
    analysisArea.appendChild(divider);

    // Newest first
    const sorted = [...preview._analyses].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
    sorted.forEach(a => analysisArea.appendChild(renderSavedAnalysisCard(a)));
  }
}

function renderSavedAnalysisCard(analysis) {
  const card = el('div', 'cluster-card');

  const head = el('div', 'cc-header');
  head.appendChild(el('span', 'cc-id', analysis.label || 'Analysis'));
  const sizeEl = el('span', 'cc-size');
  sizeEl.textContent = analysis.model ? analysis.model.replace('claude-', '') : '—';
  head.appendChild(sizeEl);
  card.appendChild(head);

  const meta = el('div', 'cc-meta');
  if (analysis.savedAt) {
    const t = el('span', '');
    t.textContent = relTime(new Date(analysis.savedAt).toISOString());
    meta.appendChild(t);
  }
  if (analysis.inputTokens) {
    const t = el('span', '');
    t.innerHTML = `<strong>${(analysis.inputTokens / 1000).toFixed(1)}k</strong> in · <strong>${(analysis.outputTokens / 1000).toFixed(1)}k</strong> out`;
    meta.appendChild(t);
  }
  if (analysis.cost) {
    const t = el('span', '');
    t.innerHTML = `<strong>$${analysis.cost}</strong>`;
    meta.appendChild(t);
  }
  card.appendChild(meta);

  const result = el('div', 'ax-result');
  result.innerHTML = UR.markdownToHtml(analysis.text || '');
  card.appendChild(result);

  const actions = el('div', 'cc-actions');
  const copyBtn = el('button', 'cc-action-btn');
  copyBtn.appendChild(svg('<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>'));
  copyBtn.appendChild(document.createTextNode('Copy'));
  copyBtn.addEventListener('click', () => {
    navigator.clipboard.writeText(analysis.text).then(() => toast('✓ Analysis copied'));
  });
  actions.appendChild(copyBtn);

  const dlBtn = el('button', 'cc-action-btn');
  dlBtn.appendChild(svg('<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>'));
  dlBtn.appendChild(document.createTextNode('Download'));
  dlBtn.addEventListener('click', () => {
    const blob = new Blob([analysis.text], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const ts = new Date().toISOString().slice(0, 10);
    const slug = (analysis.label || 'analysis').toLowerCase().replace(/[^a-z0-9]+/g, '-');
    chrome.downloads.download({ url, filename: `ureddit_${slug}_${ts}.md`, saveAs: false }, () => URL.revokeObjectURL(url));
    toast('✓ Downloaded');
  });
  actions.appendChild(dlBtn);

  const delBtn = el('button', 'cc-action-btn');
  delBtn.appendChild(document.createTextNode('Delete'));
  delBtn.addEventListener('click', async () => {
    if (!confirm('Delete this analysis?')) return;
    await deleteSavedAnalysis(analysis.id);
    toast('✓ Deleted');
    ensureAnalysisRendered();
    updateTabCounts();
  });
  actions.appendChild(delBtn);

  card.appendChild(actions);
  return card;
}

async function runAnalysis(promptId, model) {
  const tgt = getCurrentExportTarget();
  if (!tgt?.data) return;

  const prompt = (UR.PROMPTS || []).find(p => p.id === promptId);
  if (!prompt) return;

  // Build system prompt + user message
  let systemPrompt = prompt.body;
  let userMessage;
  if (prompt.needsStructured) {
    let structured = '';
    try { structured = UR.buildStructuredSummary(tgt.data); }
    catch { structured = '(structured summary unavailable)\n\n'; }
    const md = buildContent('md').body;
    userMessage = structured + '## Raw thread data\n\n' + md;
  } else {
    userMessage = buildContent('md').body;
  }

  // Disable Run button
  const runBtn = $('axRunBtn');
  const origHTML = runBtn?.innerHTML;
  if (runBtn) {
    runBtn.disabled = true;
    runBtn.innerHTML = '';
    const dot = el('span', 'dot-pulse');
    runBtn.appendChild(dot);
    runBtn.appendChild(document.createTextNode('Running…'));
  }

  // Create streaming container
  const streamContainer = el('div', 'cluster-card');
  streamContainer.style.marginTop = '12px';
  streamContainer.id = 'axStreamContainer';

  const streamHead = el('div', 'cc-header');
  streamHead.appendChild(el('span', 'cc-id', prompt.label));
  streamHead.appendChild(el('span', 'cc-size', model.replace('claude-', '')));
  streamContainer.appendChild(streamHead);

  const statusEl = el('div', 'ax-status');
  const dot = el('span', 'dot-pulse');
  statusEl.appendChild(dot);
  statusEl.appendChild(document.createTextNode(`Streaming from ${model.replace('claude-', '')}…`));
  streamContainer.appendChild(statusEl);

  const resultEl = el('div', 'ax-result');
  streamContainer.appendChild(resultEl);

  // Insert after ax-config (first child)
  const firstCard = analysisArea.querySelector('.ax-config');
  if (firstCard && firstCard.nextSibling) {
    analysisArea.insertBefore(streamContainer, firstCard.nextSibling);
  } else {
    analysisArea.appendChild(streamContainer);
  }

  // Auto-scroll as content streams in
  pvScroll.scrollTop = streamContainer.offsetTop - 10;

  let fullText = '';
  let rafPending = false;
  let scrollPending = false;
  const updateResult = () => {
    rafPending = false;
    resultEl.innerHTML = UR.markdownToHtml(fullText);
    if (!scrollPending) {
      scrollPending = true;
      requestAnimationFrame(() => {
        scrollPending = false;
        // Stick to bottom while streaming
        pvScroll.scrollTop = pvScroll.scrollHeight;
      });
    }
  };

  await UR.callClaude({
    apiKey: settings.anthropicKey,
    model,
    system: systemPrompt,
    messages: [{ role: 'user', content: userMessage }],
    maxTokens: 4096,
    onDelta: (chunk) => {
      fullText += chunk;
      if (!rafPending) {
        rafPending = true;
        requestAnimationFrame(updateResult);
      }
    },
    onDone: async (info) => {
      // Final render
      resultEl.innerHTML = UR.markdownToHtml(fullText);

      // Remove status, add meta
      statusEl.remove();

      const priceIn  = pricePerM(model, 'input')  * (info.inputTokens  || 0) / 1_000_000;
      const priceOut = pricePerM(model, 'output') * (info.outputTokens || 0) / 1_000_000;
      const totalCost = (priceIn + priceOut).toFixed(3);

      const metaEl = el('div', 'ax-result-meta');
      const parts = [];
      if (info.inputTokens)  parts.push(`<span><strong>${(info.inputTokens / 1000).toFixed(1)}k</strong> input</span>`);
      if (info.outputTokens) parts.push(`<span><strong>${(info.outputTokens / 1000).toFixed(1)}k</strong> output</span>`);
      parts.push(`<span><strong>$${totalCost}</strong></span>`);
      parts.push(`<span style="margin-left:auto;color:var(--success);font-weight:600">✓ Complete</span>`);
      metaEl.innerHTML = parts.join('');
      streamContainer.appendChild(metaEl);

      // Save to archive
      const saved = {
        id:           'an_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        label:        prompt.label,
        promptId,
        model,
        savedAt:      Date.now(),
        text:         fullText,
        inputTokens:  info.inputTokens  || 0,
        outputTokens: info.outputTokens || 0,
        cost:         totalCost,
      };
      await saveAnalysisToArchive(saved);
      preview._analyses = preview._analyses || [];
      preview._analyses.unshift(saved);
      updateTabCounts();

      // Reset run button
      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '';
        runBtn.appendChild(svg('<polygon points="5 3 19 12 5 21 5 3"/>'));
        runBtn.appendChild(document.createTextNode('Run again'));
      }

      toast(`✓ Analysis complete · $${totalCost}`);
    },
    onError: (err) => {
      statusEl.innerHTML = '';
      statusEl.style.background = 'var(--error-soft)';
      statusEl.style.borderColor = 'var(--error-border)';
      statusEl.style.color = 'var(--error)';
      statusEl.textContent = '✗ ' + (err.message || 'Analysis failed');

      if (runBtn) {
        runBtn.disabled = false;
        runBtn.innerHTML = '';
        runBtn.appendChild(svg('<polygon points="5 3 19 12 5 21 5 3"/>'));
        runBtn.appendChild(document.createTextNode('Try again'));
      }
      toast('❌ ' + (err.message || 'Analysis failed'), 'error');
    },
  });
}

function sourceDisplayLabel(source) {
  const map = {
    'json':          'reddit · json api',
    'dom':           'reddit · dom scrape',
    'hn':            'hacker news',
    'stackoverflow': 'stack overflow',
    'github':        'github api',
  };
  return map[source] || source || 'unknown';
}

function pricePerM(model, type) {
  // Approximate 2026 pricing, $ per 1M tokens
  const prices = {
    'claude-haiku-4-5':  { input: 1,   output: 5 },
    'claude-sonnet-4-6': { input: 3,   output: 15 },
    'claude-opus-4-7':   { input: 15,  output: 75 },
  };
  const p = prices[model] || prices['claude-sonnet-4-6'];
  return p[type] || 0;
}

// ═══════════════════════════════════════════════════════════════════════
// ARCHIVE: analysis attachment
// ═══════════════════════════════════════════════════════════════════════

async function saveAnalysisToArchive(analysis) {
  const archive = await archiveLoad();
  const tgt = getCurrentExportTarget();
  if (!tgt?.data) return;

  let entry = null;
  if (tgt.kind === 'bulk') {
    for (const e of Object.values(archive)) {
      if (e.type === 'bulk' && e.data?.scraped_at === tgt.data.scraped_at) { entry = e; break; }
    }
  } else {
    entry = archive[tgt.data.name];
    if (!entry) {
      // Scrape wasn't archived (shouldn't happen — we auto-save scrapes). Create a thin entry.
      const thinId = tgt.data.name || ('single_' + Date.now());
      entry = {
        id: thinId,
        type: 'single',
        title: tgt.data.title || '(untitled)',
        subreddit: tgt.data.subreddit || '',
        saved_at: Date.now(),
        data: tgt.data,
        stats: preview.stats,
      };
      archive[thinId] = entry;
    }
  }
  if (!entry) return;

  entry.analyses = entry.analyses || [];
  entry.analyses.unshift(analysis);
  await archiveSaveRaw(archive);
}

async function deleteSavedAnalysis(id) {
  const archive = await archiveLoad();
  for (const entry of Object.values(archive)) {
    if (entry.analyses) entry.analyses = entry.analyses.filter(a => a.id !== id);
  }
  await archiveSaveRaw(archive);
  if (preview._analyses) preview._analyses = preview._analyses.filter(a => a.id !== id);
}

async function loadAnalysesForCurrent() {
  const tgt = getCurrentExportTarget();
  if (!tgt?.data) { preview._analyses = []; return; }
  const archive = await archiveLoad();
  if (tgt.kind === 'bulk') {
    for (const entry of Object.values(archive)) {
      if (entry.type === 'bulk' && entry.data?.scraped_at === tgt.data.scraped_at) {
        preview._analyses = entry.analyses || [];
        return;
      }
    }
  } else {
    const entry = archive[tgt.data.name];
    if (entry) { preview._analyses = entry.analyses || []; return; }
  }
  preview._analyses = [];
}

function copyClusterWithPrompt(cluster, items) {
  const prompt = `ROLE: You're a market researcher analyzing a single pain cluster.

TASK: Review the ${cluster.size} comments below — all grouped automatically by keyword similarity. Determine:

1. **Is this a real cluster?** Do these comments actually describe the same underlying problem, or did keyword matching fake a connection? If fake, say so.
2. **If real:** in one sentence, what's the actual pain?
3. **Severity 1-5** based on language intensity and blocking-vs-annoying
4. **Monetization signal 1-5** — is there evidence anyone would pay?
5. **Existing solutions** named in the comments (if any)
6. **Is it already solved** by something these users haven't discovered yet? (Common mistake.)
7. **Adjacent pains** that co-occur with this one — might be worth investigating
8. **Honest call:** would you build for this? One-line yes/no/maybe with reasoning.

Be skeptical. Cluster keywords can deceive. If the comments are off-topic or the pain is too diffuse, call it out.

---

`;
  const md = buildClusterMarkdown(cluster, items);
  const body = prompt + md;
  navigator.clipboard.writeText(body)
    .then(() => toast(`✓ Copied cluster ${cluster.id} + analysis prompt (${(body.length / 1024).toFixed(1)} KB). Paste into Claude.`))
    .catch(err => toast('❌ Clipboard blocked: ' + err.message, 'error'));
}

function showBulkList() {
  preview.mode = 'bulk_list';
  preview.drillIdx = -1;
  preview.clusterResult = null;  // recompute for different data scope
  preview.tab = 'comments';
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === 'comments'));
  clustersArea.innerHTML = '';
  renderBulkList();
  applyViewState();
  updateTabCounts();
  pvScroll.scrollTop = 0;
}

// ── BULK LIST MODE ────────────────────────────────────────────────────
function renderBulkList() {
  const bulk = preview.bulk;
  const stats = preview.stats;

  pvTitle.textContent = `r/${bulk.subreddit}`;
  pvSub.textContent   = `${bulk.sort}${(bulk.sort === 'top' || bulk.sort === 'controversial') ? ' · ' + bulk.timeFilter : ''} · ${bulk.threads.length} threads`;

  sfComments.textContent = stats.threads || bulk.threads.length;
  sfReplies.textContent  = (stats.comments || 0) + (stats.replies || 0);
  sfWords.textContent    = stats.words > 999 ? (stats.words / 1000).toFixed(1) + 'k' : stats.words;
  sfSource.textContent   = `${sourceDisplayLabel(bulk.source || 'reddit')} · bulk`;

  // Hide toolbar (filters don't apply sensibly at bulk list level)
  pvToolbar.classList.add('hidden');

  // Clear single-thread render areas
  postCardEl.innerHTML = '';
  topCommenters.innerHTML = '';
  topCommenters.style.display = 'none';
  commentTreeEl.innerHTML = '';
  treeHeader.style.display = 'none';

  // Bulk header card
  bulkHeader.innerHTML = '';
  const hcard = el('div', 'bulk-header-card');
  hcard.appendChild(el('div', 'bulk-header-title', `r/${bulk.subreddit}`));
  hcard.appendChild(el('div', 'bulk-header-sub', `Sorted by ${bulk.sort}${(bulk.sort === 'top' || bulk.sort === 'controversial') ? ' · ' + bulk.timeFilter : ''}   ·   Scraped ${relTime(bulk.scraped_at)}`));

  const statsRow = el('div', 'bulk-stats-row');
  const addStat = (label, value) => {
    const s = el('span', 'bulk-stat');
    s.appendChild(el('strong', '', value));
    s.appendChild(document.createTextNode(' ' + label));
    statsRow.appendChild(s);
  };
  addStat('threads', String(bulk.threads.length));
  addStat('comments', fmtScore((stats.comments || 0) + (stats.replies || 0)));
  addStat('words', fmtScore(stats.words || 0));
  if (stats.insights?.pain)    addStat('pain', String(stats.insights.pain));
  if (stats.insights?.request) addStat('request', String(stats.insights.request));
  if (bulk.errors?.length)     addStat('failed', String(bulk.errors.length));
  hcard.appendChild(statsRow);
  bulkHeader.appendChild(hcard);

  // Thread cards
  threadListArea.style.display = 'block';
  threadListArea.innerHTML = '';

  bulk.threads.forEach((t, i) => {
    threadListArea.appendChild(renderThreadCard(t, i + 1));
  });
}

function renderThreadCard(t, idx) {
  const card = el('div', 'thread-card');
  card.appendChild(el('span', 'tc-idx', 'T' + idx));

  const body = el('div', 'thread-card-body');
  body.appendChild(el('div', 'thread-card-title', t.title || '(untitled)'));

  const meta = el('div', 'thread-card-meta');
  // author
  const aut = el('span', 'm-stat');
  aut.appendChild(document.createTextNode('u/' + (t.author || '?')));
  meta.appendChild(aut);
  // score
  const sc = el('span', 'm-stat');
  sc.appendChild(el('strong', '', fmtScore(t.score)));
  sc.appendChild(document.createTextNode('pts'));
  meta.appendChild(sc);
  // comments
  const cc = el('span', 'm-stat');
  cc.appendChild(el('strong', '', fmtScore(t.total_comments_extracted ?? UR.countNodes(t.comments || []))));
  cc.appendChild(document.createTextNode('comments'));
  meta.appendChild(cc);
  // time
  if (t.created_utc) {
    meta.appendChild(el('span', 'm-stat', relTime(new Date(t.created_utc * 1000).toISOString())));
  }
  body.appendChild(meta);

  // Signals row
  const flat = UR.flatten(t.comments || []);
  let pain = 0, req = 0, praise = 0;
  for (const c of flat) {
    if (c.flags?.includes('pain_point'))      pain++;
    if (c.flags?.includes('feature_request')) req++;
    if (c.flags?.includes('positive'))        praise++;
  }
  if (pain || req || praise) {
    const sigs = el('div', 'thread-card-signals');
    if (pain)   { const p = el('span', 'sig-pill pain');    p.appendChild(document.createTextNode(`${pain} pain`));    sigs.appendChild(p); }
    if (req)    { const p = el('span', 'sig-pill request'); p.appendChild(document.createTextNode(`${req} req`));      sigs.appendChild(p); }
    if (praise) { const p = el('span', 'sig-pill praise');  p.appendChild(document.createTextNode(`${praise} praise`)); sigs.appendChild(p); }
    body.appendChild(sigs);
  }

  card.appendChild(body);

  const chev = el('div', 'tc-chevron');
  chev.appendChild(svg('<polyline points="9 18 15 12 9 6"/>'));
  card.appendChild(chev);

  card.addEventListener('click', () => drillIntoThread(idx - 1));
  return card;
}

function drillIntoThread(i) {
  preview.mode = 'bulk_thread';
  preview.drillIdx = i;
  preview.clusterResult = null;  // recompute for drilled thread
  preview.tab = 'comments';
  tabButtons.forEach(b => b.classList.toggle('active', b.dataset.view === 'comments'));
  clustersArea.innerHTML = '';
  renderSingleThread(preview.bulk.threads[i]);
  applyViewState();
  updateTabCounts();
  pvScroll.scrollTop = 0;
}

// ── SINGLE THREAD MODE ────────────────────────────────────────────────
function renderSingleThread(data) {
  // Clear bulk-only UI
  bulkHeader.innerHTML = '';
  threadListArea.innerHTML = '';
  threadListArea.style.display = 'none';

  // Show toolbar
  pvToolbar.classList.remove('hidden');

  // Header text
  if (preview.mode === 'bulk_thread' && preview.bulk) {
    pvTitle.textContent = `[T${preview.drillIdx + 1}] ${data.title || 'Untitled'}`;
    pvSub.textContent   = `from r/${preview.bulk.subreddit} bulk · thread ${preview.drillIdx + 1} of ${preview.bulk.threads.length}`;
  } else {
    pvTitle.textContent = data.title || 'Untitled thread';
    pvSub.textContent   = `r/${data.subreddit || '—'}`;
  }

  const stats = computeThreadStatsLocal(data);
  sfComments.textContent = stats.comments;
  sfReplies.textContent  = stats.replies;
  sfWords.textContent    = stats.words > 999 ? (stats.words / 1000).toFixed(1) + 'k' : stats.words;
  sfSource.textContent   = sourceDisplayLabel(data.source);

  const ins = stats.insights || { pain:0, request:0, praise:0 };
  fcAll.textContent     = stats.comments + stats.replies;
  fcPain.textContent    = ins.pain;
  fcRequest.textContent = ins.request;
  fcPraise.textContent  = ins.praise;

  treeHeader.style.display = 'block';
  treeHeader.textContent = `Comments (${stats.comments} top · ${stats.replies} replies)`;

  renderPostCard(data);
  renderTopCommenters(data);
  renderCommentTree(data.comments || []);
}

function computeThreadStatsLocal(data) {
  let comments = 0, replies = 0, words = 0;
  const insights = { pain: 0, request: 0, praise: 0 };
  const authorCounts = {};
  function walk(nodes, depth = 0) {
    for (const c of nodes) {
      if (depth === 0) comments++; else replies++;
      words += (c.text || '').split(/\s+/).filter(Boolean).length;
      if (c.flags?.includes('pain_point'))      insights.pain++;
      if (c.flags?.includes('feature_request')) insights.request++;
      if (c.flags?.includes('positive'))        insights.praise++;
      if (c.author && c.author !== '[deleted]') {
        authorCounts[c.author] = (authorCounts[c.author] || 0) + 1;
      }
      if (c.replies?.length) walk(c.replies, depth + 1);
    }
  }
  walk(data.comments || []);
  return {
    comments, replies, words, insights,
    top_authors: Object.entries(authorCounts)
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
  };
}

// ── POST CARD ─────────────────────────────────────────────────────────
function renderPostCard(data) {
  postCardEl.innerHTML = '';
  const card = el('div', 'post-card');

  const metaTop = el('div', 'post-meta-top');
  metaTop.appendChild(el('span', 'post-sub', 'r/' + (data.subreddit || '—')));
  const t = data.created_utc ? new Date(data.created_utc * 1000).toISOString() : data.scraped_at;
  if (t) {
    metaTop.appendChild(el('span', 'post-dot'));
    metaTop.appendChild(el('span', 'post-time', relTime(t)));
  }
  if (data.flair) metaTop.appendChild(el('span', 'post-flair', data.flair));
  card.appendChild(metaTop);

  card.appendChild(el('div', 'post-title', data.title || 'Untitled thread'));

  const bodyWrap = el('div', 'post-body' + (!data.content ? ' empty' : ''));
  bodyWrap.textContent = data.content && data.content.trim() ? data.content.trim() : '(no body text — link / image / video post)';
  card.appendChild(bodyWrap);

  setTimeout(() => {
    if (bodyWrap.scrollHeight > bodyWrap.clientHeight + 4) {
      bodyWrap.classList.add('truncated');
      const btn = el('button', 'post-expand', 'Show full post ▾');
      btn.addEventListener('click', () => {
        const exp = bodyWrap.classList.toggle('expanded');
        btn.textContent = exp ? 'Collapse ▴' : 'Show full post ▾';
      });
      card.appendChild(btn);
    }
  }, 0);

  const metaBottom = el('div', 'post-meta-bottom');
  if (data.author) {
    const a = el('span', 'post-stat');
    a.appendChild(svg('<circle cx="12" cy="7" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>'));
    a.appendChild(el('span', 'post-author', 'u/' + data.author));
    metaBottom.appendChild(a);
  }
  const scoreStat = el('span', 'post-stat');
  scoreStat.appendChild(svg('<path d="M7 14l5-5 5 5"/>'));
  scoreStat.appendChild(document.createTextNode(' ' + fmtScore(data.score ?? data.upvotes)));
  metaBottom.appendChild(scoreStat);
  if (data.num_comments) {
    const cs = el('span', 'post-stat');
    cs.appendChild(svg('<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>'));
    cs.appendChild(document.createTextNode(' ' + fmtScore(data.num_comments) + ' total'));
    metaBottom.appendChild(cs);
  }
  if (data.total_comments_extracted) {
    const ex = el('span', 'post-stat');
    ex.appendChild(svg('<polyline points="20 6 9 17 4 12"/>'));
    ex.appendChild(document.createTextNode(' ' + fmtScore(data.total_comments_extracted) + ' captured'));
    metaBottom.appendChild(ex);
  }
  card.appendChild(metaBottom);
  postCardEl.appendChild(card);
}

// ── TOP COMMENTERS ────────────────────────────────────────────────────
function renderTopCommenters(data) {
  topCommenters.innerHTML = '';
  const stats = computeThreadStatsLocal(data);
  const authors = stats.top_authors || [];
  if (authors.length < 3) {
    topCommenters.style.display = 'none';
    return;
  }
  topCommenters.style.display = 'block';
  topCommenters.classList.remove('filter-active');

  const labelRow = el('div', 'tc-label');
  labelRow.appendChild(document.createTextNode(`top commenters (${authors.length})`));
  const clearBtn = el('button', 'tc-clear', 'clear filter');
  clearBtn.addEventListener('click', () => {
    authorFilter = null;
    document.querySelectorAll('.author-chip.active').forEach(c => c.classList.remove('active'));
    topCommenters.classList.remove('filter-active');
    applyFilter();
  });
  labelRow.appendChild(clearBtn);
  topCommenters.appendChild(labelRow);

  const row = el('div', 'tc-row');
  authors.slice(0, 8).forEach(({ author, count }) => {
    const chip = el('button', 'author-chip');
    const [fg, bg] = avatarColors(author);
    const av = el('span', 'mini-avatar', (author[0] || '?').toUpperCase());
    av.style.background = `linear-gradient(135deg, ${fg}, ${bg})`;
    av.style.color = '#1c1a17';
    chip.appendChild(av);
    chip.appendChild(document.createTextNode('u/' + author));
    chip.appendChild(el('span', 'author-count', count));

    chip.addEventListener('click', () => {
      if (authorFilter === author) {
        authorFilter = null;
        chip.classList.remove('active');
        topCommenters.classList.remove('filter-active');
      } else {
        document.querySelectorAll('.author-chip.active').forEach(c => c.classList.remove('active'));
        authorFilter = author;
        chip.classList.add('active');
        topCommenters.classList.add('filter-active');
      }
      applyFilter();
    });
    row.appendChild(chip);
  });
  topCommenters.appendChild(row);
}

// ── COMMENT TREE ──────────────────────────────────────────────────────
const MAX_INDENT_DEPTH = 6;

function renderCommentTree(comments) {
  commentTreeEl.innerHTML = '';

  if (!comments || !comments.length) {
    const empty = el('div', 'empty-tree');
    empty.appendChild(el('div', 'empty-tree-icon', '∅'));
    empty.appendChild(el('div', '', 'No comments captured.'));
    commentTreeEl.appendChild(empty);
    return;
  }

  let i = 0;
  function renderBatch() {
    const end = Math.min(i + RENDER_BATCH, comments.length);
    const frag = document.createDocumentFragment();
    while (i < end) {
      frag.appendChild(renderComment(comments[i], [i + 1], 0));
      i++;
    }
    commentTreeEl.appendChild(frag);
    if (i < comments.length) requestAnimationFrame(renderBatch);
    else applyFilter();
  }
  renderBatch();
}

function renderComment(c, idPath, depth) {
  const wrap = el('div', 'comment');
  wrap.dataset.flags  = (c.flags || []).join(',');
  wrap.dataset.idpath = idPath.join('.');
  wrap.dataset.author = c.author || '';
  wrap.dataset.score  = String(parseInt(c.score ?? c.upvotes ?? 0, 10) || 0);

  commentMeta.set(wrap, {
    text:   (c.text || '').toLowerCase(),
    author: c.author || '',
    score:  parseInt(c.score ?? c.upvotes ?? 0, 10) || 0,
    flags:  c.flags || [],
  });

  const row = el('div', 'comment-row');
  const [fg, bg] = avatarColors(c.author);
  const av = el('div', 'avatar', ((c.author || '?')[0] || '?').toUpperCase());
  av.style.background = `linear-gradient(135deg, ${fg}, ${bg})`;
  av.style.color = '#1c1a17';
  row.appendChild(av);

  const main = el('div', 'comment-main');

  const head = el('div', 'c-head');
  head.appendChild(el('span', 'c-author', 'u/' + (c.author || '[deleted]')));
  if (c.is_op) head.appendChild(el('span', 'c-op-badge', 'OP'));

  head.appendChild(el('span', 'c-dot'));
  const scoreVal = c.score ?? c.upvotes;
  head.appendChild(el('span', 'c-score' + (parseInt(scoreVal, 10) > 0 ? ' positive' : ''), fmtScore(scoreVal) + ' pts'));

  if (c.timestamp) {
    head.appendChild(el('span', 'c-dot'));
    head.appendChild(el('span', 'c-time', relTime(c.timestamp)));
  }

  (c.flags || []).forEach(f => {
    const label = { pain_point: 'pain', feature_request: 'request', positive: 'praise' }[f];
    const cls   = { pain_point: 'pain', feature_request: 'request', positive: 'praise' }[f];
    if (label) head.appendChild(el('span', 'c-flag ' + cls, label));
  });

  // Permalink — opens this comment on Reddit
  if (c.permalink) {
    const linkBtn = el('button', 'c-link');
    linkBtn.title = 'Open this comment on Reddit';
    linkBtn.appendChild(svg('<path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"/><polyline points="15 3 21 3 21 9"/><line x1="10" y1="14" x2="21" y2="3"/>'));
    linkBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      chrome.tabs.create({ url: c.permalink });
    });
    head.appendChild(linkBtn);
  }

  main.appendChild(head);

  const body = el('div', 'c-body', c.text || '(empty)');
  if (!c.text) body.classList.add('muted');

  if (c.text && c.text.length > TRUNCATE_CHARS) {
    body.classList.add('clamped');
    const btn = el('button', 'c-expand', 'Show more ▾');
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const exp = body.classList.toggle('expanded');
      body.classList.toggle('clamped', !exp);
      btn.textContent = exp ? 'Show less ▴' : 'Show more ▾';
    });
    main.appendChild(body);
    main.appendChild(btn);
  } else {
    main.appendChild(body);
  }

  row.appendChild(main);
  wrap.appendChild(row);

  if (c.replies && c.replies.length) {
    const toggle = el('button', 'c-toggle');
    toggle.setAttribute('aria-label', 'Collapse replies');
    wrap.appendChild(toggle);

    const nextDepth = depth + 1;
    if (nextDepth > MAX_INDENT_DEPTH) {
      const cap = el('div', 'depth-cap', `↪ ${countDeep(c.replies)} deeper replies (depth cap)`);
      wrap.appendChild(cap);
      const childWrap = el('div', 'c-children');
      childWrap.style.marginLeft = '16px';
      c.replies.forEach((r, i) => childWrap.appendChild(renderComment(r, [...idPath, i + 1], nextDepth)));
      wrap.appendChild(childWrap);
      return wrap;
    }

    const childWrap = el('div', 'c-children');
    c.replies.forEach((r, i) => childWrap.appendChild(renderComment(r, [...idPath, i + 1], nextDepth)));

    const collapsedPill = el('div', 'c-collapsed-pill');
    const rc = countDeep(c.replies);
    collapsedPill.textContent = `▸ ${rc} ${rc === 1 ? 'reply' : 'replies'} collapsed`;

    const doToggle = () => toggleCollapse(wrap, childWrap, collapsedPill);
    toggle.addEventListener('click', doToggle);
    collapsedPill.addEventListener('click', doToggle);

    wrap.appendChild(childWrap);
    wrap.appendChild(collapsedPill);
  }

  return wrap;
}

function toggleCollapse(wrap, childWrap, pill) {
  const collapsed = childWrap.classList.toggle('collapsed');
  pill.style.display = collapsed ? 'block' : 'none';
  wrap.classList.toggle('has-collapsed-children', collapsed);
}
function countDeep(comments) {
  let n = 0;
  for (const c of comments) {
    n++;
    if (c.replies && c.replies.length) n += countDeep(c.replies);
  }
  return n;
}

// ═══════════════════════════════════════════════════════════════════════
// FILTERS
// ═══════════════════════════════════════════════════════════════════════
filterChips.forEach(chip => {
  chip.addEventListener('click', () => {
    filterChips.forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    activeFilter = chip.dataset.filter;
    applyFilter();
  });
});

searchInput.addEventListener('input', () => {
  searchWrap.classList.toggle('has-query', !!searchInput.value);
  clearTimeout(searchDebounce);
  searchDebounce = setTimeout(() => {
    searchQuery = searchInput.value.toLowerCase().trim();
    applyFilter();
  }, 180);
});
searchClear.addEventListener('click', () => {
  searchInput.value = '';
  searchWrap.classList.remove('has-query');
  searchQuery = '';
  applyFilter();
  searchInput.focus();
});

minUpvotes.addEventListener('change', () => {
  minScore = parseInt(minUpvotes.value, 10) || 0;
  applyFilter();
});

function applyFilter() {
  const comments = commentTreeEl.querySelectorAll('.comment');
  if (!comments.length) return;

  const selfMatch = new Map();
  for (const c of comments) {
    const meta = commentMeta.get(c) || {};
    const flagOk   = activeFilter === 'all' || (meta.flags || []).includes(activeFilter);
    const queryOk  = !searchQuery || (meta.text || '').includes(searchQuery);
    const scoreOk  = (meta.score || 0) >= minScore;
    const authorOk = !authorFilter || meta.author === authorFilter;
    selfMatch.set(c, flagOk && queryOk && scoreOk && authorOk);
  }

  const ancestorsOfMatch = new Set();
  for (const c of comments) {
    if (selfMatch.get(c)) {
      let p = c.parentElement;
      while (p) {
        if (p.classList && p.classList.contains('comment')) ancestorsOfMatch.add(p);
        p = p.parentElement;
      }
    }
  }

  for (const c of comments) {
    const self = selfMatch.get(c);
    const desc = ancestorsOfMatch.has(c);
    const show = self || desc;
    c.classList.toggle('hidden', !show);
    c.classList.toggle('dim', show && !self);
  }
}

function resetFilterState() {
  activeFilter = 'all';
  searchQuery  = '';
  minScore     = 0;
  authorFilter = null;
  if (searchInput) searchInput.value = '';
  if (searchWrap)  searchWrap.classList.remove('has-query');
  if (minUpvotes)  minUpvotes.value = '0';
  filterChips.forEach(c => c.classList.toggle('active', c.dataset.filter === 'all'));
}

// ═══════════════════════════════════════════════════════════════════════
// EXPORT / COPY / DOWNLOAD
// ═══════════════════════════════════════════════════════════════════════
function getCurrentExportTarget() {
  // Returns { kind: 'single' | 'bulk', data }
  if (preview.mode === 'bulk_list') return { kind: 'bulk', data: preview.bulk };
  if (preview.mode === 'bulk_thread') return { kind: 'single', data: preview.bulk.threads[preview.drillIdx] };
  return { kind: 'single', data: preview.data };
}

function buildContent(fmt) {
  const tgt = getCurrentExportTarget();
  if (tgt.kind === 'bulk') {
    switch (fmt) {
      case 'md':   return { body: UR.toMarkdownBulk(tgt.data), ext: 'md',   mime: 'text/markdown' };
      case 'txt':  return { body: UR.toTextBulk(tgt.data),     ext: 'txt',  mime: 'text/plain' };
      case 'csv':  return { body: UR.toCSVBulk(tgt.data),      ext: 'csv',  mime: 'text/csv' };
      case 'json':
      default:     return { body: UR.toJSONBulk(tgt.data),     ext: 'json', mime: 'application/json' };
    }
  } else {
    // If drilled into bulk_thread, prefix comment IDs with T{n} for clarity
    const opts = preview.mode === 'bulk_thread'
      ? { idPrefix: `T${preview.drillIdx + 1}.C` }
      : { idPrefix: 'C' };
    switch (fmt) {
      case 'md':   return { body: UR.toMarkdown(tgt.data, opts), ext: 'md',   mime: 'text/markdown' };
      case 'txt':  return { body: UR.toText(tgt.data, opts),     ext: 'txt',  mime: 'text/plain' };
      case 'csv':  return { body: UR.toCSV(tgt.data),            ext: 'csv',  mime: 'text/csv' };
      case 'json':
      default:     return { body: UR.toJSON(tgt.data),           ext: 'json', mime: 'application/json' };
    }
  }
}

function flashBtn(btn) {
  btn.classList.add('flash');
  setTimeout(() => btn.classList.remove('flash'), 900);
}

function exportAs(fmt, mode, promptBody = null) {
  const tgt = getCurrentExportTarget();
  if (!tgt.data) return;
  const { body: content, ext, mime } = buildContent(fmt);
  const body = promptBody ? (promptBody + content) : content;

  if (mode === 'copy') {
    navigator.clipboard.writeText(body)
      .then(() => {
        const kb = (body.length / 1024).toFixed(1);
        const fmtLabel = fmt.toUpperCase();
        const suffix = promptBody ? ' with prompt' : '';
        toast(`✓ Copied ${fmtLabel}${suffix} (${kb} KB) — paste into Claude/ChatGPT.`);
        flashBtn(promptBody ? pvPromptBtn : pvCopyBtn);
      })
      .catch(err => toast('❌ Clipboard blocked: ' + err.message, 'error'));
    return;
  }

  // Download
  const baseTitle = tgt.kind === 'bulk'
    ? `${tgt.data.subreddit}-${tgt.data.sort}-${tgt.data.threads.length}`
    : (tgt.data.title || 'thread');
  const slug = UR.slug((tgt.data.subreddit || '') + '-' + baseTitle);
  const ts   = new Date().toISOString().slice(0, 10);
  const prefix = tgt.kind === 'bulk' ? 'ureddit_bulk' : 'ureddit';
  const filename = `${prefix}_${slug}_${ts}.${ext}`;

  const blob = new Blob([body], { type: mime });
  const url  = URL.createObjectURL(blob);
  chrome.downloads.download({ url, filename, saveAs: false }, () => URL.revokeObjectURL(url));
  flashBtn(pvDownloadBtn);
  toast(`✓ Downloaded ${filename}`);
}

pvCopyBtn.addEventListener('click',     () => exportAs(selectedFormat, 'copy'));
pvDownloadBtn.addEventListener('click', () => exportAs(selectedFormat, 'download'));

// ═══════════════════════════════════════════════════════════════════════
// PROMPT MENU
// ═══════════════════════════════════════════════════════════════════════
function buildPromptMenu() {
  promptMenuItems.innerHTML = '';
  (UR.PROMPTS || []).forEach(p => {
    const item = el('div', 'prompt-item');
    item.appendChild(el('div', 'pm-label', p.label));
    item.appendChild(el('div', 'pm-hint', p.hint));
    item.addEventListener('click', () => {
      closePromptMenu();
      if (p.needsStructured) {
        copyPromptWithStructured(p);
      } else {
        exportAs('md', 'copy', p.body);
      }
    });
    promptMenuItems.appendChild(item);
  });
}
buildPromptMenu();

function copyPromptWithStructured(prompt) {
  const tgt = getCurrentExportTarget();
  if (!tgt.data) return;

  // Build structured summary (includes auto-computed clusters)
  let structured = '';
  try {
    structured = UR.buildStructuredSummary(tgt.data);
  } catch (e) {
    console.warn('structured summary failed:', e);
    structured = '*(structured summary generation failed — using raw data only)*\n\n';
  }

  // Build MD export of raw data
  const { body: mdContent } = buildContent('md');

  const full = prompt.body + structured + '## Raw thread data\n\n' + mdContent;

  navigator.clipboard.writeText(full)
    .then(() => {
      const kb = (full.length / 1024).toFixed(1);
      toast(`✓ Copied ${prompt.label} + structured data (${kb} KB). Paste into Claude for analysis.`);
      flashBtn(pvPromptBtn);
    })
    .catch(err => toast('❌ Clipboard blocked: ' + err.message, 'error'));
}

function openPromptMenu() {
  const rect = pvPromptBtn.getBoundingClientRect();
  const menuWidth = 290;
  let left = rect.right - menuWidth;
  if (left < 8) left = 8;
  const top = rect.bottom + 4;

  promptMenu.style.left = left + 'px';
  promptMenu.style.top  = top + 'px';
  promptMenu.classList.add('visible');
  promptMenuBackdrop.classList.add('visible');
}
function closePromptMenu() {
  promptMenu.classList.remove('visible');
  promptMenuBackdrop.classList.remove('visible');
}
pvPromptBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  if (promptMenu.classList.contains('visible')) closePromptMenu();
  else openPromptMenu();
});
promptMenuBackdrop.addEventListener('click', closePromptMenu);

// Close on escape
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && promptMenu.classList.contains('visible')) closePromptMenu();
});

// ═══════════════════════════════════════════════════════════════════════
// TOAST
// ═══════════════════════════════════════════════════════════════════════
let toastTimer = null;
function toast(text, type = 'success') {
  if (!viewPreview.classList.contains('hidden')) {
    const existing = document.getElementById('pvToast');
    if (existing) existing.remove();
    const t = el('div', '', text);
    t.id = 'pvToast';
    t.style.cssText = `
      position:absolute;top:100px;left:50%;transform:translateX(-50%);
      background:var(--surface-2);border:1px solid var(--border-3);
      padding:7px 12px;border-radius:7px;font-family:var(--mono);
      font-size:11px;color:${type==='error'?'var(--error)':'var(--success)'};
      z-index:120;box-shadow:0 8px 24px rgba(0,0,0,0.5);
      animation:fadeInOut 2.6s ease;
      max-width: 90%; text-align: center;
    `;
    document.body.appendChild(t);
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => t.remove(), 2600);
  }
}

const styleEl = document.createElement('style');
styleEl.textContent = `
@keyframes fadeInOut {
  0%   { opacity: 0; transform: translateX(-50%) translateY(-6px); }
  10%  { opacity: 1; transform: translateX(-50%) translateY(0); }
  90%  { opacity: 1; transform: translateX(-50%) translateY(0); }
  100% { opacity: 0; transform: translateX(-50%) translateY(-6px); }
}`;
document.head.appendChild(styleEl);

dismissBanner.addEventListener('click', () => restoreBanner.classList.remove('visible'));

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
// ═══════════════════════════════════════════════════════════════════════
// SOURCE-SPECIFIC UI CONFIG
// ═══════════════════════════════════════════════════════════════════════
const SOURCE_META = {
  reddit: {
    taglineItem: 'reddit · single-thread scrape',
    taglineList: 'reddit · subreddit bulk scrape',
    labelItem:   'active thread',
    labelList:   'active subreddit',
    buttonItem:  'Scrape & preview',
    buttonList:  'Scrape & aggregate',
  },
  hn: {
    taglineItem: 'hacker news · single item',
    taglineList: 'hacker news · bulk listing',
    labelItem:   'active HN item',
    labelList:   'active HN listing',
    buttonItem:  'Scrape HN item',
    buttonList:  'Scrape top N stories',
  },
  stackoverflow: {
    taglineItem: 'stack overflow · question',
    taglineList: 'stack overflow · tag listing',
    labelItem:   'active question',
    labelList:   'active tag',
    buttonItem:  'Scrape SO question',
    buttonList:  'Scrape top N questions',
  },
  github: {
    taglineItem: 'github · issue',
    taglineList: 'github · repo issues',
    labelItem:   'active issue',
    labelList:   'active repo',
    buttonItem:  'Scrape GitHub issue',
    buttonList:  'Scrape top N issues',
  },
};

const SOURCE_SORT_CONFIG = {
  reddit: {
    sorts:      [['hot','hot'],['top','top'],['new','new'],['rising','rising'],['controversial','controversial']],
    timeShowsFor: ['top', 'controversial'],
    timeLabel:  'Time window',
    timeDesc:   'For top / controversial',
    timeOpts:   [['day','today'],['week','this week'],['month','this month'],['year','this year'],['all','all time']],
  },
  hn: {
    sorts:      [['news','news (top)'],['best','best'],['newest','newest'],['ask','ask HN'],['show','show HN'],['active','active'],['jobs','jobs']],
    timeShowsFor: [],
    timeLabel:  '',
    timeDesc:   '',
    timeOpts:   [],
  },
  stackoverflow: {
    sorts:      [['activity','activity'],['hot','hot'],['votes','votes'],['creation','newest']],
    timeShowsFor: [],
    timeLabel:  '',
    timeDesc:   '',
    timeOpts:   [],
  },
  github: {
    sorts:      [['updated','recently updated'],['created','recently created'],['comments','most commented'],['reactions','most reactions']],
    timeShowsFor: ['_always'],
    timeLabel:  'State',
    timeDesc:   'Open / closed / all',
    timeOpts:   [['open','open only'],['closed','closed only'],['all','all states']],
  },
};

function populateSortDropdown(sel, opts, defaultValue) {
  sel.innerHTML = '';
  for (const [v, label] of opts) {
    const o = document.createElement('option');
    o.value = v;
    o.textContent = label;
    sel.appendChild(o);
  }
  if (defaultValue) sel.value = defaultValue;
}

function cleanTabTitle(title, source, ctx) {
  if (!title) return '';
  let t = title;
  if (source === 'reddit' && ctx?.subreddit) {
    t = t.replace(new RegExp('\\s*:\\s*' + ctx.subreddit + '\\s*', 'i'), '').replace(/\s*-\s*reddit\s*$/i, '');
  } else if (source === 'hn') {
    t = t.replace(/\s*\|\s*Hacker News\s*$/i, '');
  } else if (source === 'stackoverflow') {
    t = t.replace(/\s*-\s*Stack Overflow\s*$/i, '');
  } else if (source === 'github') {
    t = t.replace(/\s*·\s*(Issue|Pull Request)\s*#\d+\s*·\s*[^·]+$/i, '');
  }
  return t.trim();
}

function getContainerLabel(ctx) {
  const src = ctx.source || 'reddit';
  if (src === 'reddit') return ctx.subreddit ? 'r/' + ctx.subreddit : 'r/…';
  if (src === 'hn')     return 'news.ycombinator.com';
  if (src === 'stackoverflow') return 'stackoverflow.com';
  if (src === 'github') return (ctx.owner && ctx.repo) ? `${ctx.owner}/${ctx.repo}` : 'github.com';
  return '';
}

function getListingTitle(ctx) {
  const src = ctx.source || 'reddit';
  if (src === 'reddit') return `r/${ctx.subreddit}`;
  if (src === 'hn')     return `HN / ${ctx.listType || 'news'}`;
  if (src === 'stackoverflow') return `tag: ${ctx.tag}`;
  if (src === 'github') return `${ctx.owner}/${ctx.repo}`;
  return '';
}

// ═══════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════
(async () => {
  await loadSettings();
  currentContext = await detectContext();
  await refreshHistoryBadges();

  if (currentContext.type === 'thread') {
    // Single-item setup
    const src = currentContext.source || 'reddit';
    const meta = SOURCE_META[src] || SOURCE_META.reddit;

    // Update header tagline
    const tagEl = document.querySelector('#viewThreadSetup .header-text .tagline');
    if (tagEl) tagEl.textContent = meta.taglineItem;

    // Update page info label
    const pageInfoLabel = document.querySelector('#viewThreadSetup .page-info-label');
    if (pageInfoLabel) pageInfoLabel.textContent = meta.labelItem;

    // Button label
    btnLabel.textContent = meta.buttonItem;

    // Container chip
    subredditChip.textContent = getContainerLabel(currentContext);

    // Page title from tab
    if (currentContext.tab?.title) {
      pageTitle.textContent = cleanTabTitle(currentContext.tab.title, src, currentContext) || '(untitled)';
    }

    setDot(statusDot, 'ready');

    // Try session restore
    const cached = await tryRestoreSingleFromSession(currentContext.url);
    if (cached) {
      preview.mode = 'single';
      preview.data = cached.data;
      preview.stats = cached.stats;
      preview.returnView = 'viewThreadSetup';
      footMeta.textContent = (cached.data.source || 'reddit') + ' · cached';
      renderPreview();
      showView('viewPreview');
      restoreBanner.classList.add('visible');
      setTimeout(() => restoreBanner.classList.remove('visible'), 4000);
    } else {
      showView('viewThreadSetup');
    }

  } else if (currentContext.type === 'sub') {
    // Bulk listing setup
    const src = currentContext.source || 'reddit';
    const meta = SOURCE_META[src] || SOURCE_META.reddit;
    const sortCfg = SOURCE_SORT_CONFIG[src] || SOURCE_SORT_CONFIG.reddit;

    const tagEl = document.querySelector('#viewSubSetup .header-text .tagline');
    if (tagEl) tagEl.textContent = meta.taglineList;

    const pageInfoLabel = document.querySelector('#viewSubSetup .page-info-label');
    if (pageInfoLabel) pageInfoLabel.textContent = meta.labelList;

    bulkBtnLabel.textContent = meta.buttonList;

    subPageTitle.textContent = getListingTitle(currentContext);

    // Repopulate sort dropdown for source
    const defaultSort = currentContext.sort || currentContext.listType || sortCfg.sorts[0][0];
    populateSortDropdown(subSortSelect, sortCfg.sorts, defaultSort);
    subSortBadge.textContent = defaultSort;

    // Time-filter row adapts to source
    const timeLabelEl = document.querySelector('#timeFilterRow .option-label');
    const timeDescEl  = document.querySelector('#timeFilterRow .option-desc');

    const shouldShow = sortCfg.timeShowsFor.includes('_always')
                    || sortCfg.timeShowsFor.includes(defaultSort);

    if (shouldShow && sortCfg.timeOpts.length) {
      if (timeLabelEl) timeLabelEl.textContent = sortCfg.timeLabel;
      if (timeDescEl)  timeDescEl.textContent  = sortCfg.timeDesc;
      populateSortDropdown(timeFilter, sortCfg.timeOpts, currentContext.timeFilter || sortCfg.timeOpts[0][0]);
      timeFilterRow.style.display = 'flex';
      subTimeChip.textContent = currentContext.timeFilter || sortCfg.timeOpts[0][0];
      subTimeChip.style.display = 'inline-block';
    } else {
      timeFilterRow.style.display = 'none';
      subTimeChip.style.display = 'none';
    }

    // Wire sort-change to toggle time filter visibility
    const resortOnChange = () => {
      const cur = subSortSelect.value;
      subSortBadge.textContent = cur;
      const show = sortCfg.timeShowsFor.includes('_always')
                || sortCfg.timeShowsFor.includes(cur);
      timeFilterRow.style.display = (show && sortCfg.timeOpts.length) ? 'flex' : 'none';
    };
    subSortSelect.addEventListener('change', resortOnChange);

    setDot(subStatusDot, 'ready');
    showView('viewSubSetup');

  } else {
    showView('notReddit');
  }
})();

// Session restore — only for single thread on the current URL
async function tryRestoreSingleFromSession(url) {
  // Check archive for most recent single scrape matching URL
  const archive = await archiveLoad();
  let best = null;
  for (const item of Object.values(archive)) {
    if (item.type !== 'single') continue;
    if (item.data?.url !== url) continue;
    if (!best || item.saved_at > best.saved_at) best = item;
  }
  if (!best) return null;
  // 30-min freshness for "restore on open"; older archives still available via History
  if (Date.now() - best.saved_at > 30 * 60 * 1000) return null;
  return best;
}
