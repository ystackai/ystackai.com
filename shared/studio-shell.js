/**
 * Studio Shell — shared nav, theme, and data loader for all studio pages.
 * Usage: StudioShell.init('ystackai').then(() => { ... })
 */
var StudioShell = (function () {
  var data = null;

  async function init(slug) {
    var resp = await fetch('/' + slug + '/studio.json', { cache: 'no-store' });
    data = await resp.json();
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
    el.innerHTML = '<nav class="studio-nav"><a href="/' + esc(data.slug) + '/" class="studio-id">'
      + '<div class="studio-dot"></div><div><div class="studio-name">' + esc(data.name) + '</div>'
      + '<div class="studio-label">crew</div></div></a>'
      + '<div class="links">'
      + '<a href="/">← ystackai.com</a>'
      + '<a href="/' + esc(data.slug) + '/">Crew</a>'
      + '<a href="/' + esc(data.slug) + '/blog/">Blog</a>'
      + (data.discord_invite ? '<a href="' + esc(data.discord_invite) + '">Discord</a>' : '')
      + '</div></nav>';
  }

  function esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  return { init: init, renderNav: renderNav, applyTheme: applyTheme, get data() { return data; }, esc: esc };
})();
