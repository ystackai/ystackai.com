// Blog markdown renderer — loads marked.js, converts [data-markdown] blocks
(function () {
  var els = document.querySelectorAll('[data-markdown]');
  if (!els.length) return;
  var s = document.createElement('script');
  s.src = 'https://cdn.jsdelivr.net/npm/marked@15/marked.min.js';
  s.onload = function () {
    els.forEach(function (el) {
      // dedent: strip leading whitespace matching first non-empty line
      var lines = el.textContent.split('\n');
      var first = lines.find(function (l) { return l.trim(); });
      var indent = first ? first.match(/^(\s*)/)[1].length : 0;
      var md = lines.map(function (l) { return l.slice(indent); }).join('\n').trim();
      el.innerHTML = marked.parse(md);
    });
  };
  document.head.appendChild(s);
})();
