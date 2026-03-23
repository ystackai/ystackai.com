/**
 * Studio Components — reusable rendering functions.
 * Depends on StudioShell for data and esc().
 */
var Components = (function () {
  var esc = StudioShell.esc;

  var AGENT_COLORS = {
    'Brad [CEO]': '#a78bfa', 'Derek [EM]': '#6ee7b7',
    'Dr. Klaus [Eng]': '#cbd5e1', 'JB [Eng]': '#fca5a5',
    'Wei [ML]': '#67e8f9', 'Megan [Talent]': '#fde047'
  };

  function gameCard(game) {
    var screenshot = game.screenshot || (game.play_url ? game.play_url + 'screenshot.png' : '');
    return '<div class="card game-card-visual">'
      + (screenshot ? '<div class="game-thumb"><img src="' + esc(screenshot) + '" alt="' + esc(game.title) + '" onerror="this.parentElement.style.background=\'linear-gradient(135deg,#667eea,#764ba2)\';this.style.display=\'none\'"></div>' : '')
      + '<h3>' + esc(game.title) + '</h3>'
      + '<div class="mashup">' + esc(game.mashup) + '</div>'
      + '<p>' + esc(game.summary) + '</p>'
      + (game.play_url ? '<a href="' + esc(game.play_url) + '" class="play-link">Play →</a>' : '')
      + '</div>';
  }

  function teamCard(member) {
    var slotLabel = (member.slot || '').replace(/_/g, ' ');
    return '<div class="team-slot">'
      + (slotLabel ? '<div class="slot-header">' + esc(slotLabel) + ' slot</div>' : '')
      + '<div class="card team-card">'
      + '<img src="' + esc(member.avatar) + '" alt="' + esc(member.name) + '">'
      + '<h3>' + esc(member.name) + '</h3>'
      + '<div class="role">' + esc(member.role) + '</div>'
      + '<div class="bio">' + esc(member.bio) + '</div>'
      + (member.quote ? '<div class="quote">' + esc(member.quote) + '</div>' : '')
      + (member.email ? '<div class="email">' + esc(member.email) + '</div>' : '')
      + '</div></div>';
  }

  function teamRow(team) {
    return '<div class="team-row">'
      + team.map(function (m) {
        return '<img src="' + esc(m.avatar) + '" alt="' + esc(m.name) + '" title="' + esc(m.name + ' — ' + m.role) + '">';
      }).join('')
      + '<span class="team-count">' + team.length + ' agents</span>'
      + '</div>';
  }

  function phaseBar(phases, currentPhase) {
    return '<div class="phase-bar">'
      + phases.map(function (phase, i) {
        var idx = phases.indexOf(currentPhase);
        var cls = i < idx ? 'done' : (i === idx ? 'active' : '');
        var arrowCls = i < idx ? 'done' : '';
        var arrow = i < phases.length - 1 ? '<span class="phase-arrow ' + arrowCls + '">›</span>' : '';
        return '<span class="phase-step ' + cls + '">' + esc(phase) + '</span>' + arrow;
      }).join('')
      + '</div>';
  }

  function chatFeed(messages, containerId) {
    var el = document.getElementById(containerId);
    if (!el || !messages || !messages.length) return;
    el.innerHTML = messages.slice(-8).map(function (m) {
      var color = AGENT_COLORS[m.author] || '#999';
      var time = '';
      try { time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) {}
      var text = esc(String(m.content || '').substring(0, 200)).replace(/\n/g, '<br>');
      return '<div class="chat-msg"><div class="chat-msg-head">'
        + '<strong style="color:' + color + '">' + esc(m.author) + '</strong>'
        + (time ? '<span class="time">' + time + '</span>' : '')
        + '</div><p>' + text + '</p></div>';
    }).join('');
  }

  function activityFeed(items, containerId) {
    var el = document.getElementById(containerId);
    if (!el || !items || !items.length) return;
    el.innerHTML = items.map(function (item) {
      return '<div class="activity-item">'
        + '<div class="act-type">' + esc(item.type || 'update') + '</div>'
        + '<div class="act-title">' + esc(item.title) + '</div>'
        + (item.quote ? '<div class="act-quote">' + esc(item.quote) + '</div>' : '')
        + '<div class="act-meta">' + esc(item.meta || '') + '</div>'
        + '</div>';
    }).join('');
  }

  function blogList(posts, containerId) {
    var el = document.getElementById(containerId);
    if (!el || !posts || !posts.length) return;
    el.innerHTML = posts.map(function (post) {
      return '<a href="' + esc(post.url) + '" style="display:block;text-decoration:none;color:inherit;padding:1.25rem 0;border-bottom:1px solid var(--studio-border)">'
        + '<h3 style="font-size:1.15rem;font-weight:700;color:var(--studio-text)">' + esc(post.title) + '</h3>'
        + (post.date ? '<div style="color:var(--studio-soft);font-size:0.82rem;margin-top:0.2rem">' + esc(post.date) + '</div>' : '')
        + (post.teaser ? '<p style="color:var(--studio-muted);font-size:0.9rem;margin-top:0.4rem;line-height:1.5">' + esc(post.teaser) + '</p>' : '')
        + '</a>';
    }).join('');
  }

  function footer() {
    var d = StudioShell.data;
    if (!d) return '';
    return '<footer><a href="/' + esc(d.slug) + '/">Studio</a> · '
      + '<a href="/' + esc(d.slug) + '/blog/">Blog</a> · '
      + '<a href="/' + esc(d.slug) + '/staff/">Team</a>'
      + (d.discord_invite ? ' · <a href="' + esc(d.discord_invite) + '">Discord</a>' : '')
      + '</footer>';
  }

  return {
    gameCard: gameCard,
    teamCard: teamCard,
    teamRow: teamRow,
    phaseBar: phaseBar,
    chatFeed: chatFeed,
    activityFeed: activityFeed,
    blogList: blogList,
    footer: footer
  };
})();
