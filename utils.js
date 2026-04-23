// utils.js — Ureddit data utilities + export formatters + prompt templates (v3.0)
// Loaded into popup.html as a classic script; attaches everything to window.UR.

'use strict';

(function () {
  const UR = {};

  // ── Flatten comment tree ────────────────────────────────────────────
  UR.flatten = function flatten(comments, out = [], parentPath = []) {
    comments.forEach((c, idx) => {
      const path = [...parentPath, idx + 1];
      out.push({ ...c, _path: path, replies: undefined });
      if (c.replies && c.replies.length) flatten(c.replies, out, path);
    });
    return out;
  };

  UR.countNodes = function countNodes(comments) {
    let n = 0;
    for (const c of comments) {
      n++;
      if (c.replies && c.replies.length) n += countNodes(c.replies);
    }
    return n;
  };

  UR.classify = function classify(text) {
    const lower = (text || '').toLowerCase();
    const pain    = ['hate','frustrating','annoying','broken','terrible','can\'t','cant','cannot','issue','problem','bug','doesn\'t work','doesnt work','fail','failed','awful','horrible','useless','struggle','pain','suck','stuck','wtf','garbage','trash','confusing'];
    const request = ['wish','want','need','should','would be nice','hope','please add','feature request','suggestion','missing','lacks','lacking','if only','would love','looking for','is there a way'];
    const praise  = ['love','great','amazing','excellent','best','perfect','awesome','fantastic','wonderful','highly recommend','game changer','godsend'];
    const flags = [];
    if (pain.some(k => lower.includes(k)))    flags.push('pain_point');
    if (request.some(k => lower.includes(k))) flags.push('feature_request');
    if (praise.some(k => lower.includes(k)))  flags.push('positive');
    return flags;
  };

  UR.fmtTime = function fmtTime(iso) {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      if (isNaN(d.getTime())) return iso;
      return d.toISOString().replace('T', ' ').split('.')[0] + 'Z';
    } catch (_) { return iso; }
  };

  UR.slug = function slug(s) {
    return (s || '')
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'thread';
  };

  UR.mdInline = function mdInline(text) {
    return (text || '')
      .replace(/\r\n/g, '\n')
      .replace(/\n{2,}/g, '\n\n')
      .trim();
  };

  // ══════════════════════════════════════════════════════════════════
  // SINGLE THREAD — Markdown (AI-ready)
  // ══════════════════════════════════════════════════════════════════
  UR.toMarkdown = function toMarkdown(data, opts = {}) {
    const { idPrefix = 'C' } = opts;
    const lines = [];
    const subreddit = data.subreddit || '—';

    lines.push(`# ${data.title || 'Reddit Thread'}`);
    lines.push('');
    lines.push(`**Subreddit:** r/${subreddit}  `);
    lines.push(`**Author:** u/${data.author || '[deleted]'}  `);
    if (data.score !== undefined && data.score !== '') lines.push(`**Score:** ${data.score}  `);
    if (data.num_comments) lines.push(`**Total comments on Reddit:** ${data.num_comments}  `);
    if (data.flair) lines.push(`**Flair:** ${data.flair}  `);
    lines.push(`**URL:** ${data.url || data.permalink || ''}  `);
    lines.push(`**Scraped:** ${data.scraped_at || ''}`);
    lines.push('');
    lines.push('---');
    lines.push('');

    lines.push('## Post');
    lines.push('');
    lines.push(data.content && data.content.trim() ? data.content.trim() : '*(no body text — link/image/video post)*');
    lines.push('');
    lines.push('---');
    lines.push('');

    const comments = data.comments || [];
    const flat = UR.flatten(comments);
    const topLevel  = comments.length;
    const totalReps = flat.length - topLevel;

    lines.push(`## Comments (${flat.length} total · ${topLevel} top-level · ${totalReps} replies)`);
    lines.push('');

    function renderComment(c, idPath, depth) {
      const tag = `[${idPrefix}${idPath.join('.')}]`;
      const meta = [];
      if (c.author) meta.push(`u/${c.author}${c.is_op ? ' · OP' : ''}`);
      if (c.score !== undefined && c.score !== '') meta.push(`${c.score} pts`);
      const when = UR.fmtTime(c.timestamp);
      if (when) meta.push(when);
      const flags = (c.flags || []).map(f => ({ pain_point:'pain', feature_request:'request', positive:'praise' }[f])).filter(Boolean);
      if (flags.length) meta.push(flags.join(', '));

      const q = '>'.repeat(Math.min(depth, 6));
      const prefix = q ? q + ' ' : '';

      if (depth === 0) {
        lines.push(`### ${tag} ${meta.join(' · ')}`);
        lines.push('');
        const body = UR.mdInline(c.text);
        body.split('\n').forEach(ln => lines.push(ln));
        lines.push('');
      } else {
        lines.push(`${prefix}**${tag}** ${meta.join(' · ')}`);
        const body = UR.mdInline(c.text);
        body.split('\n').forEach(ln => lines.push(`${prefix}${ln}`));
        lines.push(q ? `${q}` : '');
      }

      if (c.replies && c.replies.length) {
        c.replies.forEach((r, i) => renderComment(r, [...idPath, i + 1], depth + 1));
      }
    }

    comments.forEach((c, i) => renderComment(c, [i + 1], 0));
    lines.push('');
    return lines.join('\n');
  };

  // ══════════════════════════════════════════════════════════════════
  // SINGLE THREAD — Plain text
  // ══════════════════════════════════════════════════════════════════
  UR.toText = function toText(data, opts = {}) {
    const { idPrefix = 'C' } = opts;
    const lines = [];
    const sub = data.subreddit || '—';

    lines.push('═'.repeat(72));
    lines.push(`REDDIT THREAD — r/${sub}`);
    lines.push('═'.repeat(72));
    lines.push(`Title:       ${data.title || '—'}`);
    lines.push(`Author:      u/${data.author || '[deleted]'}`);
    if (data.score !== undefined && data.score !== '') lines.push(`Score:       ${data.score}`);
    if (data.num_comments) lines.push(`Total comments on Reddit: ${data.num_comments}`);
    lines.push(`URL:         ${data.url || ''}`);
    lines.push(`Scraped:     ${data.scraped_at || ''}`);
    lines.push('═'.repeat(72));
    lines.push('');
    lines.push('POST:');
    lines.push('');
    lines.push(data.content && data.content.trim() ? data.content.trim() : '(no body text)');
    lines.push('');
    lines.push('─'.repeat(72));

    const flat = UR.flatten(data.comments || []);
    const top  = (data.comments || []).length;
    lines.push(`COMMENTS (${flat.length} total · ${top} top-level · ${flat.length - top} replies)`);
    lines.push('─'.repeat(72));
    lines.push('');

    function render(c, idPath, depth) {
      const indent = '  '.repeat(depth);
      const tag = `[${idPrefix}${idPath.join('.')}]`;
      const meta = [`u/${c.author || '[deleted]'}${c.is_op ? ' · OP' : ''}`];
      if (c.score !== undefined && c.score !== '') meta.push(`${c.score}pts`);
      const when = UR.fmtTime(c.timestamp);
      if (when) meta.push(when);

      lines.push(`${indent}${tag} ${meta.join(' · ')}`);
      const body = UR.mdInline(c.text);
      body.split('\n').forEach(ln => lines.push(`${indent}  ${ln}`));
      lines.push('');

      if (c.replies && c.replies.length) {
        c.replies.forEach((r, i) => render(r, [...idPath, i + 1], depth + 1));
      }
    }
    (data.comments || []).forEach((c, i) => render(c, [i + 1], 0));
    return lines.join('\n');
  };

  // ══════════════════════════════════════════════════════════════════
  // SINGLE THREAD — CSV
  // ══════════════════════════════════════════════════════════════════
  UR.toCSV = function toCSV(data) {
    const rows = [
      ['kind','id','parent_id','depth','author','score','timestamp','flags','text']
    ];

    rows.push([
      'post',
      data.id || '',
      '',
      '0',
      data.author || '',
      String(data.score || ''),
      data.scraped_at || '',
      '',
      `${data.title || ''}\n\n${data.content || ''}`.trim(),
    ]);

    const flat = UR.flatten(data.comments || []);
    for (const c of flat) {
      rows.push([
        'comment',
        c.id || '',
        c.parent_id || '',
        String(c._path ? c._path.length - 1 : c.depth || 0),
        c.author || '',
        String(c.score || ''),
        c.timestamp || '',
        (c.flags || []).join('|'),
        c.text || '',
      ]);
    }
    return rows.map(r => r.map(csvEsc).join(',')).join('\n');
  };

  function csvEsc(v) {
    const s = v == null ? '' : String(v);
    if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  }

  UR.toJSON = function toJSON(data) {
    return JSON.stringify(data, null, 2);
  };

  // ══════════════════════════════════════════════════════════════════
  // BULK (multi-thread) EXPORTERS
  // IDs are prefixed with T{n} so cross-thread references are unambiguous.
  // ══════════════════════════════════════════════════════════════════

  UR.toMarkdownBulk = function toMarkdownBulk(bulk) {
    const lines = [];
    const threads = bulk.threads || [];

    lines.push(`# r/${bulk.subreddit} — ${bulk.sort || 'hot'}`);
    lines.push('');
    lines.push(`**Scraped:** ${bulk.scraped_at || ''}  `);
    lines.push(`**Threads captured:** ${threads.length}  `);
    if (bulk.errors?.length) lines.push(`**Threads failed:** ${bulk.errors.length}  `);
    if (bulk.timeFilter && (bulk.sort === 'top' || bulk.sort === 'controversial')) {
      lines.push(`**Time window:** ${bulk.timeFilter}  `);
    }
    lines.push(`**Source:** ${bulk.source_url || ''}`);
    lines.push('');

    // Table of contents
    lines.push('## Threads');
    lines.push('');
    threads.forEach((t, i) => {
      const n = i + 1;
      const cc = t.total_comments_extracted ?? (UR.countNodes(t.comments || []));
      const sub = t.subreddit || bulk.subreddit;
      lines.push(`${n}. **[T${n}]** ${t.title || '(untitled)'} — r/${sub} · u/${t.author || '?'} · ${t.score || '—'} pts · ${cc} comments captured`);
    });
    lines.push('');
    lines.push('---');
    lines.push('');

    // Each thread rendered with T{n}.Cx prefix
    threads.forEach((t, i) => {
      const tIdx = i + 1;
      lines.push(`# [T${tIdx}] ${t.title || '(untitled)'}`);
      lines.push('');
      lines.push(`**Author:** u/${t.author || '[deleted]'}  `);
      if (t.score !== '' && t.score !== undefined) lines.push(`**Score:** ${t.score}  `);
      if (t.num_comments) lines.push(`**Reddit total:** ${t.num_comments} comments  `);
      if (t.flair) lines.push(`**Flair:** ${t.flair}  `);
      lines.push(`**URL:** ${t.url || t.permalink || ''}`);
      lines.push('');
      lines.push('## Post body');
      lines.push('');
      lines.push(t.content && t.content.trim() ? t.content.trim() : '*(link / image / video post — no text body)*');
      lines.push('');

      // Render comments with T{tIdx}.C prefix
      const comments = t.comments || [];
      const flat = UR.flatten(comments);
      const top = comments.length;
      lines.push(`## Comments (${flat.length} total · ${top} top-level · ${flat.length - top} replies)`);
      lines.push('');

      function renderC(c, idPath, depth) {
        const tag = `[T${tIdx}.C${idPath.join('.')}]`;
        const meta = [];
        if (c.author) meta.push(`u/${c.author}${c.is_op ? ' · OP' : ''}`);
        if (c.score !== undefined && c.score !== '') meta.push(`${c.score} pts`);
        const when = UR.fmtTime(c.timestamp);
        if (when) meta.push(when);
        const flags = (c.flags || []).map(f => ({ pain_point:'pain', feature_request:'request', positive:'praise' }[f])).filter(Boolean);
        if (flags.length) meta.push(flags.join(', '));

        const q = '>'.repeat(Math.min(depth, 6));
        const prefix = q ? q + ' ' : '';

        if (depth === 0) {
          lines.push(`### ${tag} ${meta.join(' · ')}`);
          lines.push('');
          UR.mdInline(c.text).split('\n').forEach(ln => lines.push(ln));
          lines.push('');
        } else {
          lines.push(`${prefix}**${tag}** ${meta.join(' · ')}`);
          UR.mdInline(c.text).split('\n').forEach(ln => lines.push(`${prefix}${ln}`));
          lines.push(q ? `${q}` : '');
        }

        if (c.replies && c.replies.length) {
          c.replies.forEach((r, j) => renderC(r, [...idPath, j + 1], depth + 1));
        }
      }
      comments.forEach((c, j) => renderC(c, [j + 1], 0));

      lines.push('');
      lines.push('---');
      lines.push('');
    });

    if (bulk.errors?.length) {
      lines.push('## Threads that failed to scrape');
      lines.push('');
      bulk.errors.forEach(e => lines.push(`- ${e.title || e.id}: ${e.error || 'unknown error'}`));
      lines.push('');
    }

    lines.push('*Generated by Ureddit v3.0 — market intelligence scraper*');
    return lines.join('\n');
  };

  UR.toTextBulk = function toTextBulk(bulk) {
    const lines = [];
    const threads = bulk.threads || [];

    lines.push('═'.repeat(72));
    lines.push(`REDDIT SUBREDDIT BULK SCRAPE — r/${bulk.subreddit}/${bulk.sort || 'hot'}`);
    lines.push('═'.repeat(72));
    lines.push(`Scraped:  ${bulk.scraped_at}`);
    lines.push(`Threads:  ${threads.length}`);
    lines.push(`Source:   ${bulk.source_url || ''}`);
    lines.push('═'.repeat(72));
    lines.push('');
    lines.push('THREAD INDEX:');
    threads.forEach((t, i) => {
      lines.push(`  [T${i+1}] ${t.title || '(untitled)'} — u/${t.author || '?'} · ${t.score || '—'}pts · ${UR.countNodes(t.comments || [])} comments`);
    });
    lines.push('');
    lines.push('═'.repeat(72));
    lines.push('');

    threads.forEach((t, i) => {
      const tIdx = i + 1;
      lines.push(`─── [T${tIdx}] ${t.title || '(untitled)'} ─────────────────────────────────`);
      lines.push('');
      lines.push(`Author:  u/${t.author || '?'}   Score: ${t.score || '—'}   URL: ${t.url || ''}`);
      lines.push('');
      if (t.content && t.content.trim()) {
        lines.push('Post:');
        lines.push(t.content.trim());
        lines.push('');
      }

      function render(c, idPath, depth) {
        const indent = '  '.repeat(depth);
        const tag = `[T${tIdx}.C${idPath.join('.')}]`;
        const meta = [`u/${c.author || '?'}${c.is_op ? ' · OP' : ''}`];
        if (c.score !== '' && c.score !== undefined) meta.push(`${c.score}pts`);
        const when = UR.fmtTime(c.timestamp);
        if (when) meta.push(when);
        lines.push(`${indent}${tag} ${meta.join(' · ')}`);
        UR.mdInline(c.text).split('\n').forEach(ln => lines.push(`${indent}  ${ln}`));
        lines.push('');
        if (c.replies && c.replies.length) {
          c.replies.forEach((r, j) => render(r, [...idPath, j + 1], depth + 1));
        }
      }
      (t.comments || []).forEach((c, j) => render(c, [j + 1], 0));
      lines.push('');
    });

    return lines.join('\n');
  };

  UR.toJSONBulk = function toJSONBulk(bulk) {
    return JSON.stringify(bulk, null, 2);
  };

  UR.toCSVBulk = function toCSVBulk(bulk) {
    const rows = [['thread_idx','thread_id','thread_title','kind','id','parent_id','depth','author','score','timestamp','flags','text']];
    (bulk.threads || []).forEach((t, i) => {
      const tIdx = i + 1;
      // Post row
      rows.push([
        String(tIdx), t.id || '', t.title || '',
        'post', t.id || '', '', '0',
        t.author || '', String(t.score || ''),
        t.scraped_at || '', '',
        `${t.title || ''}\n\n${t.content || ''}`.trim(),
      ]);
      // Comment rows
      const flat = UR.flatten(t.comments || []);
      for (const c of flat) {
        rows.push([
          String(tIdx), t.id || '', t.title || '',
          'comment', c.id || '', c.parent_id || '',
          String(c._path ? c._path.length - 1 : c.depth || 0),
          c.author || '', String(c.score || ''),
          c.timestamp || '', (c.flags || []).join('|'),
          c.text || '',
        ]);
      }
    });
    return rows.map(r => r.map(csvEsc).join(',')).join('\n');
  };

  // ══════════════════════════════════════════════════════════════════
  // PROMPT TEMPLATES (production-grade research prompts)
  // Each is prepended to the MD export. User pastes the result into Claude/ChatGPT.
  // ══════════════════════════════════════════════════════════════════

  UR.PROMPTS = [
    {
      id: 'pain_clusters',
      label: 'Pain-point clusters',
      hint:  'Find recurring complaints across unique users',
      body: `ROLE: You are a senior market researcher helping a solo founder identify monetizable pain points.

TASK: Analyze the Reddit thread(s) below and extract **pain clusters**.

A pain cluster = a problem mentioned by MULTIPLE UNIQUE USERS, with enough specificity to be actionable. Aim for 3–7 clusters. If the data doesn't support 3, say so honestly — don't invent.

For each cluster, report:

1. **Name** (5–10 words, descriptive)
2. **Frequency**: count of *unique* users mentioning it (not total mentions)
3. **Severity** (1–5): based on tone, language intensity, whether blocking vs annoying
4. **Type**: workflow friction / missing feature / unreliable tool / cost concern / expertise gap / other
5. **Evidence**: quote 2–3 representative comments using their [C1.x] or [T1.C1.x] IDs exactly
6. **User profile**: inferred from language (beginner/intermediate/expert · solo/team · industry)
7. **Existing solutions**: if replies mention a workaround or tool, note it
8. **Monetization signal** (1–5): evidence of willingness to pay

END WITH:
- **Top 3 opportunities**: rank by (frequency × severity × low existing solution quality × monetization signal). Explain each pick.
- **Red flags**: clusters that are already solved, too niche, or require deep domain expertise. Say why to skip them.

Be brutally honest. If the thread is mostly noise, say so.

---

`,
    },
    {
      id: 'monetization',
      label: 'Monetization signals',
      hint:  'Find explicit buyer intent — who would write a check',
      body: `ROLE: Buyer-intent scanner.

TASK: Scan the Reddit thread(s) for explicit buyer-intent language. Ignore general complaints — find comments showing someone who would actually pay.

EXTRACT every instance of patterns like:
- "I'd pay for X" / "would pay $N for Y"
- "Currently paying $X for Y and it doesn't do Z"
- "Anyone know a tool that does X? (budget: $Y)"
- "Tried A, B, C — all bad — need something that does X"
- "Our team uses X but we need Y instead"
- "Willing to hire someone to build this"

For each signal, report:
- Exact quote + comment ID ([C1.x] or [T1.C1.x])
- Author username
- What they'd pay for (concrete feature description)
- WTP estimate (explicit dollar amount, or inferred from context — say which)
- Competing tools they named
- Urgency: "nice to have" vs "need now"

END WITH:
- **Top 5 prospects**: commenters showing clearest buyer intent. Username + one-line reason for each.
- **Pricing calibration**: if multiple users mentioned dollar amounts, what's the median? range?
- **Warning**: if buyer-intent signals are weak, say so. Don't manufacture evidence.

---

`,
    },
    {
      id: 'landscape',
      label: 'Competitive landscape',
      hint:  'Map tools/products mentioned, sentiment, gaps',
      body: `ROLE: Competitive intelligence analyst.

TASK: From the thread(s) below, identify every **product, service, tool, or company** mentioned by commenters.

For each mention:
- Name + category (SaaS / app / script / service / framework / other)
- Sentiment in context: positive / mixed / negative
- Specific complaints cited (quotes + comment IDs)
- Specific praise cited
- Pricing mentioned (if any)
- Alternatives users switched to or from

END WITH:
- **Market map**: group tools into tiers — clear leaders / struggling incumbents / new entrants / abandoned
- **Gaps**: features that NO tool currently provides (based on "none of them have X" language)
- **Switching drivers**: what triggers users to leave one tool for another?
- **Blue ocean call**: is there a product category clearly missing from this discussion?

Skip products mentioned once with no sentiment — that's noise.

---

`,
    },
    {
      id: 'opportunities',
      label: 'Feature opportunities',
      hint:  'Unmet needs worth building',
      body: `ROLE: Product strategy consultant.

TASK: Surface **unmet needs and feature requests** from the thread(s).

A feature opportunity = a user describing functionality they WANT that doesn't currently exist in tools they use. Aim for 5–10.

For each:

1. **Feature description** (one concrete sentence)
2. **Evidence**: user's own words + comment IDs
3. **Adjacent products**: which existing tool/category would this fit into?
4. **Demand signal**: how many unique users want this?
5. **Technical feasibility**: solo-dev / small team / enterprise? justify
6. **Market hint**: niche / professional segment / mass market?

END WITH:
- **Ranked top 5** by (demand × feasibility × market size)
- **Don't-build list**: requests that look like bad ideas (too niche, technically infeasible, already rejected by the market, or personal edge cases). Say why.

---

`,
    },
    {
      id: 'personas',
      label: 'User personas',
      hint:  'Build archetypes from the commenters',
      body: `ROLE: UX researcher.

TASK: Build 3–5 **user personas** from the commenters in the thread(s).

A persona = a reusable character sketch representing an archetype visible in the data — not a single user.

For each persona:

1. **Archetype name** (e.g., "Skeptical Solo Operator", "Over-Invested Team Lead")
2. **Demographics**: age range, role, industry (inferred from language and context)
3. **Technical level**: beginner / intermediate / expert
4. **Primary pain**: what matters most to them in this space
5. **Current workaround**: what they use/do today
6. **What they'd pay for**: bullet-list of desired features
7. **Representative voice**: 2–3 comments from this archetype (with IDs)
8. **Red flags when selling to them**: what makes this persona hard to convert? (price-sensitive, loyal to existing tool, distrustful of startups, etc.)

END WITH:
- **Highest-leverage persona**: which one should the founder build for first? Why? What's the follow-on persona after that?

---

`,
    },
    {
      id: 'adjacent',
      label: 'Adjacent markets / subs',
      hint:  'Where else does this audience congregate?',
      body: `ROLE: Reddit intelligence analyst.

TASK: Based on the thread(s) below, suggest **10 ADJACENT subreddits** where the same audience congregates from a different angle.

Adjacent = same user archetype, different conversation lens. E.g., if the thread is in r/SaaS about billing pain: adjacent subs might be r/startups (founder lens), r/stripe (tool-specific), r/webdev (builder lens), r/accounting (the service-side lens), r/bookkeeping, etc.

For each suggested subreddit:

1. r/name
2. **Overlap reason**: one sentence on why users overlap
3. **Probable angle**: what pain shows up there (different wording, same underlying problem)
4. **Overlap strength**: high / medium / low
5. **Monetization signal**: is this sub commercial (paying users) or hobbyist?

END WITH:
- **Research order**: rank the top 5 subs to scrape next
- **Non-obvious pick**: one sub most people wouldn't think of but that's likely high-value. Justify.

---

`,
    },
    {
      id: 'founder_brief',
      label: 'Full founder brief',
      hint:  'Combined research output — run this if unsure',
      body: `ROLE: You are a research partner for a solo founder evaluating whether to build a product based on the Reddit data below.

Produce a SINGLE structured brief with these sections. Be concise — no filler.

## 1. ONE-LINE VERDICT
Should they build something from this thread? YES / NO / MAYBE with 15 words of reasoning.

## 2. TOP 3 PAIN CLUSTERS
For each: name, unique-user count, severity (1–5), 1–2 evidence quotes with IDs.

## 3. MONETIZATION SIGNALS
List every explicit "I'd pay for", "currently paying $X", "willing to pay" quote. Quote + ID + author.

## 4. COMPETITIVE LANDSCAPE (briefly)
Products mentioned + sentiment + explicit gaps.

## 5. USER PROFILE
Who is the buyer? (demographics, technical level, budget range, decision maker or influencer)

## 6. THE BUILD
If YES: what to build (one sentence), smallest MVP (3 features max), distribution strategy.

## 7. RED FLAGS
Reasons this is a bad idea. Be honest — write at least 2.

## 8. NEXT RESEARCH STEPS
Three concrete next moves (e.g., "scrape r/X for adjacent angle", "run a landing-page test with copy Y", etc.).

---

`,
    },
    {
      id: 'decision_memo',
      label: 'Decision memo (structured)',
      hint:  'Shippable 10-section go/no-go brief — auto-appends structured data',
      needsStructured: true,
      body: `ROLE: You are a research partner producing a shippable decision memo for a solo founder evaluating whether to build a product.

TASK: Output a tight 10-section go/no-go brief following the exact structure below. Be honest and auditable. Every claim MUST cite a comment ID — if you can't cite it, don't claim it.

A structured-data summary (pre-computed clusters, stats, top authors) is provided below the prompt. Use those numbers as the ground truth. The raw thread(s) follow. Do NOT invent quotes — every quote must appear verbatim in the raw data.

OUTPUT FORMAT:

## 1. Job-to-be-done
One sentence in the user's own words (quote mark). What are they actually trying to accomplish?

## 2. Top 5 verbatim pain quotes
Format: \`> "[quote]" — u/author · [C1.2] · r/subreddit · [if timestamp available]\`
Pick the 5 most representative of the dominant pain — NOT the 5 funniest.

## 3. Frequency count
- Distinct users mentioning the dominant pain: N
- Across how many threads: M
- Over what time window: T (if inferable)
- Cluster evidence: "[cluster name]" appeared in N unique comments (reference the structured summary)

## 4. Existing solutions named in-thread
For each tool/workaround mentioned, one line: \`[tool name] — sentiment (quote + ID) — why insufficient (quote + ID)\`.
If no tools named, say "None — the market has no obvious incumbent."

## 5. Willingness-to-pay signal
Every explicit price mention, "I'd pay for", "currently paying $X", "budget for X" quote. Cite IDs.
If none: "No explicit WTP signal — red flag for B2C, acceptable for B2B research."

## 6. Counter-evidence (MANDATORY)
At least 2 quotes or observations that argue AGAINST building. Examples: commenters who solved it themselves, comments suggesting the pain is niche, replies offering a working tool. Cite IDs.
If you cannot find counter-evidence, say "No counter-evidence found — suspicious, re-scan required."

## 7. ICE score
Impact: N/10 (how much pain relief)
Confidence: N/10 (how sure are we the signal is real)
Ease: N/10 (solo-buildable in 3 months?)
Total: sum / 3

Justify each number in one phrase.

## 8. Proposed kill/proceed test
Concrete, numeric, time-boxed:
- "5 pre-sales at $X by [date], or kill"
- "300 waitlist signups in 14 days from r/X post, or kill"
- "3 founding-customer interviews schedule by Friday, or kill"
Pick ONE specific test. No vagueness.

## 9. Red flags checklist
Check each that applies — if yes, flag as caution:
- [ ] Requires enterprise sales
- [ ] Requires network effects
- [ ] Requires regulated domain expertise
- [ ] Requires multi-platform distribution
- [ ] Adds work to user workflow (vs removes it)
- [ ] Dominant incumbent with entrenched distribution
- [ ] Non-English market signal mistaken for universal
- [ ] User-stated WTP unrealistic (anchor 3-5x lower)

## 10. Go / No-Go
One line: **GO** / **NO-GO** / **NEEDS-MORE-RESEARCH** with <20 words of reasoning.

---

CRITICAL RULES:
- Cite comment IDs [C1.2] or [T3.C1.2] for every quote. No citation = don't include it.
- Do not smooth heterogeneous complaints into a clean narrative — preserve the actual diversity of opinion.
- "Synthetic consensus" is the #1 failure mode. If commenters disagree, say so.
- If the data genuinely doesn't support a GO, say NO-GO. Don't hedge to please the founder.
- If counter-evidence is missing from the data, flag that — don't fabricate it.

---

`,
    },
  ];

  // ══════════════════════════════════════════════════════════════════
  // CLUSTERING (TF-IDF + cosine, DBSCAN-like growth)
  // ══════════════════════════════════════════════════════════════════

  const STOPWORDS = new Set((
    'a,about,above,after,again,against,all,am,an,and,any,are,aren,arent,as,at,be,because,been,before,being,below,between,both,but,by,can,cant,could,couldnt,did,didnt,do,does,doesnt,doing,dont,down,during,each,few,for,from,further,had,hadnt,has,hasnt,have,havent,having,he,her,here,hers,herself,him,himself,his,how,i,if,in,into,is,isnt,it,its,itself,just,lets,me,more,most,my,myself,no,nor,not,now,of,off,on,once,only,or,other,ought,our,ours,ourselves,out,over,own,same,shant,she,should,shouldnt,so,some,such,than,that,the,their,theirs,them,themselves,then,there,these,they,theyre,this,those,through,to,too,under,until,up,very,was,wasnt,we,were,werent,what,when,where,which,while,who,whom,why,will,with,wont,would,wouldnt,you,your,yours,yourself,yourselves,' +
    // Reddit/forum noise
    'reddit,subreddit,r,u,post,thread,comment,upvote,downvote,op,edit,update,tldr,tl,dr,lol,lmao,imo,imho,fwiw,afaik,ymmv,btw,yeah,yep,nope,ok,okay,dude,guys,guy,honestly,basically,literally,really,actually,stuff,thing,things,way,ways,lot,lots,bit,kinda,sorta,gonna,wanna,gotta,also,even,still,though,well,like,make,made,makes,making,take,takes,taking,took,get,gets,getting,got,go,goes,going,went,see,sees,seeing,saw,seen,know,knows,knowing,knew,known,think,thinks,thought,say,says,said,saying,come,comes,came,coming,looks,looking,good,great,nice,bad,better,best,worse,worst,much,many,less,fewer,something,anything,nothing,everything,someone,anyone,everyone,people,person,never,always,sometimes,often,maybe,probably,definitely,actually'
  ).split(','));

  function ur_tokenize(text) {
    return (text || '')
      .toLowerCase()
      .replace(/https?:\/\/\S+/g, ' ')           // strip URLs
      .replace(/[^\w\s']/g, ' ')                 // remove punct except apostrophe
      .replace(/\s+/g, ' ')
      .split(' ')
      .filter(w => w.length > 2 && w.length < 25 && !STOPWORDS.has(w) && !/^\d+$/.test(w));
  }

  function ur_buildDF(docs) {
    const df = new Map();
    for (const doc of docs) {
      const seen = new Set();
      for (const w of doc) {
        if (!seen.has(w)) {
          df.set(w, (df.get(w) || 0) + 1);
          seen.add(w);
        }
      }
    }
    return df;
  }

  function ur_tfidfVector(doc, df, totalDocs) {
    const tf = new Map();
    for (const w of doc) tf.set(w, (tf.get(w) || 0) + 1);
    const vec = new Map();
    const docLen = doc.length || 1;
    for (const [w, count] of tf) {
      // Filter: words appearing in > 85% of docs are too common
      // words appearing once (across all docs) are too rare — unless doc is short
      const dfVal = df.get(w) || 1;
      if (dfVal / totalDocs > 0.85) continue;
      const idf = Math.log((totalDocs + 1) / (dfVal + 1)) + 1;
      vec.set(w, (count / docLen) * idf);
    }
    return vec;
  }

  function ur_cosineSim(a, b) {
    let dot = 0, magA = 0, magB = 0;
    for (const v of a.values()) magA += v * v;
    for (const v of b.values()) magB += v * v;
    if (!magA || !magB) return 0;

    const [small, large] = a.size < b.size ? [a, b] : [b, a];
    for (const [w, v] of small) {
      if (large.has(w)) dot += v * large.get(w);
    }
    return dot / Math.sqrt(magA * magB);
  }

  /**
   * Cluster comments by topic/complaint similarity.
   * @param {Array} items — each must have { text, flags?, score?, upvotes?, author?, _threadIdx?, _threadTitle? }
   * @param {Object} options
   * @returns { clusters: [{ id, size, keywords, members, sample_members }], unclustered: [idx], stats }
   */
  UR.cluster = function cluster(items, options = {}) {
    const {
      minClusterSize       = 3,
      similarityThreshold  = 0.30,
      maxSeeds             = 60,
      maxClusters          = 20,
    } = options;

    if (!items || items.length < minClusterSize) {
      return { clusters: [], unclustered: [], stats: { total: items?.length || 0, clustered: 0 } };
    }

    // 1. Tokenize
    const docs = items.map(it => ur_tokenize(it.text));

    // 2. Build DF
    const df = ur_buildDF(docs);
    const totalDocs = docs.length;

    // 3. TF-IDF vectors
    const vectors = docs.map(d => ur_tfidfVector(d, df, totalDocs));

    // 4. Rank candidates as potential seeds — prefer flagged + high-upvote + non-trivial comments
    const seedCandidates = items
      .map((it, i) => {
        const flagScore = (it.flags?.length || 0) * 12;
        const upScore   = Math.log1p(parseInt(it.score ?? it.upvotes ?? 0, 10) || 0) * 4;
        const lenScore  = Math.log1p(docs[i].length);
        const score     = flagScore + upScore + lenScore;
        return { idx: i, score, vecSize: vectors[i].size };
      })
      .filter(s => s.vecSize >= 3)              // need enough distinctive words
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSeeds);

    // 5. Grow clusters greedily
    const clusters = [];
    const assigned = new Set();

    for (const seed of seedCandidates) {
      if (assigned.has(seed.idx)) continue;
      if (clusters.length >= maxClusters) break;

      const seedVec = vectors[seed.idx];
      const members = [seed.idx];
      assigned.add(seed.idx);

      for (let j = 0; j < items.length; j++) {
        if (assigned.has(j)) continue;
        if (vectors[j].size < 2) continue;
        const sim = ur_cosineSim(seedVec, vectors[j]);
        if (sim >= similarityThreshold) {
          members.push(j);
          assigned.add(j);
        }
      }

      if (members.length >= minClusterSize) {
        // Compute cluster keywords: top TF-IDF terms summed across members
        const kwScore = new Map();
        for (const m of members) {
          for (const [w, v] of vectors[m]) {
            kwScore.set(w, (kwScore.get(w) || 0) + v);
          }
        }
        const keywords = [...kwScore.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([w]) => w);

        // Pick 3 most representative members (highest cosine to centroid = seed for now)
        const memberSims = members.map(m => ({
          idx: m,
          sim: ur_cosineSim(seedVec, vectors[m]),
          score: parseInt(items[m].score ?? items[m].upvotes ?? 0, 10) || 0,
          flagCount: (items[m].flags?.length || 0),
        }));
        memberSims.sort((a, b) => (b.sim + b.flagCount * 0.1 + Math.log1p(b.score) * 0.05) - (a.sim + a.flagCount * 0.1 + Math.log1p(a.score) * 0.05));
        const sample_members = memberSims.slice(0, 3).map(m => m.idx);

        // Collect unique authors + subreddits (for cross-thread clusters)
        const authorSet = new Set();
        const threadSet = new Set();
        let flagCounts = { pain_point: 0, feature_request: 0, positive: 0 };
        for (const m of members) {
          if (items[m].author) authorSet.add(items[m].author);
          if (items[m]._threadIdx !== undefined) threadSet.add(items[m]._threadIdx);
          for (const f of items[m].flags || []) flagCounts[f] = (flagCounts[f] || 0) + 1;
        }

        clusters.push({
          id: clusters.length + 1,
          size: members.length,
          keywords,
          members,
          sample_members,
          unique_authors: authorSet.size,
          thread_count:   threadSet.size,
          flag_counts:    flagCounts,
        });
      } else {
        // Didn't grow to threshold — unassign the seed
        assigned.delete(seed.idx);
        members.slice(1).forEach(m => assigned.delete(m));
      }
    }

    // Re-rank: prefer size * unique_authors (cross-author signal matters)
    clusters.sort((a, b) => (b.size * (b.unique_authors || 1)) - (a.size * (a.unique_authors || 1)));
    clusters.forEach((c, i) => c.id = i + 1);

    const unclustered = [];
    for (let i = 0; i < items.length; i++) if (!assigned.has(i)) unclustered.push(i);

    return {
      clusters,
      unclustered,
      stats: {
        total:      items.length,
        clustered:  assigned.size,
        cluster_count: clusters.length,
      },
    };
  };

  /**
   * Flatten comments from a single-thread or bulk dataset into a shape suitable for clustering.
   * Adds _threadIdx and _threadTitle so cross-thread signals are preserved.
   */
  UR.flattenForClustering = function (dataOrBulk) {
    const out = [];
    const addComment = (c, threadIdx, threadTitle, threadSub) => {
      if (!c.text || c.text.length < 15) return;  // skip trivial one-liners
      out.push({
        text:    c.text,
        flags:   c.flags || [],
        score:   c.score,
        upvotes: c.upvotes,
        author:  c.author,
        _id:     c.id,
        _name:   c.name,
        _permalink: c.permalink,
        _timestamp: c.timestamp,
        _threadIdx:   threadIdx,
        _threadTitle: threadTitle,
        _threadSub:   threadSub,
      });
      if (c.replies) c.replies.forEach(r => addComment(r, threadIdx, threadTitle, threadSub));
    };

    if (dataOrBulk.type === 'bulk') {
      dataOrBulk.threads.forEach((t, i) => {
        (t.comments || []).forEach(c => addComment(c, i, t.title, t.subreddit));
      });
    } else {
      (dataOrBulk.comments || []).forEach(c => addComment(c, 0, dataOrBulk.title, dataOrBulk.subreddit));
    }
    return out;
  };

  // ══════════════════════════════════════════════════════════════════
  // STRUCTURED SUMMARY (prepended to decision-memo prompt)
  // Gives the LLM pre-computed ground truth to anchor its analysis.
  // ══════════════════════════════════════════════════════════════════

  UR.buildStructuredSummary = function (dataOrBulk) {
    const isBulk = dataOrBulk.type === 'bulk';
    const items = UR.flattenForClustering(dataOrBulk);

    const lines = [];
    lines.push('## Structured data summary (pre-computed — use as ground truth)');
    lines.push('');

    // Basic stats
    if (isBulk) {
      lines.push(`- **Type:** bulk scrape of ${dataOrBulk.threads.length} threads from r/${dataOrBulk.subreddit} (${dataOrBulk.sort})`);
      lines.push(`- **Scraped:** ${dataOrBulk.scraped_at}`);
      lines.push(`- **Time window:** ${(dataOrBulk.sort === 'top' || dataOrBulk.sort === 'controversial') ? dataOrBulk.timeFilter : 'sorted by ' + dataOrBulk.sort}`);
    } else {
      lines.push(`- **Type:** single thread from r/${dataOrBulk.subreddit}`);
      lines.push(`- **Title:** ${dataOrBulk.title}`);
      lines.push(`- **Scraped:** ${dataOrBulk.scraped_at}`);
    }
    lines.push(`- **Total comments analyzed:** ${items.length}`);
    lines.push('');

    // Flag tallies
    let pain = 0, request = 0, positive = 0;
    const authors = new Map();
    for (const c of items) {
      if (c.flags.includes('pain_point'))      pain++;
      if (c.flags.includes('feature_request')) request++;
      if (c.flags.includes('positive'))        positive++;
      if (c.author && c.author !== '[deleted]') {
        authors.set(c.author, (authors.get(c.author) || 0) + 1);
      }
    }

    lines.push('### Signal counts (keyword-based pre-classifier)');
    lines.push(`- Pain signals: **${pain}**`);
    lines.push(`- Feature requests: **${request}**`);
    lines.push(`- Praise / positive: **${positive}**`);
    lines.push(`- Total unique commenters: **${authors.size}**`);
    lines.push('');

    // Top authors
    const topAuthors = [...authors.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    if (topAuthors.length >= 3) {
      lines.push('### Top commenters (by comment count)');
      topAuthors.forEach(([a, n]) => lines.push(`- u/${a}: ${n} comments`));
      lines.push('');
    }

    // Clusters
    const result = UR.cluster(items);
    if (result.clusters.length) {
      lines.push(`### Detected pain/topic clusters (${result.clusters.length} clusters, ${result.stats.clustered} of ${result.stats.total} comments clustered)`);
      lines.push('');
      lines.push('Each cluster groups semantically similar comments. Use these as frequency anchors for the memo.');
      lines.push('');
      result.clusters.forEach(c => {
        const flagNote = c.flag_counts.pain_point
          ? ` · ⚠ ${c.flag_counts.pain_point} pain`
          : '';
        lines.push(`**Cluster ${c.id}** · ${c.size} comments · ${c.unique_authors} unique authors${c.thread_count > 1 ? ` across ${c.thread_count} threads` : ''}${flagNote}`);
        lines.push(`_Keywords:_ ${c.keywords.join(', ')}`);
        // 2 sample quotes per cluster
        c.sample_members.slice(0, 2).forEach(mi => {
          const m = items[mi];
          const quote = (m.text || '').replace(/\s+/g, ' ').slice(0, 180);
          lines.push(`_Sample:_ "${quote}${m.text.length > 180 ? '…' : ''}" — u/${m.author}`);
        });
        lines.push('');
      });
    } else {
      lines.push('### Cluster detection');
      lines.push('No clusters detected (threshold: 3+ comments sharing keywords). Data may be too small or too diverse.');
      lines.push('');
    }

    lines.push('---');
    lines.push('');
    return lines.join('\n');
  };

  // ══════════════════════════════════════════════════════════════════
  // API HELPERS — Claude (streaming) + OpenAI embeddings
  // Run with user-supplied keys. Keys are passed per-call, never stored here.
  // ══════════════════════════════════════════════════════════════════

  /**
   * Call Claude Messages API with streaming.
   * @param {object} opts
   *   apiKey     — user's Anthropic API key
   *   model      — e.g. 'claude-haiku-4-5', 'claude-sonnet-4-6', 'claude-opus-4-7'
   *   system     — system prompt (string)
   *   messages   — [{ role: 'user'|'assistant', content: string }]
   *   maxTokens  — default 4096
   *   onDelta    — fn(text) called for each streamed chunk
   *   onDone     — fn({ text, inputTokens, outputTokens, stopReason })
   *   onError    — fn(err)
   */
  UR.callClaude = async function (opts) {
    const {
      apiKey, model = 'claude-haiku-4-5',
      system = '', messages = [],
      maxTokens = 4096,
      onDelta, onDone, onError,
      abortSignal,
    } = opts;

    if (!apiKey) {
      onError?.(new Error('Missing Anthropic API key. Add one in settings.'));
      return;
    }

    try {
      const res = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          system: system || undefined,
          messages,
          stream: true,
        }),
        signal: abortSignal,
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        let detail = errText;
        try {
          const ej = JSON.parse(errText);
          detail = ej.error?.message || errText;
        } catch {}
        throw new Error(`Anthropic API ${res.status}: ${detail.slice(0, 200)}`);
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder('utf-8');
      let fullText = '';
      let inputTokens = 0, outputTokens = 0, stopReason = '';
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const payload = line.slice(6).trim();
          if (!payload || payload === '[DONE]') continue;

          try {
            const evt = JSON.parse(payload);
            if (evt.type === 'content_block_delta' && evt.delta?.type === 'text_delta') {
              const chunk = evt.delta.text || '';
              fullText += chunk;
              onDelta?.(chunk);
            } else if (evt.type === 'message_start') {
              inputTokens = evt.message?.usage?.input_tokens || 0;
            } else if (evt.type === 'message_delta') {
              outputTokens = evt.usage?.output_tokens || outputTokens;
              stopReason = evt.delta?.stop_reason || stopReason;
            }
          } catch (e) { /* ignore parse errors */ }
        }
      }

      onDone?.({ text: fullText, inputTokens, outputTokens, stopReason });

    } catch (err) {
      if (err.name === 'AbortError') return;
      onError?.(err);
    }
  };

  /**
   * OpenAI embeddings — text-embedding-3-small (1536 dims by default; can pass dimensions for shorter)
   */
  UR.callOpenAIEmbeddings = async function (opts) {
    const {
      apiKey, texts,
      model = 'text-embedding-3-small',
      dimensions = 384,
      onProgress,
      abortSignal,
    } = opts;

    if (!apiKey) throw new Error('Missing OpenAI API key.');
    if (!texts || !texts.length) return [];

    const BATCH = 96;  // OpenAI allows up to ~2048 but smaller batches give better UX
    const results = new Array(texts.length);

    for (let i = 0; i < texts.length; i += BATCH) {
      const batch = texts.slice(i, i + BATCH).map(t => (t || '').slice(0, 8000));  // truncate huge texts

      const res = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': 'Bearer ' + apiKey,
        },
        body: JSON.stringify({ model, input: batch, dimensions }),
        signal: abortSignal,
      });

      if (!res.ok) {
        const t = await res.text().catch(() => '');
        throw new Error(`OpenAI embeddings ${res.status}: ${t.slice(0, 200)}`);
      }

      const json = await res.json();
      const vecs = json?.data || [];
      for (let j = 0; j < vecs.length; j++) {
        results[i + j] = new Float32Array(vecs[j].embedding);
      }

      onProgress?.(Math.min(i + BATCH, texts.length), texts.length);
    }
    return results;
  };

  /**
   * Cosine similarity for dense Float32 vectors (from embeddings).
   */
  function denseCosine(a, b) {
    let dot = 0, magA = 0, magB = 0;
    const len = Math.min(a.length, b.length);
    for (let i = 0; i < len; i++) {
      dot  += a[i] * b[i];
      magA += a[i] * a[i];
      magB += b[i] * b[i];
    }
    if (!magA || !magB) return 0;
    return dot / Math.sqrt(magA * magB);
  }

  /**
   * Cluster from dense embedding vectors. Same greedy growth as TF-IDF but with better similarity.
   */
  UR.clusterWithEmbeddings = function (items, embeddings, options = {}) {
    const {
      minClusterSize      = 3,
      similarityThreshold = 0.62,      // embeddings are more discriminating than TF-IDF
      maxSeeds            = 80,
      maxClusters         = 25,
    } = options;

    if (!items.length || !embeddings.length) {
      return { clusters: [], unclustered: [], stats: { total: items.length, clustered: 0, cluster_count: 0 } };
    }

    const seedCandidates = items
      .map((it, i) => ({
        idx: i,
        score: (it.flags?.length || 0) * 10 + Math.log1p(parseInt(it.score ?? it.upvotes ?? 0, 10) || 0) * 3 + Math.log1p((it.text || '').length),
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, maxSeeds);

    const clusters = [];
    const assigned = new Set();

    for (const seed of seedCandidates) {
      if (assigned.has(seed.idx)) continue;
      if (clusters.length >= maxClusters) break;
      const seedVec = embeddings[seed.idx];
      if (!seedVec) continue;

      const members = [seed.idx];
      assigned.add(seed.idx);

      for (let j = 0; j < items.length; j++) {
        if (assigned.has(j)) continue;
        const v = embeddings[j];
        if (!v) continue;
        const sim = denseCosine(seedVec, v);
        if (sim >= similarityThreshold) {
          members.push(j);
          assigned.add(j);
        }
      }

      if (members.length >= minClusterSize) {
        // Get keywords using TF-IDF approach within cluster
        const docs = members.map(m => ur_tokenize(items[m].text));
        const df = ur_buildDF(docs);
        const kwScore = new Map();
        docs.forEach(d => {
          const v = ur_tfidfVector(d, df, docs.length);
          for (const [w, val] of v) kwScore.set(w, (kwScore.get(w) || 0) + val);
        });
        const keywords = [...kwScore.entries()]
          .sort((a, b) => b[1] - a[1])
          .slice(0, 6)
          .map(([w]) => w);

        // Representative samples — centroid-based
        const centroid = new Float32Array(seedVec.length);
        for (const m of members) {
          const v = embeddings[m];
          for (let k = 0; k < centroid.length; k++) centroid[k] += v[k];
        }
        for (let k = 0; k < centroid.length; k++) centroid[k] /= members.length;

        const memberSims = members.map(m => ({
          idx: m,
          sim: denseCosine(centroid, embeddings[m]),
          score: parseInt(items[m].score ?? items[m].upvotes ?? 0, 10) || 0,
          flagCount: (items[m].flags?.length || 0),
        }));
        memberSims.sort((a, b) => (b.sim + b.flagCount * 0.03 + Math.log1p(b.score) * 0.02) - (a.sim + a.flagCount * 0.03 + Math.log1p(a.score) * 0.02));
        const sample_members = memberSims.slice(0, 3).map(m => m.idx);

        const authorSet = new Set();
        const threadSet = new Set();
        let flagCounts = { pain_point: 0, feature_request: 0, positive: 0 };
        for (const m of members) {
          if (items[m].author) authorSet.add(items[m].author);
          if (items[m]._threadIdx !== undefined) threadSet.add(items[m]._threadIdx);
          for (const f of items[m].flags || []) flagCounts[f] = (flagCounts[f] || 0) + 1;
        }

        clusters.push({
          id: clusters.length + 1,
          size: members.length,
          keywords,
          members,
          sample_members,
          unique_authors: authorSet.size,
          thread_count:   threadSet.size,
          flag_counts:    flagCounts,
          _semantic: true,
        });
      } else {
        assigned.delete(seed.idx);
        members.slice(1).forEach(m => assigned.delete(m));
      }
    }

    clusters.sort((a, b) => (b.size * (b.unique_authors || 1)) - (a.size * (a.unique_authors || 1)));
    clusters.forEach((c, i) => c.id = i + 1);

    const unclustered = [];
    for (let i = 0; i < items.length; i++) if (!assigned.has(i)) unclustered.push(i);

    return {
      clusters,
      unclustered,
      stats: { total: items.length, clustered: assigned.size, cluster_count: clusters.length },
      semantic: true,
    };
  };

  // Simple hash for cache keys
  UR.hashText = function (text) {
    let h = 5381;
    for (let i = 0; i < text.length; i++) h = (h * 33) ^ text.charCodeAt(i);
    return (h >>> 0).toString(36);
  };

  // ══════════════════════════════════════════════════════════════════
  // MARKDOWN → HTML (simple, safe renderer for analysis display)
  // ══════════════════════════════════════════════════════════════════
  UR.markdownToHtml = function (md) {
    if (!md) return '';
    // Escape HTML
    let html = md
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;');

    // Code blocks (triple backtick)
    html = html.replace(/```([\s\S]*?)```/g, '<pre><code>$1</code></pre>');

    // Horizontal rule
    html = html.replace(/^---+$/gm, '<hr/>');

    // Headings
    html = html.replace(/^###### (.*)$/gm, '<h6>$1</h6>')
               .replace(/^##### (.*)$/gm, '<h5>$1</h5>')
               .replace(/^#### (.*)$/gm, '<h4>$1</h4>')
               .replace(/^### (.*)$/gm, '<h3>$1</h3>')
               .replace(/^## (.*)$/gm, '<h2>$1</h2>')
               .replace(/^# (.*)$/gm, '<h1>$1</h1>');

    // Bold
    html = html.replace(/\*\*([^*\n]+)\*\*/g, '<strong>$1</strong>');
    // Italic
    html = html.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    // Inline code
    html = html.replace(/`([^`\n]+)`/g, '<code>$1</code>');

    // Comment-ID highlights [C1.2] / [T3.C1.2] — make them distinctive
    html = html.replace(/\[(T\d+\.C[\d.]+|C[\d.]+)\]/g, '<span class="md-cite">[$1]</span>');

    // Blockquotes (simple, single-line)
    html = html.split('\n').map(line => {
      if (/^&gt;\s/.test(line)) return '<blockquote>' + line.replace(/^&gt;\s?/, '') + '</blockquote>';
      return line;
    }).join('\n');

    // Unordered lists (naive)
    html = html.replace(/^(?:- |\* )(.+)$/gm, '<li>$1</li>');
    html = html.replace(/(<li>[\s\S]*?<\/li>\n?)+/g, m => '<ul>' + m + '</ul>');

    // Ordered lists
    html = html.replace(/^\d+\. (.+)$/gm, '<li>$1</li>');

    // Paragraphs (double newline → paragraph break)
    // Leave existing block elements alone
    const paragraphs = html.split(/\n{2,}/).map(p => {
      const trimmed = p.trim();
      if (!trimmed) return '';
      if (/^<(h\d|ul|ol|li|pre|blockquote|hr)/.test(trimmed)) return trimmed;
      return '<p>' + trimmed.replace(/\n/g, '<br/>') + '</p>';
    });
    return paragraphs.join('\n');
  };

  // ══════════════════════════════════════════════════════════════════
  // MULTI-SOURCE ADAPTERS
  // Each produces the same unified data shape so preview/clustering/
  // archive/export work identically across sources.
  // ══════════════════════════════════════════════════════════════════

  UR.sources = {};

  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // ── HACKER NEWS ─────────────────────────────────────────────────────
  UR.sources.hn = {
    id:   'hn',
    name: 'Hacker News',
    color: '#ff6600',

    detect(url) {
      if (!url) return null;
      let m = url.match(/news\.ycombinator\.com\/item\?id=(\d+)/);
      if (m) return { type: 'item', itemId: m[1], url };

      m = url.match(/news\.ycombinator\.com\/(news|newest|ask|show|best|active|jobs)(?:\?|$|\/)/);
      if (m) return { type: 'listing', listType: m[1], url };

      // Bare domain = front page
      if (/news\.ycombinator\.com\/?(?:\?|$)/.test(url)) return { type: 'listing', listType: 'news', url };
      return null;
    },

    async scrapeItem(ctx, opts, onProgress) {
      onProgress?.({ phase: 'init', label: 'Fetching HN item tree…' });
      const res = await fetch(`https://hn.algolia.com/api/v1/items/${ctx.itemId}`);
      if (!res.ok) throw new Error(`HN Algolia returned ${res.status}`);
      const raw = await res.json();
      if (!raw) throw new Error('HN returned empty response');

      const data = convertHNItem(raw, ctx.url);
      onProgress?.({ phase: 'classify', label: 'Classifying signals…' });
      finalizeFlags(data);
      return { data, stats: computeGenericStats(data) };
    },

    async scrapeListing(ctx, opts, onProgress) {
      const {
        threadLimit  = 25,
        commentLimit = 100,
        throttleMs   = 250,
      } = opts || {};

      onProgress?.({ phase: 'listing', label: `Fetching HN ${ctx.listType} list…` });

      // Map listType to Firebase endpoint
      const endpointMap = {
        news:    'topstories',
        newest:  'newstories',
        ask:     'askstories',
        show:    'showstories',
        best:    'beststories',
        active:  'topstories',   // fallback — HN doesn't have /activestories json
        front:   'topstories',
        jobs:    'jobstories',
      };
      const endpoint = endpointMap[ctx.listType] || 'topstories';

      const idsRes = await fetch(`https://hacker-news.firebaseio.com/v0/${endpoint}.json`);
      if (!idsRes.ok) throw new Error(`HN Firebase ${idsRes.status}`);
      const allIds = await idsRes.json();
      const ids = (allIds || []).slice(0, threadLimit);
      if (!ids.length) throw new Error('No items returned from HN');

      onProgress?.({ phase: 'bulk_start', label: `Fetching ${ids.length} HN stories…`, current: 0, total: ids.length });

      const threads = [];
      const errors = [];

      for (let i = 0; i < ids.length; i++) {
        onProgress?.({
          phase:   'bulk_thread',
          label:   `[${i + 1}/${ids.length}] Fetching HN story…`,
          current: i,
          total:   ids.length,
        });

        try {
          const res = await fetch(`https://hn.algolia.com/api/v1/items/${ids[i]}`);
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          const raw = await res.json();
          if (raw) {
            const threadData = convertHNItem(raw, `https://news.ycombinator.com/item?id=${ids[i]}`);
            // Trim comments to requested limit (top-level only)
            if (commentLimit && commentLimit < 9999) {
              threadData.comments = (threadData.comments || []).slice(0, commentLimit);
            }
            finalizeFlags(threadData);
            threads.push(threadData);
          }
        } catch (e) {
          errors.push({ id: ids[i], error: e.message });
        }

        if (i < ids.length - 1) await sleep(throttleMs);
      }

      onProgress?.({ phase: 'bulk_done', label: `Done. ${threads.length} items captured.`, current: ids.length, total: ids.length });

      const bulk = {
        type:       'bulk',
        source:     'hn',
        subreddit:  ctx.listType,      // use the HN list type as the container label
        sort:       ctx.listType,
        timeFilter: null,
        scraped_at: new Date().toISOString(),
        source_url: `https://news.ycombinator.com/${ctx.listType === 'news' ? '' : ctx.listType}`,
        threads,
        errors,
      };

      return { data: bulk, stats: computeBulkStats(threads) };
    },
  };

  function convertHNItem(raw, url) {
    const comments = (raw.children || [])
      .filter(c => c && c.text)
      .map(c => convertHNComment(c, raw.author, `t3_${raw.id}`));

    return {
      source:      'hn',
      id:          String(raw.id),
      name:        `hn_${raw.id}`,
      title:       raw.title || (raw.text ? stripHtml(raw.text).slice(0, 80) : '(untitled)'),
      content:     raw.url ? `🔗 ${raw.url}\n\n${stripHtml(raw.text || '')}` : stripHtml(raw.text || ''),
      author:      raw.author || '[deleted]',
      upvotes:     raw.points || 0,
      score:       raw.points || 0,
      num_comments: countHNReplies(raw.children || []),
      total_comments_extracted: countHNReplies(raw.children || []),
      subreddit:   'news.ycombinator.com',
      permalink:   `https://news.ycombinator.com/item?id=${raw.id}`,
      created_utc: raw.created_at_i || (raw.created_at ? Math.floor(new Date(raw.created_at).getTime() / 1000) : null),
      url:         url || `https://news.ycombinator.com/item?id=${raw.id}`,
      flair:       '',
      scraped_at:  new Date().toISOString(),
      comments,
    };
  }

  function convertHNComment(node, opAuthor, parentName) {
    const replies = (node.children || [])
      .filter(c => c && c.text)
      .map(c => convertHNComment(c, opAuthor, `t1_${node.id}`));

    return {
      id:        String(node.id),
      name:      `t1_${node.id}`,
      parent_id: parentName,
      author:    node.author || '[deleted]',
      text:      stripHtml(node.text || ''),
      body_html: node.text || '',
      upvotes:   node.points || 0,
      score:     node.points || 0,
      timestamp: node.created_at || '',
      depth:     0,
      permalink: `https://news.ycombinator.com/item?id=${node.id}`,
      edited:    false,
      is_op:     node.author === opAuthor,
      replies,
    };
  }

  function countHNReplies(children) {
    let n = 0;
    for (const c of children || []) {
      if (!c) continue;
      n++;
      if (c.children) n += countHNReplies(c.children);
    }
    return n;
  }

  // ── STACK OVERFLOW ──────────────────────────────────────────────────
  UR.sources.stackoverflow = {
    id:   'stackoverflow',
    name: 'Stack Overflow',
    color: '#f48024',

    detect(url) {
      if (!url) return null;
      let m = url.match(/stackoverflow\.com\/questions\/(\d+)/);
      if (m) return { type: 'item', questionId: m[1], url };

      m = url.match(/stackoverflow\.com\/questions\/tagged\/([^/?#]+)/);
      if (m) return { type: 'listing', tag: m[1], url };

      return null;
    },

    async scrapeItem(ctx, opts, onProgress) {
      onProgress?.({ phase: 'init', label: 'Fetching SO question…' });

      // withbody filter includes body in response
      const qRes = await fetch(`https://api.stackexchange.com/2.3/questions/${ctx.questionId}?site=stackoverflow&filter=withbody`);
      if (!qRes.ok) throw new Error(`Stack Exchange ${qRes.status}`);
      const qJson = await qRes.json();
      const q = qJson.items?.[0];
      if (!q) throw new Error('Question not found');

      onProgress?.({ phase: 'init', label: 'Fetching answers and comments…' });

      // Fetch answers + comments in parallel
      const [aJson, qcJson] = await Promise.all([
        fetch(`https://api.stackexchange.com/2.3/questions/${ctx.questionId}/answers?site=stackoverflow&filter=withbody&sort=votes&order=desc&pagesize=100`).then(r => r.json()),
        fetch(`https://api.stackexchange.com/2.3/questions/${ctx.questionId}/comments?site=stackoverflow&filter=withbody&pagesize=100`).then(r => r.json()),
      ]);

      const answers = aJson.items || [];
      const questionComments = qcJson.items || [];

      // Fetch comments for each answer (parallel, capped)
      onProgress?.({ phase: 'init', label: `Fetching comments for ${answers.length} answers…` });
      const answerCommentsMap = new Map();
      const ansIds = answers.map(a => a.answer_id).join(';');
      if (ansIds) {
        try {
          const acRes = await fetch(`https://api.stackexchange.com/2.3/answers/${ansIds}/comments?site=stackoverflow&filter=withbody&pagesize=100`);
          const acJson = await acRes.json();
          for (const c of acJson.items || []) {
            if (!answerCommentsMap.has(c.post_id)) answerCommentsMap.set(c.post_id, []);
            answerCommentsMap.get(c.post_id).push(c);
          }
        } catch (e) { /* ignore comment fetch errors */ }
      }

      const data = convertSOQuestion(q, answers, questionComments, answerCommentsMap, ctx.url);
      finalizeFlags(data);
      return { data, stats: computeGenericStats(data) };
    },

    async scrapeListing(ctx, opts, onProgress) {
      const {
        threadLimit  = 25,
        commentLimit = 100,
        sort         = 'activity',
        throttleMs   = 250,
      } = opts || {};

      onProgress?.({ phase: 'listing', label: `Fetching SO questions tagged "${ctx.tag}"…` });

      const res = await fetch(`https://api.stackexchange.com/2.3/questions?site=stackoverflow&tagged=${encodeURIComponent(ctx.tag)}&sort=${sort}&order=desc&pagesize=${Math.min(100, threadLimit)}&filter=!T1U(3mfYIDimhP2TI9`);
      if (!res.ok) throw new Error(`Stack Exchange ${res.status}`);
      const json = await res.json();
      const questions = (json.items || []).slice(0, threadLimit);

      if (!questions.length) throw new Error(`No questions found for tag "${ctx.tag}"`);

      onProgress?.({ phase: 'bulk_start', label: `Fetching ${questions.length} questions with answers…`, current: 0, total: questions.length });

      const threads = [];
      const errors = [];

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        onProgress?.({
          phase:   'bulk_thread',
          label:   `[${i + 1}/${questions.length}] ${(q.title || '').slice(0, 50)}…`,
          current: i,
          total:   questions.length,
        });

        try {
          const [aJson, qcJson] = await Promise.all([
            fetch(`https://api.stackexchange.com/2.3/questions/${q.question_id}/answers?site=stackoverflow&filter=withbody&sort=votes&order=desc&pagesize=${Math.min(commentLimit, 100)}`).then(r => r.json()),
            fetch(`https://api.stackexchange.com/2.3/questions/${q.question_id}/comments?site=stackoverflow&filter=withbody&pagesize=50`).then(r => r.json()),
          ]);

          const threadData = convertSOQuestion(q, aJson.items || [], qcJson.items || [], new Map(), `https://stackoverflow.com/questions/${q.question_id}`);
          finalizeFlags(threadData);
          threads.push(threadData);
        } catch (e) {
          errors.push({ id: q.question_id, title: q.title, error: e.message });
        }

        if (i < questions.length - 1) await sleep(throttleMs);
      }

      onProgress?.({ phase: 'bulk_done', label: `Done. ${threads.length} questions captured.`, current: questions.length, total: questions.length });

      return {
        data: {
          type:       'bulk',
          source:     'stackoverflow',
          subreddit:  ctx.tag,
          sort,
          timeFilter: null,
          scraped_at: new Date().toISOString(),
          source_url: `https://stackoverflow.com/questions/tagged/${ctx.tag}`,
          threads,
          errors,
        },
        stats: computeBulkStats(threads),
      };
    },
  };

  function convertSOQuestion(q, answers, questionComments, answerCommentsMap, url) {
    // Top-level comments = question comments + each answer (treated as a top comment)
    const qCommentNodes = questionComments.map(c => ({
      id:        String(c.comment_id),
      name:      `t1_qc_${c.comment_id}`,
      parent_id: `t3_${q.question_id}`,
      author:    c.owner?.display_name || '[deleted]',
      text:      stripHtml(c.body || ''),
      upvotes:   c.score || 0,
      score:     c.score || 0,
      timestamp: c.creation_date ? new Date(c.creation_date * 1000).toISOString() : '',
      depth:     0,
      permalink: `https://stackoverflow.com/questions/${q.question_id}/#comment${c.comment_id}`,
      is_op:     c.owner?.user_id === q.owner?.user_id,
      replies:   [],
    }));

    const answerNodes = (answers || []).map(a => {
      const comments = (answerCommentsMap.get(a.answer_id) || []).map(c => ({
        id:        String(c.comment_id),
        name:      `t1_ac_${c.comment_id}`,
        parent_id: `t1_a_${a.answer_id}`,
        author:    c.owner?.display_name || '[deleted]',
        text:      stripHtml(c.body || ''),
        upvotes:   c.score || 0,
        score:     c.score || 0,
        timestamp: c.creation_date ? new Date(c.creation_date * 1000).toISOString() : '',
        depth:     1,
        permalink: `https://stackoverflow.com/a/${a.answer_id}/#comment${c.comment_id}`,
        is_op:     c.owner?.user_id === q.owner?.user_id,
        replies:   [],
      }));

      const isOP = a.owner?.user_id === q.owner?.user_id;
      return {
        id:        String(a.answer_id),
        name:      `t1_a_${a.answer_id}`,
        parent_id: `t3_${q.question_id}`,
        author:    a.owner?.display_name || '[deleted]',
        text:      (a.is_accepted ? '✓ ACCEPTED ANSWER\n\n' : '') + stripHtml(a.body || ''),
        upvotes:   a.score || 0,
        score:     a.score || 0,
        timestamp: a.creation_date ? new Date(a.creation_date * 1000).toISOString() : '',
        depth:     0,
        permalink: `https://stackoverflow.com/a/${a.answer_id}`,
        is_op:     isOP,
        replies:   comments,
      };
    });

    return {
      source:      'stackoverflow',
      id:          String(q.question_id),
      name:        `so_${q.question_id}`,
      title:       q.title || '(untitled)',
      content:     stripHtml(q.body || ''),
      author:      q.owner?.display_name || '[deleted]',
      upvotes:     q.score || 0,
      score:       q.score || 0,
      num_comments: (q.answer_count || 0) + questionComments.length,
      total_comments_extracted: answerNodes.length + qCommentNodes.length + answerNodes.reduce((s, a) => s + a.replies.length, 0),
      subreddit:   (q.tags || []).join(','),
      permalink:   `https://stackoverflow.com/questions/${q.question_id}`,
      created_utc: q.creation_date || null,
      url:         url || `https://stackoverflow.com/questions/${q.question_id}`,
      flair:       q.is_answered ? 'answered' : 'unanswered',
      scraped_at:  new Date().toISOString(),
      comments:    [...qCommentNodes, ...answerNodes],
    };
  }

  // ── GITHUB ISSUES ───────────────────────────────────────────────────
  UR.sources.github = {
    id:   'github',
    name: 'GitHub',
    color: '#6e7681',

    detect(url) {
      if (!url) return null;

      // Single issue or PR
      let m = url.match(/github\.com\/([^/]+)\/([^/]+)\/(issues|pull)\/(\d+)/);
      if (m) return { type: 'item', owner: m[1], repo: m[2], kind: m[3], number: m[4], url };

      // Issues list
      m = url.match(/github\.com\/([^/]+)\/([^/]+)\/issues\/?(?:\?|$)/);
      if (m) return { type: 'listing', owner: m[1], repo: m[2], url };

      return null;
    },

    async scrapeItem(ctx, opts, onProgress) {
      onProgress?.({ phase: 'init', label: `Fetching GitHub ${ctx.kind === 'pull' ? 'PR' : 'issue'} #${ctx.number}…` });

      const issueUrl = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.number}`;
      const commentsUrl = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/issues/${ctx.number}/comments?per_page=100`;

      const [iRes, cRes] = await Promise.all([
        fetch(issueUrl, { headers: { 'Accept': 'application/vnd.github+json' } }),
        fetch(commentsUrl, { headers: { 'Accept': 'application/vnd.github+json' } }),
      ]);

      if (!iRes.ok) throw new Error(`GitHub API ${iRes.status} — ${iRes.status === 403 ? 'rate limit (60/hr unauth)' : ''}`);
      const issue = await iRes.json();
      const comments = cRes.ok ? await cRes.json() : [];

      const data = convertGHIssue(issue, comments, ctx, ctx.url);
      finalizeFlags(data);
      return { data, stats: computeGenericStats(data) };
    },

    async scrapeListing(ctx, opts, onProgress) {
      const {
        threadLimit = 25,
        state       = 'open',
        sort        = 'updated',
        throttleMs  = 300,
      } = opts || {};

      onProgress?.({ phase: 'listing', label: `Fetching ${ctx.owner}/${ctx.repo} issues (${state}, ${sort})…` });

      const listUrl = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/issues?state=${state}&sort=${sort}&direction=desc&per_page=${Math.min(100, threadLimit)}`;
      const listRes = await fetch(listUrl, { headers: { 'Accept': 'application/vnd.github+json' } });
      if (!listRes.ok) throw new Error(`GitHub API ${listRes.status}`);
      const allIssues = await listRes.json();

      // GitHub /issues includes PRs — filter to issues only
      const issuesOnly = allIssues.filter(i => !i.pull_request).slice(0, threadLimit);
      if (!issuesOnly.length) throw new Error(`No ${state} issues found in ${ctx.owner}/${ctx.repo}`);

      onProgress?.({ phase: 'bulk_start', label: `Fetching ${issuesOnly.length} issues with comments…`, current: 0, total: issuesOnly.length });

      const threads = [];
      const errors = [];

      for (let i = 0; i < issuesOnly.length; i++) {
        const issue = issuesOnly[i];
        onProgress?.({
          phase:   'bulk_thread',
          label:   `[${i + 1}/${issuesOnly.length}] #${issue.number} ${(issue.title || '').slice(0, 50)}…`,
          current: i,
          total:   issuesOnly.length,
        });

        try {
          const commentsUrl = `https://api.github.com/repos/${ctx.owner}/${ctx.repo}/issues/${issue.number}/comments?per_page=100`;
          const cRes = await fetch(commentsUrl, { headers: { 'Accept': 'application/vnd.github+json' } });
          const comments = cRes.ok ? await cRes.json() : [];

          const threadData = convertGHIssue(issue, comments, ctx, issue.html_url);
          finalizeFlags(threadData);
          threads.push(threadData);
        } catch (e) {
          errors.push({ id: issue.number, title: issue.title, error: e.message });
        }

        if (i < issuesOnly.length - 1) await sleep(throttleMs);
      }

      onProgress?.({ phase: 'bulk_done', label: `Done. ${threads.length} issues captured.`, current: issuesOnly.length, total: issuesOnly.length });

      return {
        data: {
          type:       'bulk',
          source:     'github',
          subreddit:  `${ctx.owner}/${ctx.repo}`,
          sort,
          timeFilter: state,
          scraped_at: new Date().toISOString(),
          source_url: `https://github.com/${ctx.owner}/${ctx.repo}/issues`,
          threads,
          errors,
        },
        stats: computeBulkStats(threads),
      };
    },
  };

  function convertGHIssue(issue, comments, ctx, url) {
    const reactions = issue.reactions || {};
    const reactionScore = (reactions['+1'] || 0) + (reactions.heart || 0) + (reactions.rocket || 0) + (reactions.hooray || 0) - (reactions['-1'] || 0);

    const commentNodes = (comments || []).map(c => {
      const cr = c.reactions || {};
      const crScore = (cr['+1'] || 0) + (cr.heart || 0) + (cr.rocket || 0) - (cr['-1'] || 0);
      return {
        id:        String(c.id),
        name:      `t1_gh_${c.id}`,
        parent_id: `t3_gh_${issue.id}`,
        author:    c.user?.login || '[deleted]',
        text:      c.body || '',
        upvotes:   crScore,
        score:     crScore,
        timestamp: c.created_at || '',
        depth:     0,
        permalink: c.html_url || url,
        is_op:     c.user?.login === issue.user?.login,
        replies:   [],
      };
    });

    const labels = (issue.labels || []).map(l => l.name).join(', ');

    return {
      source:      'github',
      id:          String(issue.id),
      name:        `gh_${issue.id}`,
      title:       issue.title || '(untitled)',
      content:     (issue.body || '').trim() || '(no description)',
      author:      issue.user?.login || '[deleted]',
      upvotes:     reactionScore,
      score:       reactionScore,
      num_comments: (issue.comments || 0),
      total_comments_extracted: commentNodes.length,
      subreddit:   `${ctx.owner}/${ctx.repo}`,
      permalink:   issue.html_url || url,
      created_utc: issue.created_at ? Math.floor(new Date(issue.created_at).getTime() / 1000) : null,
      url:         url || issue.html_url,
      flair:       [issue.state, labels].filter(Boolean).join(' · '),
      scraped_at:  new Date().toISOString(),
      comments:    commentNodes,
    };
  }

  // ── GENERIC HELPERS SHARED BY ADAPTERS ──────────────────────────────
  function stripHtml(html) {
    if (!html) return '';
    // Simple DOM strip — decodes entities + removes tags
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || tmp.innerText || '').replace(/\s+/g, ' ').trim();
  }

  function finalizeFlags(data) {
    const walk = (nodes) => {
      for (const c of nodes) {
        c.flags = UR.classify(c.text);
        if (c.replies?.length) walk(c.replies);
      }
    };
    walk(data.comments || []);
  }

  function computeGenericStats(data) {
    let comments = 0, replies = 0, words = 0;
    const insights = { pain: 0, request: 0, praise: 0 };
    const authorCounts = {};
    const walk = (nodes, depth) => {
      for (const c of nodes) {
        if (depth === 0) comments++; else replies++;
        words += (c.text || '').split(/\s+/).filter(Boolean).length;
        if (c.flags?.includes('pain_point'))      insights.pain++;
        if (c.flags?.includes('feature_request')) insights.request++;
        if (c.flags?.includes('positive'))        insights.praise++;
        if (c.author && c.author !== '[deleted]') authorCounts[c.author] = (authorCounts[c.author] || 0) + 1;
        if (c.replies?.length) walk(c.replies, depth + 1);
      }
    };
    walk(data.comments || [], 0);

    return {
      comments, replies, words, insights,
      top_authors: Object.entries(authorCounts)
        .map(([author, count]) => ({ author, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 10),
    };
  }

  function computeBulkStats(threads) {
    let comments = 0, replies = 0, words = 0;
    const insights = { pain: 0, request: 0, praise: 0 };
    const authorCounts = {};
    for (const t of threads) {
      const s = computeGenericStats(t);
      comments += s.comments;
      replies  += s.replies;
      words    += s.words;
      insights.pain    += s.insights.pain;
      insights.request += s.insights.request;
      insights.praise  += s.insights.praise;
      for (const { author, count } of s.top_authors) authorCounts[author] = (authorCounts[author] || 0) + count;
    }
    return {
      threads: threads.length, comments, replies, words, insights,
      top_authors: Object.entries(authorCounts)
        .map(([author, count]) => ({ author, count }))
        .sort((a, b) => b.count - a.count)
        .slice(0, 15),
    };
  }

  /**
   * Unified detector — given a URL, returns { source: 'reddit'|'hn'|..., ...ctx } or null.
   * Reddit is handled via content script; this returns source metadata only.
   */
  UR.detectSource = function (url, tab) {
    if (!url) return null;

    // Reddit thread
    const tm = url.match(/reddit\.com\/r\/([^/]+)\/comments\/([^/?#]+)/);
    if (tm) return { source: 'reddit', type: 'item', subreddit: tm[1], threadId: tm[2], url, tab };

    // Reddit sub listing
    const sm = url.match(/reddit\.com\/r\/([^/?#]+)(?:\/(hot|top|new|rising|controversial|best))?\/?(?:\?|#|$)/);
    if (sm) {
      const tMatch = url.match(/[?&]t=([^&#]+)/);
      return {
        source: 'reddit', type: 'listing',
        subreddit: sm[1], sort: sm[2] || 'hot',
        timeFilter: tMatch ? tMatch[1] : 'week',
        url, tab,
      };
    }

    for (const [key, adapter] of Object.entries(UR.sources)) {
      const ctx = adapter.detect(url);
      if (ctx) return { source: key, ...ctx, tab };
    }

    return null;
  };

  // Expose
  window.UR = UR;
})();
