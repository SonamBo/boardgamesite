// Translates the words the game scripts write on screen (status lines, buttons, messages) on the Spanish
// and French pages, so the games themselves stay in English. The build puts this page's words in
// window.BGS_I18N = { exact: { "Your move": "Tu turno" }, patterns: [["(.+) wins", "Ganan {1}"]] }.
// A pattern's {1}, {2}… are its captured groups, themselves translated when they're known words.
// Add ?i18n-missing to a page's address to list, in the console, any English left untranslated.
(function () {
  var D = window.BGS_I18N;
  if (!D) return;
  var exact = D.exact || {}, pats = [], done = new Set();
  (D.patterns || []).forEach(function (p) { pats.push([new RegExp('^' + p[0] + '$'), p[1]]); });
  Object.keys(exact).forEach(function (k) { done.add(exact[k]); });
  var record = /[?&]i18n-missing/.test(location.search);
  var missing = window.BGS_I18N_MISSING = new Set();

  function word(s) { return exact[s] != null ? exact[s] : s; }
  function tr(s) {
    var k = s.replace(/\s+/g, ' ').trim();
    if (!k || done.has(k) || !/[A-Za-z]{2}/.test(k)) return null;
    if (exact[k] != null) return s.replace(s.trim(), exact[k]);
    for (var i = 0; i < pats.length; i++) {
      var m = k.match(pats[i][0]);
      if (m) {
        var out = pats[i][1].replace(/\{(\d)\}/g, function (_, n) { return word(m[+n] || ''); });
        done.add(out);
        return s.replace(s.trim(), out);
      }
    }
    // a line made of several messages ("3 solved · Easy best 4:10", "Final score 40–24. Have another go?")
    var parts = k.split(/ · |(?<=[.!?:]) (?=[A-Z¡¿])/);
    if (parts.length > 1) {
      var seps = k.match(/ · |(?<=[.!?:]) (?=[A-Z¡¿])/g), ok = false;
      var outs = parts.map(function (p) { var t = tr(p); if (t != null) ok = true; return t != null ? t : p; });
      if (ok) {
        var joined = outs.reduce(function (a, p, i) { return a + seps[i - 1] + p; });
        done.add(joined);
        return s.replace(s.trim(), joined);
      }
    }
    if (record && !missing.has(k)) { missing.add(k); console.warn('[i18n] missing:', JSON.stringify(k)); }
    return null;
  }
  var ATTRS = ['aria-label', 'title', 'placeholder', 'alt', 'data-tip'];
  function skip(el) { return !el || el.closest('script,style,noscript,textarea,[translate=no],code'); }
  function text(n) {
    if (skip(n.parentElement)) return;
    var t = tr(n.nodeValue);
    if (t != null && t !== n.nodeValue) n.nodeValue = t;
  }
  function attrs(el) {
    if (skip(el)) return;
    for (var i = 0; i < ATTRS.length; i++) {
      var v = el.getAttribute(ATTRS[i]);
      if (v) { var t = tr(v); if (t != null && t !== v) el.setAttribute(ATTRS[i], t); }
    }
  }
  function walk(root) {
    if (root.nodeType === 3) return text(root);
    if (root.nodeType !== 1) return;
    attrs(root);
    var w = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    for (var n = w.nextNode(); n; n = w.nextNode()) n.nodeType === 3 ? text(n) : attrs(n);
  }
  new MutationObserver(function (list) {
    for (var i = 0; i < list.length; i++) {
      var m = list[i];
      if (m.type === 'childList') m.addedNodes.forEach(walk);
      else if (m.type === 'characterData') text(m.target);
      else attrs(m.target);
    }
  }).observe(document, { subtree: true, childList: true, characterData: true, attributes: true, attributeFilter: ATTRS });
  document.addEventListener('DOMContentLoaded', function () { walk(document.body); });
})();
