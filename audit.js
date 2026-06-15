#!/usr/bin/env node
/**
 * BRG Site Audit Script
 *
 * Crawls a target URL and produces a structured Markdown audit report covering
 * broken links, missing assets, SEO health, content quality, and performance
 * signals. See README.md and .claude/agents/site-audit.md for usage notes.
 *
 *   node audit.js https://bowierg.com/
 *   node audit.js https://bowierg.com/ --max-depth=2 --max-pages=50 --out=report.md
 *
 * Requires Node 18+ (uses global fetch).
 */

const fs = require('fs');
const path = require('path');

// ============ CONFIG ============

const DEFAULTS = {
  max_depth: 3,
  max_pages: 100,
  check_external_links: true,
  image_size_limit_kb: 500,
  page_weight_limit_mb: 3,
  min_word_count: 100,
  respect_robots_txt: true,
  out: 'audit-report.md',
  concurrency: 6,
  request_timeout_ms: 15000,
  user_agent: 'BRG-Site-Audit/1.0 (+https://bowierg.com)',
};

const PLACEHOLDER_PATTERNS = [
  /lorem ipsum/i,
  /\bcoming soon\b/i,
  /\bTBD\b/,
  /\binsert (here|text|copy|content)\b/i,
  /\bplaceholder\b/i,
];

const GENERIC_ALT = new Set(['image', 'photo', 'img', 'picture', 'graphic', 'icon']);

// ============ ARG PARSING ============

function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = { ...DEFAULTS };
  let target = null;
  for (const arg of args) {
    if (arg.startsWith('--')) {
      const [rawKey, rawVal] = arg.slice(2).split('=');
      const key = rawKey.replace(/-/g, '_');
      const val = rawVal === undefined ? 'true' : rawVal;
      if (val === 'true') opts[key] = true;
      else if (val === 'false') opts[key] = false;
      else if (/^\d+(\.\d+)?$/.test(val)) opts[key] = Number(val);
      else opts[key] = val;
    } else if (!target) {
      target = arg;
    }
  }
  if (!target) {
    console.error('Usage: node audit.js <url> [--max-depth=N] [--max-pages=N] ...');
    process.exit(1);
  }
  // Normalize target URL (ensure trailing slash if it's the bare origin).
  try {
    const u = new URL(target);
    opts.target = u.toString();
    opts.origin = u.origin;
  } catch {
    console.error(`Invalid URL: ${target}`);
    process.exit(1);
  }
  return opts;
}

// ============ HTTP HELPERS ============

async function fetchWithTimeout(url, init, timeoutMs) {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
  } finally {
    clearTimeout(id);
  }
}

// Follow redirects manually so we can count the chain length.
async function fetchFollow(url, { method = 'GET', headers = {}, timeoutMs }) {
  let current = url;
  const chain = [];
  for (let i = 0; i < 6; i++) {
    let res;
    try {
      res = await fetchWithTimeout(current, { method, headers }, timeoutMs);
    } catch (err) {
      return { ok: false, error: err.message, chain, finalUrl: current, status: 0 };
    }
    chain.push({ url: current, status: res.status });
    if (res.status >= 300 && res.status < 400 && res.headers.get('location')) {
      const next = new URL(res.headers.get('location'), current).toString();
      current = next;
      continue;
    }
    return {
      ok: res.ok,
      status: res.status,
      finalUrl: current,
      chain,
      headers: res.headers,
      body: res,
    };
  }
  return { ok: false, status: 0, finalUrl: current, chain, error: 'too many redirects' };
}

// Simple concurrency limiter.
async function runWithConcurrency(items, worker, concurrency) {
  const results = new Array(items.length);
  let idx = 0;
  async function next() {
    while (true) {
      const i = idx++;
      if (i >= items.length) return;
      results[i] = await worker(items[i], i);
    }
  }
  await Promise.all(Array.from({ length: concurrency }, next));
  return results;
}

// ============ URL UTILITIES ============

function normalizeUrl(href, base) {
  try {
    const u = new URL(href, base);
    u.hash = '';
    // Strip trailing slash from path for dedupe consistency (except root).
    if (u.pathname.length > 1 && u.pathname.endsWith('/')) {
      u.pathname = u.pathname.replace(/\/+$/, '');
    }
    return u.toString();
  } catch {
    return null;
  }
}

function isInternal(url, origin) {
  try {
    return new URL(url).origin === origin;
  } catch {
    return false;
  }
}

function isBinaryAsset(url) {
  return /\.(pdf|zip|tar|gz|dmg|exe|mp4|mp3|wav|mov|woff2?|ttf|otf|eot)(\?|$)/i.test(url);
}

// ============ HTML PARSING (regex-based) ============

// We intentionally avoid a heavy DOM dependency. These extractors are good
// enough for the spec's structural checks; they're not a full HTML parser.

function stripComments(html) {
  return html.replace(/<!--[\s\S]*?-->/g, '');
}

function getAttr(tag, name) {
  const re = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i');
  const m = tag.match(re);
  if (!m) return null;
  return m[2] ?? m[3] ?? m[4] ?? '';
}

function extractTagsByName(html, name) {
  const re = new RegExp(`<${name}\\b[^>]*>`, 'gi');
  return html.match(re) || [];
}

function extractBlocks(html, name) {
  // Returns [{ openTag, inner }] for paired tags. Tolerates nested same-name
  // tags only at one level (sufficient for h1/h2/title/script).
  const re = new RegExp(`<${name}\\b([^>]*)>([\\s\\S]*?)<\\/${name}>`, 'gi');
  const out = [];
  let m;
  while ((m = re.exec(html)) !== null) {
    out.push({ openTag: `<${name}${m[1]}>`, inner: m[2] });
  }
  return out;
}

function textOf(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function visibleBodyText(html) {
  const body = html.match(/<body\b[^>]*>([\s\S]*?)<\/body>/i);
  const inner = body ? body[1] : html;
  // Drop nav, footer, header to focus on content.
  const trimmed = inner
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, ' ')
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, ' ')
    .replace(/<header\b[\s\S]*?<\/header>/gi, ' ');
  return textOf(trimmed);
}

function parsePage(html, pageUrl) {
  const clean = stripComments(html);
  const head = (clean.match(/<head\b[^>]*>([\s\S]*?)<\/head>/i) || [, ''])[1];
  const titleBlock = extractBlocks(clean, 'title')[0];
  const title = titleBlock ? textOf(titleBlock.inner) : '';

  const metas = extractTagsByName(clean, 'meta');
  let metaDescription = null;
  const og = {};
  for (const m of metas) {
    const name = (getAttr(m, 'name') || '').toLowerCase();
    const prop = (getAttr(m, 'property') || '').toLowerCase();
    const content = getAttr(m, 'content') || '';
    if (name === 'description') metaDescription = content;
    if (prop.startsWith('og:')) og[prop] = content;
  }

  // Canonical
  const linkTags = extractTagsByName(clean, 'link');
  let canonical = null;
  const stylesheets = [];
  for (const lt of linkTags) {
    const rel = (getAttr(lt, 'rel') || '').toLowerCase();
    const href = getAttr(lt, 'href');
    if (rel === 'canonical' && href) canonical = href;
    if (rel === 'stylesheet' && href) stylesheets.push(href);
  }

  // Headings
  const headings = [];
  for (let level = 1; level <= 6; level++) {
    const blocks = extractBlocks(clean, `h${level}`);
    for (const b of blocks) headings.push({ level, text: textOf(b.inner) });
  }

  // Images
  const imgTags = extractTagsByName(clean, 'img');
  const images = imgTags.map((tag) => ({
    src: getAttr(tag, 'src'),
    alt: getAttr(tag, 'alt'),
    width: getAttr(tag, 'width'),
    height: getAttr(tag, 'height'),
    loading: getAttr(tag, 'loading'),
  }));

  // Scripts
  const scriptOpenTags = extractTagsByName(clean, 'script');
  const scriptBlocks = extractBlocks(clean, 'script');
  const scripts = scriptOpenTags.map((tag, i) => ({
    src: getAttr(tag, 'src'),
    async: /\basync\b/i.test(tag),
    defer: /\bdefer\b/i.test(tag),
    type: getAttr(tag, 'type'),
    inHead: head.includes(tag),
    inline: !getAttr(tag, 'src'),
    body: scriptBlocks[i]?.inner ?? '',
  }));

  // Anchors
  const anchorTags = extractTagsByName(clean, 'a');
  const anchors = anchorTags
    .map((tag) => ({ href: getAttr(tag, 'href') }))
    .filter((a) => a.href);

  // Set of element IDs (for verifying in-page anchors)
  const ids = new Set();
  const idRe = /\bid\s*=\s*("([^"]*)"|'([^']*)'|([^\s>]+))/gi;
  let m;
  while ((m = idRe.exec(clean)) !== null) {
    ids.add(m[2] ?? m[3] ?? m[4]);
  }

  return {
    url: pageUrl,
    title,
    metaDescription,
    canonical,
    og,
    headings,
    images,
    stylesheets,
    scripts,
    anchors,
    ids,
    bodyText: visibleBodyText(clean),
    raw: clean,
  };
}

// ============ ROBOTS.TXT ============

async function loadRobots(origin, opts) {
  if (!opts.respect_robots_txt) return { disallowed: [] };
  const url = origin.replace(/\/$/, '') + '/robots.txt';
  try {
    const res = await fetchWithTimeout(
      url,
      { headers: { 'User-Agent': opts.user_agent } },
      opts.request_timeout_ms,
    );
    if (!res.ok) return { disallowed: [] };
    const text = await res.text();
    return parseRobots(text);
  } catch {
    return { disallowed: [] };
  }
}

function parseRobots(text) {
  const disallowed = [];
  let applies = false;
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    if (!line) continue;
    const [field, ...rest] = line.split(':');
    const value = rest.join(':').trim();
    const f = field.trim().toLowerCase();
    if (f === 'user-agent') {
      applies = value === '*' || value.toLowerCase().includes('brg-site-audit');
    } else if (f === 'disallow' && applies && value) {
      disallowed.push(value);
    }
  }
  return { disallowed };
}

function isDisallowed(urlPath, robots) {
  return robots.disallowed.some((rule) => rule && urlPath.startsWith(rule));
}

// ============ CRAWLER ============

async function crawl(opts, robots) {
  const start = normalizeUrl(opts.target, opts.target);
  const queue = [{ url: start, depth: 0 }];
  const pages = new Map(); // url -> parsed page
  const linkSources = new Map(); // url -> Set(parents)
  const externalLinks = new Set();
  const visited = new Set();

  while (queue.length && pages.size < opts.max_pages) {
    const { url, depth } = queue.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    const pathOnly = new URL(url).pathname;
    if (isDisallowed(pathOnly, robots)) {
      continue;
    }

    if (isBinaryAsset(url)) {
      // Note the binary file (linked from somewhere) but don't crawl.
      continue;
    }

    let res;
    try {
      res = await fetchFollow(url, {
        method: 'GET',
        headers: { 'User-Agent': opts.user_agent, Accept: 'text/html,*/*' },
        timeoutMs: opts.request_timeout_ms,
      });
    } catch (err) {
      pages.set(url, { url, fetchError: err.message, status: 0 });
      continue;
    }

    const ct = res.headers?.get?.('content-type') || '';
    if (!res.ok || !ct.includes('text/html')) {
      pages.set(url, {
        url,
        status: res.status,
        finalUrl: res.finalUrl,
        chain: res.chain,
        contentType: ct,
        notHtml: !ct.includes('text/html'),
      });
      continue;
    }

    const html = await res.body.text();
    const parsed = parsePage(html, url);
    parsed.status = res.status;
    parsed.finalUrl = res.finalUrl;
    parsed.chain = res.chain;
    parsed.contentLength = Buffer.byteLength(html, 'utf8');
    pages.set(url, parsed);

    // Queue internal links.
    for (const a of parsed.anchors) {
      if (!a.href) continue;
      if (a.href.startsWith('mailto:') || a.href.startsWith('tel:') || a.href.startsWith('javascript:')) continue;
      const abs = normalizeUrl(a.href, url);
      if (!abs) continue;
      if (isInternal(abs, opts.origin)) {
        if (!linkSources.has(abs)) linkSources.set(abs, new Set());
        linkSources.get(abs).add(url);
        if (!visited.has(abs) && depth + 1 <= opts.max_depth && !isBinaryAsset(abs)) {
          queue.push({ url: abs, depth: depth + 1 });
        }
      } else {
        externalLinks.add(abs);
      }
    }
  }

  return { pages, linkSources, externalLinks };
}

// ============ ASSET + LINK CHECKS ============

async function checkUrls(urls, opts, { method = 'HEAD' } = {}) {
  const list = Array.from(urls);
  const out = new Map();
  await runWithConcurrency(
    list,
    async (url) => {
      try {
        let res = await fetchFollow(url, {
          method,
          headers: { 'User-Agent': opts.user_agent },
          timeoutMs: opts.request_timeout_ms,
        });
        // Some servers don't support HEAD — fall back to GET.
        if (method === 'HEAD' && (res.status === 405 || res.status === 501)) {
          res = await fetchFollow(url, {
            method: 'GET',
            headers: { 'User-Agent': opts.user_agent },
            timeoutMs: opts.request_timeout_ms,
          });
        }
        out.set(url, {
          status: res.status,
          ok: res.ok,
          chain: res.chain,
          finalUrl: res.finalUrl,
          contentLength: Number(res.headers?.get?.('content-length')) || null,
          contentType: res.headers?.get?.('content-type') || '',
          error: res.error,
        });
      } catch (err) {
        out.set(url, { status: 0, ok: false, error: err.message });
      }
    },
    opts.concurrency,
  );
  return out;
}

// ============ PER-PAGE AUDITS ============

const SEV = { BLOCK: 'blocking', WARN: 'warning', SUGGEST: 'suggestion' };

function issue(severity, category, message, detail) {
  return { severity, category, message, detail };
}

function auditPage(page, ctx) {
  const issues = [];
  if (!page || page.fetchError) {
    return [issue(SEV.BLOCK, 'http', `Page fetch failed: ${page?.fetchError || 'unknown error'}`, page?.url)];
  }
  if (page.status >= 400) {
    issues.push(issue(SEV.BLOCK, 'http', `Page returned HTTP ${page.status}`));
    return issues;
  }
  if (page.notHtml || page.title === undefined) {
    return issues;
  }
  if (page.chain && page.chain.length > 3) {
    issues.push(issue(SEV.SUGGEST, 'redirect', `Redirect chain of ${page.chain.length} hops`, page.chain.map((h) => `${h.status} ${h.url}`).join(' → ')));
  }

  // ---- SEO: title
  if (!page.title) {
    issues.push(issue(SEV.BLOCK, 'seo', 'Missing <title> tag'));
  } else if (page.title.length > 60) {
    issues.push(issue(SEV.WARN, 'seo', `Title is ${page.title.length} chars (>60)`, page.title));
  }

  // ---- SEO: meta description
  if (page.metaDescription == null) {
    issues.push(issue(SEV.WARN, 'seo', 'Missing meta description'));
  } else {
    const len = page.metaDescription.length;
    if (len < 120 || len > 160) {
      issues.push(issue(SEV.SUGGEST, 'seo', `Meta description ${len} chars (recommended 120–160)`));
    }
  }

  // ---- SEO: H1
  const h1s = page.headings.filter((h) => h.level === 1);
  if (h1s.length === 0) {
    issues.push(issue(SEV.WARN, 'seo', 'No H1 on page'));
  } else if (h1s.length > 1) {
    issues.push(issue(SEV.WARN, 'seo', `${h1s.length} H1 tags on page`, h1s.map((h) => h.text).join(' | ')));
  } else if (!h1s[0].text.trim()) {
    issues.push(issue(SEV.WARN, 'seo', 'Empty H1 tag'));
  }

  // ---- SEO: heading hierarchy (no skipped levels)
  let prev = 0;
  for (const h of page.headings) {
    if (prev && h.level > prev + 1) {
      issues.push(issue(SEV.SUGGEST, 'seo', `Heading hierarchy skips from H${prev} to H${h.level}`, h.text));
    }
    prev = h.level;
  }

  // ---- SEO: image alt text
  for (const img of page.images) {
    if (img.alt == null) {
      issues.push(issue(SEV.SUGGEST, 'a11y', `Image missing alt attribute`, img.src));
    } else if (GENERIC_ALT.has(img.alt.trim().toLowerCase())) {
      issues.push(issue(SEV.SUGGEST, 'a11y', `Generic alt text "${img.alt}"`, img.src));
    }
    if (!img.width || !img.height) {
      issues.push(issue(SEV.SUGGEST, 'performance', `Image missing width/height (causes layout shift)`, img.src));
    }
  }

  // ---- SEO: canonical
  if (!page.canonical) {
    issues.push(issue(SEV.SUGGEST, 'seo', 'Missing canonical tag'));
  }

  // ---- SEO: Open Graph
  for (const tag of ['og:title', 'og:description', 'og:image']) {
    if (!page.og[tag]) {
      issues.push(issue(SEV.SUGGEST, 'seo', `Missing Open Graph tag ${tag}`));
    }
  }

  // ---- Title vs H1 mismatch (exact text comparison; AI agent can refine)
  if (page.title && h1s[0]?.text) {
    const t = page.title.toLowerCase();
    const h = h1s[0].text.toLowerCase();
    if (!t.includes(h) && !h.includes(t)) {
      issues.push(issue(SEV.SUGGEST, 'content', 'Title and H1 do not overlap', `title="${page.title}" h1="${h1s[0].text}"`));
    }
  }

  // ---- Content: thin pages
  const words = page.bodyText.split(/\s+/).filter(Boolean);
  if (words.length < ctx.opts.min_word_count) {
    issues.push(issue(SEV.SUGGEST, 'content', `Thin content: ${words.length} words (<${ctx.opts.min_word_count})`));
  }

  // ---- Content: placeholder text
  for (const pat of PLACEHOLDER_PATTERNS) {
    if (pat.test(page.bodyText)) {
      issues.push(issue(SEV.WARN, 'content', `Placeholder text detected (${pat})`));
    }
  }

  // ---- Performance: render-blocking scripts in head
  for (const s of page.scripts) {
    if (s.inHead && s.src && !s.async && !s.defer && s.type !== 'module') {
      issues.push(issue(SEV.SUGGEST, 'performance', 'Render-blocking script in <head>', s.src));
    }
  }

  // ---- Inline handlers referencing undefined functions.
  // Skip when any external scripts are on the page: we can't know what they
  // declare without fetching+parsing them, and a false positive is worse than
  // a missed one.
  const hasExternalScripts = page.scripts.some((s) => s.src);
  if (!hasExternalScripts) {
    const definedNames = new Set(['document', 'window', 'console', 'event', 'this']);
    for (const s of page.scripts) {
      if (!s.inline) continue;
      const declRe = /\b(?:function|const|let|var)\s+([A-Za-z_$][\w$]*)/g;
      let dm;
      while ((dm = declRe.exec(s.body)) !== null) definedNames.add(dm[1]);
    }
    const handlerRe = /\bon[a-z]+\s*=\s*("([^"]*)"|'([^']*)')/gi;
    let oh;
    while ((oh = handlerRe.exec(page.raw)) !== null) {
      const handler = oh[2] ?? oh[3];
      // Match callee names not preceded by `.` (i.e. free function calls).
      const callRe = /(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
      let cm;
      while ((cm = callRe.exec(handler)) !== null) {
        const fn = cm[2];
        if (definedNames.has(fn)) continue;
        issues.push(issue(SEV.SUGGEST, 'runtime', `Inline handler calls undefined function "${fn}"`, handler));
      }
    }
  }

  return issues;
}

// ============ CROSS-PAGE CHECKS ============

function crossPageAudit(pages, linkSources) {
  const issues = []; // {url, issue}

  // Duplicate titles / descriptions across pages.
  const titleMap = new Map();
  const descMap = new Map();
  const h1Map = new Map();
  for (const [url, p] of pages) {
    if (!p || !p.title) continue;
    if (!titleMap.has(p.title)) titleMap.set(p.title, []);
    titleMap.get(p.title).push(url);
    if (p.metaDescription) {
      if (!descMap.has(p.metaDescription)) descMap.set(p.metaDescription, []);
      descMap.get(p.metaDescription).push(url);
    }
    const h1 = p.headings?.find((h) => h.level === 1)?.text;
    if (h1) {
      if (!h1Map.has(h1)) h1Map.set(h1, []);
      h1Map.get(h1).push(url);
    }
  }
  for (const [title, urls] of titleMap) {
    if (urls.length > 1) {
      for (const u of urls) {
        issues.push({ url: u, issue: issue(SEV.WARN, 'seo', `Duplicate <title> across pages`, `"${title}" also on: ${urls.filter((x) => x !== u).join(', ')}`) });
      }
    }
  }
  for (const [desc, urls] of descMap) {
    if (urls.length > 1) {
      for (const u of urls) {
        issues.push({ url: u, issue: issue(SEV.WARN, 'seo', 'Duplicate meta description across pages', `Also on: ${urls.filter((x) => x !== u).join(', ')}`) });
      }
    }
  }
  for (const [h1, urls] of h1Map) {
    if (urls.length > 1) {
      for (const u of urls) {
        issues.push({ url: u, issue: issue(SEV.WARN, 'seo', 'Duplicate H1 across pages', `"${h1}" also on: ${urls.filter((x) => x !== u).join(', ')}`) });
      }
    }
  }

  // Orphan pages: internal pages with no other page linking to them (except start page).
  let first = null;
  for (const url of pages.keys()) {
    if (first === null) first = url;
    if (url === first) continue;
    const sources = linkSources.get(url);
    if (!sources || sources.size === 0) {
      issues.push({ url, issue: issue(SEV.WARN, 'content', 'Orphaned page (no internal links point to it)') });
    }
  }

  // Canonical URL points away from the page itself.
  for (const [url, p] of pages) {
    if (!p || !p.canonical) continue;
    const abs = normalizeUrl(p.canonical, url);
    if (abs && abs !== url && !sameNormalized(abs, url)) {
      issues.push({ url, issue: issue(SEV.SUGGEST, 'seo', 'Canonical points to a different URL', `canonical=${abs}`) });
    }
  }

  return issues;
}

function sameNormalized(a, b) {
  try {
    const ua = new URL(a);
    const ub = new URL(b);
    return ua.origin === ub.origin && ua.pathname.replace(/\/$/, '') === ub.pathname.replace(/\/$/, '');
  } catch {
    return false;
  }
}

// ============ ASSET WEIGHT + LINK STATUS ============

function collectAssetUrls(pages) {
  const images = new Set();
  const styles = new Set();
  const scripts = new Set();
  for (const [url, p] of pages) {
    if (!p || !p.images) continue;
    for (const img of p.images) {
      if (img.src) {
        const abs = normalizeUrl(img.src, url);
        if (abs) images.add(abs);
      }
    }
    for (const href of p.stylesheets || []) {
      const abs = normalizeUrl(href, url);
      if (abs) styles.add(abs);
    }
    for (const s of p.scripts || []) {
      if (s.src) {
        const abs = normalizeUrl(s.src, url);
        if (abs) scripts.add(abs);
      }
    }
  }
  return { images, styles, scripts };
}

function collectInternalLinks(pages, origin) {
  const internal = new Set();
  for (const [url, p] of pages) {
    if (!p?.anchors) continue;
    for (const a of p.anchors) {
      if (!a.href) continue;
      if (a.href.startsWith('#') || a.href.startsWith('mailto:') || a.href.startsWith('tel:') || a.href.startsWith('javascript:')) continue;
      const abs = normalizeUrl(a.href, url);
      if (abs && isInternal(abs, origin)) internal.add(abs);
    }
  }
  return internal;
}

function checkAnchorLinks(pages) {
  const issues = []; // {url, issue}
  for (const [url, p] of pages) {
    if (!p?.anchors) continue;
    for (const a of p.anchors) {
      if (!a.href || !a.href.startsWith('#') || a.href === '#') continue;
      const id = a.href.slice(1);
      if (!p.ids.has(id)) {
        issues.push({ url, issue: issue(SEV.WARN, 'links', `Anchor "#${id}" has no matching element on page`) });
      }
    }
  }
  return issues;
}

// ============ REPORT ============

function severityCount(allIssues) {
  const c = { blocking: 0, warning: 0, suggestion: 0 };
  for (const i of allIssues) c[i.severity] = (c[i.severity] || 0) + 1;
  return c;
}

function formatBytes(n) {
  if (!n && n !== 0) return '?';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function pageWeight(page, assetStatuses) {
  let total = page.contentLength || 0;
  const sources = [
    ...page.images.map((i) => i.src),
    ...(page.stylesheets || []),
    ...page.scripts.filter((s) => s.src).map((s) => s.src),
  ];
  for (const ref of sources) {
    if (!ref) continue;
    const abs = normalizeUrl(ref, page.url);
    const meta = assetStatuses?.get(abs);
    if (meta?.contentLength) total += meta.contentLength;
  }
  return total;
}

function buildReport({ opts, pages, linkSources, externalLinks, assetStatuses, externalStatuses, anchorIssues, crossIssues, perPageIssues }) {
  const lines = [];
  const allIssues = [];
  for (const list of perPageIssues.values()) allIssues.push(...list);
  for (const { issue } of crossIssues) allIssues.push(issue);
  for (const { issue } of anchorIssues) allIssues.push(issue);

  const counts = severityCount(allIssues);
  const pagesWithIssues = new Set();
  for (const [url, list] of perPageIssues) if (list.length > 0) pagesWithIssues.add(url);
  for (const { url } of crossIssues) pagesWithIssues.add(url);
  for (const { url } of anchorIssues) pagesWithIssues.add(url);
  const clean = pages.size - pagesWithIssues.size;
  const healthScore = pages.size ? Math.round((clean / pages.size) * 100) : 0;

  lines.push(`# Site Audit — ${opts.target}`);
  lines.push('');
  lines.push(`*Generated ${new Date().toISOString()}*`);
  lines.push('');
  lines.push('## Summary');
  lines.push('');
  lines.push(`- **Pages crawled:** ${pages.size}`);
  lines.push(`- **Assets checked:** ${assetStatuses.size}`);
  lines.push(`- **External links checked:** ${externalStatuses.size}`);
  lines.push(`- **Issues:** ${counts.blocking} blocking · ${counts.warning} warning · ${counts.suggestion} suggestion`);
  lines.push(`- **Health score:** ${healthScore}% (${clean}/${pages.size} pages with zero issues)`);
  lines.push('');

  // ---- Blocking
  lines.push('## Blocking Issues');
  lines.push('');
  lines.push('*Must be resolved before launch or client handoff.*');
  lines.push('');
  const blocking = [];
  for (const [url, list] of perPageIssues) {
    for (const it of list.filter((x) => x.severity === SEV.BLOCK)) {
      blocking.push({ url, ...it });
    }
  }
  // Add asset failures (4xx/5xx) as blocking.
  for (const [url, meta] of assetStatuses) {
    if (!meta.ok && meta.status !== 0) {
      blocking.push({ url: '(asset)', category: 'assets', message: `Asset HTTP ${meta.status}`, detail: url });
    }
    if (meta.status === 0 && meta.error) {
      blocking.push({ url: '(asset)', category: 'assets', message: `Asset fetch error: ${meta.error}`, detail: url });
    }
  }
  // Internal link failures.
  for (const [url, meta] of externalStatuses) {
    // covered in warnings
  }
  if (blocking.length === 0) {
    lines.push('_None._');
  } else {
    for (const b of blocking) {
      lines.push(`- **[${b.category}]** ${b.message}${b.detail ? ` — ${b.detail}` : ''} ${b.url ? `(${b.url})` : ''}`);
    }
  }
  lines.push('');

  // ---- Warnings
  lines.push('## Warnings');
  lines.push('');
  lines.push('*Should be addressed; affects SEO or user experience.*');
  lines.push('');
  const warnings = [];
  for (const [url, list] of perPageIssues) {
    for (const it of list.filter((x) => x.severity === SEV.WARN)) warnings.push({ url, ...it });
  }
  for (const { url, issue } of crossIssues) if (issue.severity === SEV.WARN) warnings.push({ url, ...issue });
  for (const { url, issue } of anchorIssues) if (issue.severity === SEV.WARN) warnings.push({ url, ...issue });
  // Oversized images.
  for (const [url, meta] of assetStatuses) {
    if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url) && meta.contentLength && meta.contentLength > opts.image_size_limit_kb * 1024) {
      warnings.push({ url: '(asset)', category: 'performance', message: `Image over ${opts.image_size_limit_kb}KB`, detail: `${formatBytes(meta.contentLength)} — ${url}` });
    }
  }
  // External link failures.
  for (const [url, meta] of externalStatuses) {
    if (!meta.ok && meta.status >= 400) {
      warnings.push({ url: '(external)', category: 'links', message: `External link HTTP ${meta.status}`, detail: url });
    } else if (meta.status === 0 && meta.error) {
      warnings.push({ url: '(external)', category: 'links', message: `External link unreachable`, detail: `${url} (${meta.error})` });
    }
  }
  // Page weight over limit.
  for (const [url, p] of pages) {
    if (!p?.contentLength) continue;
    const w = pageWeight(p, assetStatuses);
    const limit = opts.page_weight_limit_mb * 1024 * 1024;
    if (w > limit) {
      warnings.push({ url, category: 'performance', message: `Page weight ${formatBytes(w)} > ${opts.page_weight_limit_mb}MB` });
    }
  }
  if (warnings.length === 0) {
    lines.push('_None._');
  } else {
    for (const w of warnings) {
      lines.push(`- **[${w.category}]** ${w.message}${w.detail ? ` — ${w.detail}` : ''} ${w.url ? `(${w.url})` : ''}`);
    }
  }
  lines.push('');

  // ---- Suggestions
  lines.push('## Suggestions');
  lines.push('');
  lines.push('*Nice to fix; polish and best practice.*');
  lines.push('');
  const suggestions = [];
  for (const [url, list] of perPageIssues) {
    for (const it of list.filter((x) => x.severity === SEV.SUGGEST)) suggestions.push({ url, ...it });
  }
  for (const { url, issue } of crossIssues) if (issue.severity === SEV.SUGGEST) suggestions.push({ url, ...issue });
  // Unminified CSS/JS over 100KB.
  for (const [url, meta] of assetStatuses) {
    if (/\.(css|js)(\?|$)/i.test(url) && !/\.min\.(css|js)(\?|$)/i.test(url) && meta.contentLength && meta.contentLength > 100 * 1024) {
      suggestions.push({ url: '(asset)', category: 'performance', message: `Likely-unminified asset >100KB`, detail: `${formatBytes(meta.contentLength)} — ${url}` });
    }
  }
  if (suggestions.length === 0) {
    lines.push('_None._');
  } else {
    for (const s of suggestions) {
      lines.push(`- **[${s.category}]** ${s.message}${s.detail ? ` — ${s.detail}` : ''} ${s.url ? `(${s.url})` : ''}`);
    }
  }
  lines.push('');

  // ---- Per-page detail
  lines.push('## Per-Page Detail');
  lines.push('');
  for (const [url, p] of pages) {
    const list = [...(perPageIssues.get(url) || [])];
    for (const { url: u, issue } of crossIssues) if (u === url) list.push(issue);
    for (const { url: u, issue } of anchorIssues) if (u === url) list.push(issue);
    const c = severityCount(list);
    const h1 = p?.headings?.find((h) => h.level === 1)?.text || '—';
    lines.push(`### ${url}`);
    lines.push('');
    lines.push(`- Status: ${p?.status ?? '—'}`);
    lines.push(`- Title: ${p?.title || '—'}`);
    lines.push(`- H1: ${h1}`);
    lines.push(`- Issues: ${c.blocking} blocking · ${c.warning} warning · ${c.suggestion} suggestion`);
    if (list.length) {
      for (const it of list) {
        lines.push(`  - [${it.severity}] **${it.category}**: ${it.message}${it.detail ? ` — ${it.detail}` : ''}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// ============ MAIN ============

async function main() {
  const opts = parseArgs(process.argv);
  console.log(`Auditing ${opts.target} (max_depth=${opts.max_depth}, max_pages=${opts.max_pages})`);

  const robots = await loadRobots(opts.origin, opts);
  if (robots.disallowed.length) {
    console.log(`robots.txt: ${robots.disallowed.length} disallow rules will be respected`);
  }

  console.log('Crawling...');
  const { pages, linkSources, externalLinks } = await crawl(opts, robots);
  console.log(`  ${pages.size} pages discovered`);

  const { images, styles, scripts } = collectAssetUrls(pages);
  const assetUrls = new Set([...images, ...styles, ...scripts]);
  console.log(`Checking ${assetUrls.size} assets...`);
  const assetStatuses = await checkUrls(assetUrls, opts);

  // Verify internal links that weren't crawled (e.g. binary or out-of-depth).
  const internalLinks = collectInternalLinks(pages, opts.origin);
  const uncrawled = new Set();
  for (const u of internalLinks) if (!pages.has(u)) uncrawled.add(u);
  console.log(`Checking ${uncrawled.size} uncrawled internal links...`);
  const uncrawledStatuses = await checkUrls(uncrawled, opts);
  for (const [url, meta] of uncrawledStatuses) assetStatuses.set(url, meta);

  let externalStatuses = new Map();
  if (opts.check_external_links) {
    console.log(`Checking ${externalLinks.size} external links...`);
    externalStatuses = await checkUrls(externalLinks, opts);
  }

  // Per-page audits.
  const perPageIssues = new Map();
  const ctx = { opts };
  for (const [url, p] of pages) {
    perPageIssues.set(url, auditPage(p, ctx));
  }
  const anchorIssues = checkAnchorLinks(pages);
  const crossIssues = crossPageAudit(pages, linkSources);

  const report = buildReport({
    opts,
    pages,
    linkSources,
    externalLinks,
    assetStatuses,
    externalStatuses,
    anchorIssues,
    crossIssues,
    perPageIssues,
  });

  const outPath = path.isAbsolute(opts.out) ? opts.out : path.join(process.cwd(), opts.out);
  fs.writeFileSync(outPath, report);
  console.log(`\nReport written to ${outPath}`);
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  parsePage,
  parseRobots,
  normalizeUrl,
  auditPage,
  crossPageAudit,
};
