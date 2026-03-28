/**
 * Studio Components — reusable rendering functions.
 * Depends on StudioShell for data and esc().
 */
var Components = (function () {
  function esc(s) {
    return String(s || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  var AGENT_COLORS = {
    'Brad [CEO]': '#a78bfa', 'Derek [EM]': '#6ee7b7',
    'Dr. Klaus [Eng]': '#cbd5e1', 'JB [Eng]': '#fca5a5',
    'Wei [ML]': '#67e8f9', 'Megan [Talent]': '#fde047'
  };
  var AGENT_AVATARS = {
    'Brad [CEO]': '/team/avatars/brad.jpg', 'Derek [EM]': '/team/avatars/derek.jpg',
    'Dr. Klaus [Eng]': '/team/avatars/schneider.jpg', 'JB [Eng]': '/team/avatars/jb.jpg',
    'Wei [ML]': '/team/avatars/wei.jpg', 'Megan [Talent]': '/team/avatars/megan.jpg'
  };

  function firstShot(game) {
    var shots = (game && game.shots) || [];
    return shots.length ? shots[0].image_url || '' : '';
  }

  function gameCard(game) {
    var screenshot = game.screenshot || firstShot(game) || (game.play_url ? game.play_url.replace(/\/?$/, '/') + 'screenshot.png' : '');
    return '<div class="card game-card-visual">'
      + (screenshot ? '<div class="game-thumb"><img src="' + esc(screenshot) + '" alt="' + esc(game.title) + '" onerror="this.parentElement.style.background=\'linear-gradient(135deg,#667eea,#764ba2)\';this.style.display=\'none\'"></div>' : '')
      + '<h3>' + esc(game.title) + '</h3>'
      + '<div class="mashup">' + esc(game.mashup) + '</div>'
      + '<p>' + esc(game.summary) + '</p>'
      + (game.play_url ? '<a href="' + esc(game.play_url) + '" class="play-link">Play →</a>' : '')
      + '</div>';
  }

  function teamCard(member) {
    var slotLabel = String(member.slot_id || member.runtime_slot || member.slot || '')
      .replace(/_/g, ' ')
      .replace(/([a-z])([0-9])/g, '$1 $2');
    var avatar = member.avatar_url || member.avatar || '';
    var name = member.display_name || member.name || '';
    var role = member.display_role || member.canonical_title || member.role || '';
    var bio = member.bio || '';
    var profileUrl = member.profile_url || '/' + esc((StudioShell.data && StudioShell.data.slug) || 'ystackai') + '/team/profile.html?id=' + esc(member.person_id || member.id || '');
    return '<div class="team-slot">'
      + (slotLabel ? '<div class="slot-header">' + esc(slotLabel) + ' slot</div>' : '')
      + '<a href="' + profileUrl + '" class="mtg-card">'
      + '<div class="mtg-portrait"><img src="' + esc(avatar) + '" alt="' + esc(name) + '"></div>'
      + '<div class="mtg-info">'
      + '<h3>' + esc(name) + '</h3>'
      + '<div class="mtg-role">' + esc(role) + '</div>'
      + '<div class="mtg-bio">' + esc(bio) + '</div>'
      + '</div>'
      + '</a>'
      + '</div>';
  }

  function teamRow(team) {
    return '<div class="team-row">'
      + team.map(function (m) {
        var avatar = m.avatar_url || m.avatar || '';
        var name = m.display_name || m.name || '';
        var role = m.display_role || m.canonical_title || m.role || '';
        return '<img src="' + esc(avatar) + '" alt="' + esc(name) + '" title="' + esc(name + ' — ' + role) + '">';
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

  function ticketBoard(containerId, boardData) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (!boardData || !Array.isArray(boardData.all_open_issues)) {
      el.innerHTML = '<p style="color:#999">Board unavailable</p>';
      return;
    }

    function issueHref(issue) {
      if (issue && issue.issue_url) return issue.issue_url;
      var links = (StudioShell.data && StudioShell.data.links) || {};
      var repoUrl = links.github_repo_url || '';
      if (repoUrl && issue && issue.number) return repoUrl.replace(/\/$/, '') + '/issues/' + issue.number;
      return '#';
    }

    var issues = boardData.all_open_issues || [];
    var columns = {
      backlog: { title: 'Backlog', items: [] },
      active: { title: 'Active', items: [] },
      review: { title: 'Review', items: [] },
      shipped: { title: 'Shipped', items: [] }
    };

    issues.forEach(function(issue) {
      var labels = issue.labels || [];
      var col = 'backlog';
      if (labels.indexOf('active') >= 0) col = 'active';
      else if (labels.indexOf('review') >= 0 || labels.indexOf('in-review') >= 0) col = 'review';
      else if (labels.indexOf('shipped') >= 0 || labels.indexOf('done') >= 0) col = 'shipped';
      columns[col].items.push(issue);
    });

    var html = '<div class="ticket-board">';
    ['backlog', 'active', 'review', 'shipped'].forEach(function(key) {
      var column = columns[key];
      html += '<div class="ticket-column">';
      html += '<div class="ticket-column-header">' + esc(column.title) + ' <span class="ticket-count">' + column.items.length + '</span></div>';
      html += '<div class="ticket-cards">';
      column.items.forEach(function(issue) {
        var labels = (issue.labels || []).filter(function(l) {
          return ['backlog', 'active', 'review', 'in-review', 'shipped', 'done', 'ship-blocker'].indexOf(l) < 0;
        });
        var claimed = (issue.labels || []).filter(function(l) { return l.indexOf('claimed:') === 0; });
        var agent = claimed.length ? claimed[0].replace('claimed:', '') : '';
        var isBlocker = (issue.labels || []).indexOf('ship-blocker') >= 0;
        var href = issueHref(issue);
        var target = href === '#' ? '' : ' target="_blank"';

        html += '<a class="ticket-card' + (isBlocker ? ' blocker' : '') + '" href="' + esc(href) + '"' + target + '>';
        html += '<div class="ticket-title">#' + issue.number + ' ' + esc(issue.title) + '</div>';
        if (agent) html += '<div class="ticket-agent">' + esc(agent) + '</div>';
        if (labels.length) html += '<div class="ticket-labels">' + labels.map(function(l) { return '<span class="ticket-label label-' + l + '">' + esc(l) + '</span>'; }).join('') + '</div>';
        html += '</a>';
      });
      if (!column.items.length) html += '<div class="ticket-empty">No items</div>';
      html += '</div></div>';
    });
    html += '</div>';
    el.innerHTML = html;
  }

  function chatFeed(messages, containerId) {
    var el = document.getElementById(containerId);
    if (!el || !messages || !messages.length) return;
    el.innerHTML = messages.slice(-8).map(function (m) {
      var color = AGENT_COLORS[m.author] || '#999';
      var avatar = AGENT_AVATARS[m.author] || '';
      var time = '';
      try { time = new Date(m.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }); } catch (e) {}
      var text = esc(String(m.content || '').substring(0, 200)).replace(/\n/g, '<br>');
      return '<div class="chat-msg">'
        + (avatar ? '<img class="chat-avatar" src="' + esc(avatar) + '" alt="">' : '')
        + '<div class="chat-msg-body"><div class="chat-msg-head">'
        + '<strong style="color:' + color + '">' + esc(m.author) + '</strong>'
        + (time ? '<span class="time">' + time + '</span>' : '')
        + '</div><p>' + text + '</p></div></div>';
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
    var teamUrl = (d.links && d.links.team_url) || '/' + esc(d.slug) + '/#team';
    var dropsUrl = (d.links && (d.links.drops_url || d.links.demos_url)) || '/' + esc(d.slug) + '/drops/';
    return '<footer><a href="/' + esc(d.slug) + '/">Crew</a> · '
      + '<a href="' + esc(dropsUrl) + '">Drops</a> · '
      + '<a href="/' + esc(d.slug) + '/blog/">Blog</a> · '
      + '<a href="' + esc(teamUrl) + '">Team</a>'
      + (d.discord_invite ? ' · <a href="' + esc(d.discord_invite) + '">Discord</a>' : '')
      + '</footer>';
  }

  return {
    gameCard: gameCard,
    teamCard: teamCard,
    teamRow: teamRow,
    phaseBar: phaseBar,
    ticketBoard: ticketBoard,
    chatFeed: chatFeed,
    activityFeed: activityFeed,
    blogList: blogList,
    footer: footer
  };
})();
