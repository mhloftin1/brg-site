/**
 * BRG Site Build Script
 * 
 * Reads markdown posts from /posts, generates:
 *   1. Individual post pages at /work/{slug}.html
 *   2. Updated work.html with reverse-chron feed of all posts
 * 
 * Usage: node build.js
 * Dependencies: gray-matter, marked (install via npm)
 */

const fs = require('fs');
const path = require('path');
const matter = require('gray-matter');
const { marked } = require('marked');

// ============ CONFIG ============
const POSTS_DIR = path.join(__dirname, 'posts');
const WORK_DIR = path.join(__dirname, 'work');
const OUTPUT_WORK_HTML = path.join(__dirname, 'work.html');

// Base path for GitHub Pages subfolder hosting.
// Set to '/brg-site' for username.github.io/brg-site/
// Set to '' when using a custom domain (bowierg.com)
const BASE_PATH = '/brg-site';

// ============ TEMPLATES ============

function navHTML(activePage) {
  return `<nav id="nav">
  <div class="nav-inner">
    <a href="${BASE_PATH}/index.html" class="nav-logo">Bowie Research Group</a>
    <button class="nav-toggle" onclick="document.querySelector('.nav-links').classList.toggle('open')" aria-label="Menu">
      <span></span><span></span><span></span>
    </button>
    <ul class="nav-links">
      <li><a href="${BASE_PATH}/index.html">Home</a></li>
      <li><a href="${BASE_PATH}/work.html">Work</a></li>
      <li><a href="${BASE_PATH}/workshops.html">Workshops</a></li>
      <li><a href="${BASE_PATH}/contact.html" class="nav-cta">Talk to Us</a></li>
    </ul>
  </div>
</nav>`;
}

const footerHTML = `<footer>
  <div class="footer-brand">Bowie Research Group LLC · Amarillo, Texas</div>
  <div class="footer-tagline">Research-driven consulting for businesses with unique problems.</div>
  <div class="footer-links">
    <a href="#">LinkedIn</a>
    <a href="mailto:m.loftin@bowieRG.com">Email</a>
  </div>
</footer>`;

const scriptsHTML = `<script>
  window.addEventListener('scroll', () => {
    document.getElementById('nav').classList.toggle('scrolled', window.scrollY > 20);
  });
  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });
  document.querySelectorAll('.reveal').forEach(el => observer.observe(el));
</script>`;

function postPageHTML(post) {
  const tagSpan = post.tags.map(t => t).join(' · ');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${post.title} | Bowie Research Group</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${BASE_PATH}/styles.css">
<style>
  .post-single {
    max-width: 780px;
    margin: 0 auto;
    padding: 4rem 2rem 5rem;
  }
  .post-single .post-tag {
    font-size: 0.72rem;
    font-weight: 600;
    letter-spacing: 0.1em;
    text-transform: uppercase;
    color: var(--accent);
    margin-bottom: 0.75rem;
    display: block;
  }
  .post-single h1 {
    font-family: var(--font-display);
    font-size: clamp(1.8rem, 3.5vw, 2.4rem);
    color: var(--navy-deep);
    margin-bottom: 0.5rem;
    line-height: 1.25;
  }
  .post-single .post-date {
    font-size: 0.82rem;
    color: var(--text-muted);
    margin-bottom: 2.5rem;
    display: block;
  }
  .post-single .post-body p {
    color: var(--text-muted);
    font-size: 1rem;
    line-height: 1.8;
    margin-bottom: 1.25rem;
  }
  .post-single .post-body h2 {
    font-family: var(--font-display);
    font-size: 1.3rem;
    color: var(--navy-deep);
    margin-top: 2.5rem;
    margin-bottom: 1rem;
    padding-top: 1.5rem;
    border-top: 1px solid var(--border);
  }
  .post-back {
    display: inline-flex;
    align-items: center;
    gap: 0.4rem;
    font-size: 0.88rem;
    font-weight: 600;
    color: var(--navy);
    text-decoration: none;
    margin-top: 2rem;
    transition: gap 0.2s, color 0.2s;
  }
  .post-back:hover {
    gap: 0.65rem;
    color: var(--accent);
  }
</style>
</head>
<body>

${navHTML('work')}

<div class="page-header">
  <div class="container">
    <h1 style="font-size:clamp(1.2rem,2vw,1.6rem);opacity:0.7;"><a href="${BASE_PATH}/work.html" style="color:inherit;text-decoration:none;">← Work</a></h1>
  </div>
</div>

<article class="post-single">
  <span class="post-tag">${tagSpan}</span>
  <h1>${post.title}</h1>
  <span class="post-date">${formatDate(post.date)}</span>
  <div class="post-body">
    ${post.html}
  </div>
  <a href="${BASE_PATH}/work.html" class="post-back"><span>←</span> Back to all work</a>
</article>

${footerHTML}
${scriptsHTML}

</body>
</html>`;
}

function workFeedHTML(posts) {
  const postCards = posts.map(post => {
    const tagSpan = post.tags.map(t => t).join(' · ');
    // Use summary (first paragraph) for the feed, not full content
    return `  <article class="post reveal" id="${post.slug}">
    <span class="post-tag">${tagSpan}</span>
    <h2>"${post.title}"</h2>
    <p>${post.summary}</p>
    <a href="${BASE_PATH}/work/${post.slug}.html" class="post-read-more">Read the full case study <span>→</span></a>
  </article>`;
  }).join('\n\n');

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Work | Bowie Research Group</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:ital,wght@0,400;0,500;0,600;0,700;1,400&display=swap" rel="stylesheet">
<link rel="stylesheet" href="${BASE_PATH}/styles.css">
</head>
<body>

${navHTML('work')}

<div class="page-header">
  <div class="container">
    <h1>Work</h1>
    <p>How we think. What we've built. Lessons from the field. Case studies, practice insights, and the patterns we keep seeing across industries.</p>
  </div>
</div>

<div class="work-feed">
${postCards}
</div>

${footerHTML}
${scriptsHTML}

</body>
</html>`;
}

// ============ HELPERS ============

function formatDate(dateVal) {
  const d = new Date(dateVal);
  return d.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
}

function readPosts() {
  const files = fs.readdirSync(POSTS_DIR).filter(f => f.endsWith('.md'));
  const posts = files.map(file => {
    const raw = fs.readFileSync(path.join(POSTS_DIR, file), 'utf-8');
    const { data, content } = matter(raw);
    return {
      title: data.title,
      slug: data.slug,
      date: data.date,
      tags: data.tags || [],
      summary: data.summary || '',
      html: marked(content),
      file
    };
  });
  // Sort reverse chronological
  posts.sort((a, b) => new Date(b.date) - new Date(a.date));
  return posts;
}

// ============ BUILD ============

function build() {
  console.log('Building BRG site...\n');

  // Ensure work directory exists
  if (!fs.existsSync(WORK_DIR)) {
    fs.mkdirSync(WORK_DIR, { recursive: true });
  }

  // Read and parse all posts
  const posts = readPosts();
  console.log(`Found ${posts.length} posts:\n`);

  // Generate individual post pages
  posts.forEach(post => {
    const html = postPageHTML(post);
    const outPath = path.join(WORK_DIR, `${post.slug}.html`);
    fs.writeFileSync(outPath, html);
    console.log(`  ✓ /work/${post.slug}.html`);
  });

  // Generate work.html feed
  const feedHTML = workFeedHTML(posts);
  fs.writeFileSync(OUTPUT_WORK_HTML, feedHTML);
  console.log(`  ✓ /work.html (feed with ${posts.length} posts)\n`);

  console.log('Build complete.');
}

build();
