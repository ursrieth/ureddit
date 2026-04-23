// content.js — Ureddit scraper (v3.0)
// Modes:
//   UREDDIT_SCRAPE      — single thread (current page)
//   UREDDIT_SCRAPE_SUB  — bulk scrape top N threads from a subreddit listing
// Primary: Reddit JSON API (with morechildren expansion)
// Fallback: DOM scrape (shreddit attribute-based) — single-thread only.

'use strict';

// Guard — register listener exactly once per page lifetime
if (!window.__uredditInjected) {
  window.__uredditInjected = true;

  chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
    if (message.type === 'UREDDIT_SCRAPE') {
      handleSingleScrape(message.options || {});
      sendResponse({ ack: true });
      return true;
    }
    if (message.type === 'UREDDIT_SCRAPE_SUB') {
      handleBulkScrape(message.options || {});
      sendResponse({ ack: true });
      return true;
    }
  });
}

function handleSingleScrape(options) {
  scrapeThread(options)
    .then(payload => chrome.runtime.sendMessage({ type: 'UREDDIT_RESULT', payload }))
    .catch(err => {
      console.error('[Ureddit] scrape failed:', err);
      chrome.runtime.sendMessage({
        type:    'UREDDIT_RESULT',
        payload: { error: err.message || 'Scraping failed' },
      });
    });
}

function handleBulkScrape(options) {
  scrapeSubredditListing(options)
    .then(payload => chrome.runtime.sendMessage({ type: 'UREDDIT_BULK_RESULT', payload }))
    .catch(err => {
      console.error('[Ureddit] bulk scrape failed:', err);
      chrome.runtime.sendMessage({
        type:    'UREDDIT_BULK_RESULT',
        payload: { error: err.message || 'Bulk scraping failed' },
      });
    });
}

function sendProgress(info) {
  try { chrome.runtime.sendMessage({ type: 'UREDDIT_PROGRESS', ...info }); }
  catch (_) { /* popup may have closed */ }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));

// ═════════════════════════════════════════════════════════════════════
// SINGLE-THREAD ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════
async function scrapeThread(options) {
  const {
    limit = 9999,
    includeReplies = true,
    autoExpand = true,
  } = options;

  let data = null;
  let source = 'unknown';

  sendProgress({ phase: 'init', label: 'Fetching thread JSON…' });

  try {
    data = await scrapeThreadViaJSON(window.location.href, {
      limit,
      includeReplies,
      fetchMore: autoExpand,
      onProgress: sendProgress,
    });
    source = 'json';
  } catch (e) {
    console.warn('[Ureddit] JSON path failed, falling back to DOM:', e?.message);
  }

  if (!data) {
    sendProgress({ phase: 'init', label: 'Falling back to DOM scrape…' });
    if (autoExpand) {
      try { await expandAllComments(); } catch (_) {}
    }
    data = scrapeViaDOM({ limit, includeReplies });
    source = 'dom';
  }

  if (!data || !data.comments) {
    throw new Error('Could not extract thread content. Try reloading the page.');
  }

  sendProgress({ phase: 'classify', label: 'Classifying pain signals…' });
  finalizeThreadData(data, source);

  const stats = computeThreadStats(data);
  sendProgress({ phase: 'done' });
  return { data, stats };
}

function finalizeThreadData(data, source) {
  data.source     = source || data.source || 'json';
  data.scraped_at = data.scraped_at || new Date().toISOString();
  data.url        = data.url || window.location.href;

  const flat = flattenForStats(data.comments);
  for (const c of flat) {
    c.flags = classify(c.text);
  }
}

function computeThreadStats(data) {
  const insights = { pain: 0, request: 0, praise: 0 };
  const authorCounts = {};
  const flat = flattenForStats(data.comments);
  for (const c of flat) {
    if (c.flags?.includes('pain_point'))      insights.pain++;
    if (c.flags?.includes('feature_request')) insights.request++;
    if (c.flags?.includes('positive'))        insights.praise++;
    if (c.author && c.author !== '[deleted]') {
      authorCounts[c.author] = (authorCounts[c.author] || 0) + 1;
    }
  }
  const stats = computeStats(data.comments);
  stats.insights = insights;
  stats.top_authors = Object.entries(authorCounts)
    .map(([author, count]) => ({ author, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10);
  return stats;
}

// ═════════════════════════════════════════════════════════════════════
// SUBREDDIT BULK ORCHESTRATOR
// ═════════════════════════════════════════════════════════════════════
async function scrapeSubredditListing(options) {
  const {
    subreddit,
    sort          = 'hot',
    timeFilter    = 'week',
    threadLimit   = 25,
    commentLimit  = 100,
    includeReplies = true,
    autoExpand    = true,
    minComments   = 5,
    throttleMs    = 700,
  } = options;

  if (!subreddit) throw new Error('Missing subreddit name.');

  sendProgress({ phase: 'listing', label: `Fetching r/${subreddit} listing…` });

  // Step 1: Fetch listing
  const t = sort === 'top' || sort === 'controversial' ? `&t=${timeFilter}` : '';
  const listingUrl = `https://www.reddit.com/r/${subreddit}/${sort}.json?limit=${Math.min(100, threadLimit * 2)}&raw_json=1${t}`;

  const listingRes = await fetch(listingUrl, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });
  if (!listingRes.ok) throw new Error(`Listing fetch returned ${listingRes.status}`);

  const listingJson = await listingRes.json();
  const allPosts    = listingJson?.data?.children || [];

  const candidates = allPosts
    .filter(p => p.kind === 't3')
    .map(p => p.data)
    .filter(p => !p.stickied && !p.pinned && (p.num_comments || 0) >= minComments)
    .slice(0, threadLimit);

  if (!candidates.length) {
    throw new Error(`No eligible threads found in r/${subreddit}/${sort}. Try a different sort or lower the min-comments filter.`);
  }

  sendProgress({
    phase: 'bulk_start',
    label: `Scraping ${candidates.length} threads from r/${subreddit}/${sort}…`,
    current: 0,
    total: candidates.length,
  });

  // Step 2: For each candidate, scrape its thread
  const threads = [];
  const errors  = [];
  let done = 0;

  for (const p of candidates) {
    const threadUrl = `https://www.reddit.com${p.permalink}`;
    const shortTitle = (p.title || '').slice(0, 50);
    sendProgress({
      phase:   'bulk_thread',
      label:   `[${done + 1}/${candidates.length}] ${shortTitle}${p.title.length > 50 ? '…' : ''}`,
      current: done,
      total:   candidates.length,
    });

    try {
      const threadData = await scrapeThreadViaJSON(threadUrl, {
        limit: commentLimit,
        includeReplies,
        fetchMore: autoExpand,
        onProgress: null,  // suppress per-thread inner progress
      });

      if (threadData) {
        finalizeThreadData(threadData, 'json');
        threadData.url = threadUrl;
        threads.push(threadData);
      }
    } catch (e) {
      errors.push({ id: p.id, title: p.title, error: e?.message });
      console.warn('[Ureddit] Thread scrape failed:', p.id, e?.message);
    }

    done++;
    await sleep(throttleMs);
  }

  sendProgress({
    phase:   'bulk_done',
    label:   `Done. ${threads.length} threads captured, ${errors.length} failed.`,
    current: candidates.length,
    total:   candidates.length,
  });

  // Aggregate stats
  const aggregate = aggregateBulkStats(threads);

  return {
    data: {
      type:       'bulk',
      subreddit,
      sort,
      timeFilter,
      scraped_at: new Date().toISOString(),
      source_url: listingUrl.replace(/\.json.*/, ''),
      threads,
      errors,
    },
    stats: aggregate,
  };
}

function aggregateBulkStats(threads) {
  let totalComments = 0, totalReplies = 0, totalWords = 0;
  const insights = { pain: 0, request: 0, praise: 0 };
  const authorCounts = {};

  for (const t of threads) {
    const s = computeThreadStats(t);
    totalComments += s.comments;
    totalReplies  += s.replies;
    totalWords    += s.words;
    insights.pain    += s.insights.pain;
    insights.request += s.insights.request;
    insights.praise  += s.insights.praise;
    for (const { author, count } of s.top_authors) {
      authorCounts[author] = (authorCounts[author] || 0) + count;
    }
  }

  return {
    threads:  threads.length,
    comments: totalComments,
    replies:  totalReplies,
    words:    totalWords,
    insights,
    top_authors: Object.entries(authorCounts)
      .map(([author, count]) => ({ author, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 15),
  };
}

// ═════════════════════════════════════════════════════════════════════
// JSON API — URL-parameterized so bulk mode can reuse
// ═════════════════════════════════════════════════════════════════════

async function scrapeThreadViaJSON(threadUrl, { limit, includeReplies, fetchMore, onProgress } = {}) {
  const base = threadUrl.split('?')[0].split('#')[0].replace(/\/$/, '');
  const jsonUrl = `${base}.json?raw_json=1&limit=500&threaded=true`;

  const res = await fetch(jsonUrl, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });
  if (!res.ok) throw new Error(`Reddit JSON returned ${res.status}`);

  const body = await res.json();
  if (!Array.isArray(body) || body.length < 2) throw new Error('Unexpected JSON shape');

  const postListing    = body[0]?.data?.children?.[0];
  const commentListing = body[1]?.data?.children || [];
  if (!postListing || postListing.kind !== 't3') throw new Error('No post found in JSON');

  const p = postListing.data;
  const post = {
    id:           p.id,
    name:         p.name,
    title:        p.title || '',
    content:      p.selftext || '',
    author:       p.author || '[deleted]',
    upvotes:      p.ups ?? p.score ?? '',
    score:        p.score ?? '',
    num_comments: p.num_comments ?? 0,
    subreddit:    p.subreddit || '',
    permalink:    p.permalink ? `https://reddit.com${p.permalink}` : '',
    created_utc:  p.created_utc,
    url:          p.url || base,
    flair:        p.link_flair_text || '',
    is_video:     !!p.is_video,
  };

  const ctx = { index: {}, moreNodes: [], continueMore: 0 };
  const rootComments = [];
  ctx.index[post.name] = { name: post.name, replies: rootComments };

  for (const child of commentListing.slice(0, limit ?? 9999)) {
    const conv = convertJSONComment(child, post.name, includeReplies, ctx);
    if (conv) rootComments.push(conv);
  }

  onProgress?.({
    phase: 'initial_done',
    label: `Parsed ${Object.keys(ctx.index).length - 1} comments · expanding ${ctx.moreNodes.length} collapsed groups…`,
    initialCount: Object.keys(ctx.index).length - 1,
    morePlaceholders: ctx.moreNodes.length,
  });

  if (fetchMore && includeReplies && ctx.moreNodes.length) {
    await resolveMoreQueue(post.name, ctx.moreNodes, ctx.index, onProgress);
  }

  post.continue_placeholders_skipped = ctx.continueMore;
  post.total_comments_extracted     = Object.keys(ctx.index).length - 1;

  return { ...post, comments: rootComments };
}

function convertJSONComment(node, parentName, includeReplies, ctx) {
  if (!node) return null;

  if (node.kind === 'more') {
    const m = node.data;
    if (m.children && m.children.length) {
      ctx.moreNodes.push({
        parent_name:  m.parent_id || parentName,
        children_ids: m.children,
        count:        m.count || m.children.length,
      });
    } else if (m.count && m.count > 0) {
      ctx.continueMore += m.count;
    }
    return null;
  }

  if (node.kind !== 't1') return null;

  const d = node.data;
  const body = (d.body || '').trim();
  if (!body || body === '[deleted]' || body === '[removed]') return null;

  const c = formatT1(d);
  ctx.index[c.name] = c;

  if (includeReplies && d.replies && d.replies.data && Array.isArray(d.replies.data.children)) {
    for (const child of d.replies.data.children) {
      const reply = convertJSONComment(child, c.name, true, ctx);
      if (reply) c.replies.push(reply);
    }
  }

  return c;
}

function formatT1(d) {
  return {
    id:        d.id,
    name:      d.name,
    parent_id: d.parent_id,
    author:    d.author || '[deleted]',
    text:      (d.body || '').trim(),
    body_html: d.body_html || '',
    upvotes:   d.ups ?? d.score ?? '',
    score:     d.score ?? '',
    timestamp: d.created_utc ? new Date(d.created_utc * 1000).toISOString() : '',
    depth:     d.depth ?? 0,
    permalink: d.permalink ? `https://reddit.com${d.permalink}` : '',
    edited:    !!d.edited,
    is_op:     !!d.is_submitter,
    replies:   [],
  };
}

// ── morechildren expansion ────────────────────────────────────────────
const MORECHILDREN_BATCH      = 100;
const MORECHILDREN_THROTTLE   = 600;
const MORECHILDREN_MAX_TOTAL  = 5000;
const MORECHILDREN_MAX_ROUNDS = 40;

async function resolveMoreQueue(linkId, initialNodes, index, onProgress) {
  const queue = [...initialNodes];
  const totalEstimated = initialNodes.reduce((s, n) => s + (n.children_ids?.length || 0), 0);
  let processed = 0;
  let added     = 0;
  let rounds    = 0;

  while (queue.length && added < MORECHILDREN_MAX_TOTAL && rounds < MORECHILDREN_MAX_ROUNDS) {
    const node = queue.shift();
    if (!node.children_ids?.length) continue;

    const batch     = node.children_ids.slice(0, MORECHILDREN_BATCH);
    const remaining = node.children_ids.slice(MORECHILDREN_BATCH);

    try {
      const things = await fetchMoreChildren(linkId, batch);
      rounds++;

      for (const thing of things) {
        if (thing.kind === 't1') {
          const d = thing.data;
          const body = (d.body || '').trim();
          if (!body || body === '[deleted]' || body === '[removed]') continue;

          const c = formatT1(d);
          index[c.name] = c;

          const parent = index[c.parent_id];
          if (parent) {
            if (!parent.replies) parent.replies = [];
            parent.replies.push(c);
            added++;
          }
        } else if (thing.kind === 'more' && thing.data.children?.length) {
          queue.push({
            parent_name:  thing.data.parent_id,
            children_ids: thing.data.children,
            count:        thing.data.count || thing.data.children.length,
          });
        }
      }

      processed += batch.length;
      onProgress?.({
        phase:   'morechildren',
        label:   `Loading collapsed comments… (${added} of ~${totalEstimated})`,
        current: processed,
        total:   Math.max(totalEstimated, processed),
        added,
      });

    } catch (e) {
      console.warn('[Ureddit] morechildren batch failed:', e?.message);
    }

    if (remaining.length) {
      queue.unshift({ ...node, children_ids: remaining });
    }

    await sleep(MORECHILDREN_THROTTLE);
  }
}

async function fetchMoreChildren(linkId, childrenIds, attempt = 0) {
  const params = new URLSearchParams({
    api_type:       'json',
    link_id:        linkId,
    children:       childrenIds.join(','),
    sort:           'confidence',
    limit_children: 'false',
    raw_json:       '1',
  });

  const res = await fetch(`https://www.reddit.com/api/morechildren.json?${params}`, {
    credentials: 'include',
    headers: { 'Accept': 'application/json' },
  });

  if (res.status === 429) {
    if (attempt < 3) {
      await sleep(1500 * Math.pow(2, attempt));
      return fetchMoreChildren(linkId, childrenIds, attempt + 1);
    }
    throw new Error('Rate limited');
  }

  if (!res.ok) throw new Error(`morechildren ${res.status}`);
  const json = await res.json();
  if (json?.json?.errors?.length) throw new Error(JSON.stringify(json.json.errors));
  return json?.json?.data?.things || [];
}

// ═════════════════════════════════════════════════════════════════════
// DOM FALLBACK (single-thread only — bulk mode is JSON-only)
// ═════════════════════════════════════════════════════════════════════

function scrapeViaDOM({ limit, includeReplies }) {
  const layout = detectLayout();
  if (layout === 'unknown') return null;

  let post, comments;
  if (layout === 'old') {
    post     = scrapePostOld();
    comments = scrapeCommentsOld(limit, includeReplies);
  } else {
    post     = scrapePostNew();
    comments = scrapeCommentsNew(limit, includeReplies);
  }
  return { ...post, comments };
}

function detectLayout() {
  if (document.querySelector('shreddit-post') || document.querySelector('shreddit-comment')) return 'new';
  if (document.querySelector('.thing.link') || document.querySelector('#siteTable'))         return 'old';
  if (document.querySelector('[data-testid="post-container"]'))                              return 'new';
  return 'unknown';
}

async function expandAllComments() {
  const maxClicks = 60;
  let clicks = 0;

  window.scrollTo(0, document.body.scrollHeight);
  await sleep(300);

  while (clicks < maxClicks) {
    const selectors = [
      'button[aria-label*="more repl" i]',
      'button[aria-label*="more comment" i]',
      'button[aria-label*="View entire conversation" i]',
      'faceplate-partial button',
      'shreddit-comment-action-row button',
      '.morecomments a',
      '.morechildren a',
    ];

    let clicked = false;
    const seen = new WeakSet();
    for (const sel of selectors) {
      const candidates = Array.from(document.querySelectorAll(sel));
      for (const btn of candidates) {
        if (seen.has(btn)) continue;
        seen.add(btn);
        const label = (btn.textContent || btn.getAttribute('aria-label') || '').toLowerCase();
        if (!/more repl|more comment|view (entire|more)|load more|continue this/i.test(label)) continue;
        try {
          btn.click();
          clicks++;
          clicked = true;
          await sleep(220);
          if (clicks >= maxClicks) break;
        } catch (_) {}
      }
      if (clicks >= maxClicks) break;
    }
    if (!clicked) break;
  }

  const collapsed = document.querySelectorAll('shreddit-comment[collapsed]');
  collapsed.forEach(el => { try { el.removeAttribute('collapsed'); } catch (_) {} });
}

// ── NEW REDDIT (shreddit) ─────────────────────────────────────────────
function scrapePostNew() {
  const post = {};
  const sp = document.querySelector('shreddit-post');

  if (sp) {
    post.id            = sp.getAttribute('id') || '';
    post.name          = sp.getAttribute('id') || '';
    post.title         = sp.getAttribute('post-title') || getText(sp.querySelector('h1'));
    post.author        = sp.getAttribute('author') || '';
    post.upvotes       = sp.getAttribute('score') || '';
    post.score         = post.upvotes;
    post.subreddit     = (sp.getAttribute('subreddit-prefixed-name') || '').replace(/^r\//, '');
    post.permalink     = sp.getAttribute('permalink') || window.location.href;
    post.num_comments  = sp.getAttribute('comment-count') || '';
  }

  const bodyEl =
    document.querySelector('shreddit-post div[slot="text-body"]') ||
    document.querySelector('[id$="-post-rtjson-content"]') ||
    document.querySelector('[data-post-click-location="text-body"]');
  post.content = bodyEl ? cleanText(bodyEl.innerText || bodyEl.textContent) : '';

  if (!post.title) post.title = cleanText(getText(document.querySelector('h1')));
  return post;
}

function scrapeCommentsNew(limit, includeReplies) {
  const topLevel = Array.from(document.querySelectorAll('shreddit-comment[depth="0"]')).slice(0, limit);
  if (!topLevel.length) {
    const legacy = Array.from(document.querySelectorAll('[data-testid="comment"]')).slice(0, limit);
    return legacy.map(el => extractCommentNewLegacy(el, includeReplies)).filter(Boolean);
  }
  return topLevel.map(el => extractCommentShreddit(el, includeReplies, null)).filter(Boolean);
}

function extractCommentShreddit(el, includeReplies, parentName) {
  if (!el || el.tagName !== 'SHREDDIT-COMMENT') return null;

  const id        = el.getAttribute('thingid') || el.getAttribute('id') || '';
  const name      = id.startsWith('t1_') ? id : (id ? `t1_${id}` : '');
  const author    = el.getAttribute('author') || '[deleted]';
  const upvotes   = el.getAttribute('score') || '';
  const depth     = parseInt(el.getAttribute('depth') || '0', 10);
  const timestamp = el.getAttribute('created-timestamp') || '';
  const permalink = el.getAttribute('permalink') || '';

  const bodyEl =
    el.querySelector(':scope > div[slot="comment"]') ||
    el.querySelector(':scope > div [id$="-comment-rtjson-content"]') ||
    el.querySelector(':scope > div p') ||
    el.querySelector('[id$="-comment-rtjson-content"]');

  const text = bodyEl ? cleanText(bodyEl.innerText || bodyEl.textContent) : '';
  if (!text) return null;

  const comment = {
    id:        id.replace(/^t1_/, ''),
    name,
    parent_id: parentName || '',
    author,
    text,
    upvotes,
    score:     upvotes,
    timestamp,
    depth,
    permalink: permalink ? `https://reddit.com${permalink}` : '',
    replies:   [],
  };

  if (includeReplies) {
    const childComments = Array.from(el.children).filter(c => c.tagName === 'SHREDDIT-COMMENT');
    for (const child of childComments) {
      const reply = extractCommentShreddit(child, true, name);
      if (reply) comment.replies.push(reply);
    }
  }
  return comment;
}

function extractCommentNewLegacy(el, includeReplies) {
  const bodyEl = el.querySelector('[data-testid="comment"] p') || el.querySelector('p');
  const text = bodyEl ? cleanText(bodyEl.innerText || bodyEl.textContent) : '';
  if (!text) return null;

  const authorEl = el.querySelector('a[href*="/user/"]');
  const author = authorEl ? cleanText(authorEl.textContent).replace(/^u\//, '') : '';

  const timeEl = el.querySelector('time');
  const timestamp = timeEl ? (timeEl.getAttribute('datetime') || '') : '';

  return { id:'', name:'', parent_id:'', author, text, upvotes:'', score:'', timestamp, depth:0, permalink:'', replies: [] };
}

// ── OLD REDDIT ─────────────────────────────────────────────────────────
function scrapePostOld() {
  const post = {};
  const titleEl = document.querySelector('.title.may-blank, a.title');
  post.title = titleEl ? cleanText(titleEl.textContent) : '';

  const bodyEl = document.querySelector('.usertext-body .md');
  post.content = bodyEl ? cleanText(bodyEl.innerText || bodyEl.textContent) : '';

  const authorEl = document.querySelector('.top-matter .author');
  post.author = authorEl ? cleanText(authorEl.textContent) : '';

  const upvoteEl = document.querySelector('.score.unvoted, .score.likes, .score.dislikes');
  post.upvotes = upvoteEl ? cleanText(upvoteEl.textContent) : '';
  post.score   = post.upvotes;

  const match = window.location.pathname.match(/\/r\/([^/]+)/);
  post.subreddit = match ? match[1] : '';
  return post;
}

function scrapeCommentsOld(limit, includeReplies) {
  const topLevelEls = Array.from(
    document.querySelectorAll('.nestedlisting > .comment')
  ).slice(0, limit);
  return topLevelEls.map(el => extractCommentOld(el, includeReplies, null)).filter(Boolean);
}

function extractCommentOld(el, includeReplies, parentName) {
  const bodyEl = el.querySelector(':scope > .entry .usertext-body .md');
  if (!bodyEl) return null;

  const text = cleanText(bodyEl.innerText || bodyEl.textContent);
  if (!text) return null;

  const authorEl = el.querySelector(':scope > .entry .author');
  const author = authorEl ? cleanText(authorEl.textContent) : '[deleted]';

  const upEl = el.querySelector(':scope > .entry .score');
  const upvotes = upEl ? cleanText(upEl.textContent) : '';

  const timeEl = el.querySelector(':scope > .entry time');
  const timestamp = timeEl ? (timeEl.getAttribute('datetime') || '') : '';

  const id = el.getAttribute('data-fullname') || (el.id || '');
  const name = id.startsWith('t1_') ? id : '';

  const comment = {
    id: name.replace(/^t1_/, ''),
    name,
    parent_id: parentName || '',
    author, text, upvotes, score: upvotes, timestamp, depth: 0, permalink: '',
    replies: [],
  };

  if (includeReplies) {
    const replyEls = Array.from(el.querySelectorAll(':scope > .child .nestedlisting > .comment'));
    for (const replyEl of replyEls) {
      const reply = extractCommentOld(replyEl, true, name);
      if (reply) comment.replies.push(reply);
    }
  }
  return comment;
}

// ═════════════════════════════════════════════════════════════════════
// HELPERS
// ═════════════════════════════════════════════════════════════════════
function getText(el) { return el ? (el.innerText || el.textContent || '').trim() : ''; }

function cleanText(raw) {
  if (!raw) return '';
  return raw
    .replace(/​|‌|‍|﻿/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function flattenForStats(comments, out = []) {
  for (const c of comments) {
    out.push(c);
    if (c.replies && c.replies.length) flattenForStats(c.replies, out);
  }
  return out;
}

function computeStats(comments) {
  let totalComments = 0, totalReplies = 0, totalWords = 0;
  function walk(nodes, depth = 0) {
    for (const c of nodes) {
      if (depth === 0) totalComments++; else totalReplies++;
      totalWords += (c.text || '').split(/\s+/).filter(Boolean).length;
      if (c.replies && c.replies.length) walk(c.replies, depth + 1);
    }
  }
  walk(comments);
  return { comments: totalComments, replies: totalReplies, words: totalWords };
}

function classify(text) {
  const lower = (text || '').toLowerCase();
  const pain    = ['hate','frustrating','annoying','broken','terrible','can\'t','cant','cannot','issue','problem','bug','doesn\'t work','doesnt work','fail','failed','awful','horrible','useless','struggle','pain','suck','stuck','wtf','garbage','trash','confusing'];
  const request = ['wish','want','need','should','would be nice','hope','please add','feature request','suggestion','missing','lacks','lacking','if only','would love','looking for','is there a way'];
  const praise  = ['love','great','amazing','excellent','best','perfect','awesome','fantastic','wonderful','highly recommend','game changer','godsend'];

  const flags = [];
  if (pain.some(k => lower.includes(k)))    flags.push('pain_point');
  if (request.some(k => lower.includes(k))) flags.push('feature_request');
  if (praise.some(k => lower.includes(k)))  flags.push('positive');
  return flags;
}
