/**
 * Studio Shell — shared nav, theme, and data loader for all studio pages.
 * Usage: StudioShell.init('ystackai').then(() => { ... })
 */
var StudioShell = (function () {
  var data = null;

  function detectSlug(fallback) {
    var meta = document.querySelector('meta[name="studio-slug"]');
    if (meta && meta.content) return meta.content.trim();
    var bodySlug = document.body && document.body.getAttribute('data-studio-slug');
    if (bodySlug) return bodySlug.trim();
    var parts = window.location.pathname.split('/').filter(Boolean);
    if (parts.length) return parts[0];
    return fallback || 'ystackai';
  }

  function publicUrl(path) {
    if (!path) return path;
    if (/^(https?:)?\/\//.test(path)) return path;
    return path.charAt(0) === '/' ? path : '/' + path;
  }

  function normalize(payload, slug) {
    var snapshot = payload || {};
    var studio = snapshot.studio || {};
    var links = snapshot.links || {};
    var normalized = Object.assign({}, snapshot, {
      studio: studio,
      links: links,
      slug: studio.slug || slug,
      name: studio.name || slug,
      public_url: studio.public_url || '/' + (studio.slug || slug) + '/',
      repo: studio.repo || '',
      hero_text: studio.hero_text || '',
      tagline: studio.tagline || '',
      release: studio.release || {},
      cast: snapshot.cast || snapshot.team || [],
      team: snapshot.team || snapshot.cast || [],
      drops: snapshot.drops || [],
      latest_drop: snapshot.latest_drop || {},
      active_drop: snapshot.active_drop || {},
      active_post: snapshot.active_post || {},
      games: snapshot.games || {},
      blog_posts: snapshot.blog_posts || [],
      chat: snapshot.chat || {},
      theme: snapshot.theme || studio.theme || {},
      discord_invite: links.discord_invite || '',
      blog_url: links.blog_url || '/' + (studio.slug || slug) + '/blog/',
      drops_url: links.drops_url || links.demos_url || '/' + (studio.slug || slug) + '/drops/',
      demos_url: links.demos_url || '/' + (studio.slug || slug) + '/drops/',
      team_url: links.team_url || '/' + (studio.slug || slug) + '/#team',
      board_url: links.board_url || '',
      issues_url: links.issues_url || '',
      github_repo_url: links.github_repo_url || ''
    });
    return normalized;
  }

  async function init(slug) {
    var studioSlug = slug || detectSlug('ystackai');
    var resp = await fetch('/studio-data/' + studioSlug + '/live.json', { cache: 'no-store' });
    data = normalize(await resp.json(), studioSlug);
    applyTheme(data.theme || {});
    return data;
  }

  function applyTheme(theme) {
    var root = document.documentElement;
    if (theme.accent) root.style.setProperty('--studio-accent', theme.accent);
    if (theme.accent2) root.style.setProperty('--studio-accent2', theme.accent2);
    if (theme.font) document.body.style.fontFamily = "'" + theme.font + "', sans-serif";
    if (theme.hero_gradient) {
      root.style.setProperty('--studio-hero-g1', theme.hero_gradient[0] || '#667eea');
      root.style.setProperty('--studio-hero-g2', theme.hero_gradient[1] || '#764ba2');
      root.style.setProperty('--studio-hero-g3', theme.hero_gradient[2] || '#f093fb');
    }
    if (theme.surface === 'dark') {
      root.style.setProperty('--studio-bg', '#0c0d11');
      root.style.setProperty('--studio-surface', 'rgba(255,255,255,0.04)');
      root.style.setProperty('--studio-text', '#e2e8f0');
      root.style.setProperty('--studio-muted', '#94a3b8');
      root.style.setProperty('--studio-border', 'rgba(255,255,255,0.08)');
    }
  }

  function renderNav(containerId) {
    if (!data) return;
    var el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '<nav class="platform-nav"><a href="/" class="logo"><span class="logo-mark">Y</span> ystackai</a>'
      + '<div class="links">'
      + '<a href="/drops/">Drops</a>'
      + '<a href="/crews/">Crews</a>'
      + '<a href="/crews/#waitlist" class="nav-cta">Create Your Own</a>'
      + '</div></nav>';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return {
    init: init,
    renderNav: renderNav,
    applyTheme: applyTheme,
    detectSlug: detectSlug,
    publicUrl: publicUrl,
    get data() { return data; },
    esc: esc
  };
})();
