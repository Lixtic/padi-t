'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GuidEdIllustrationTargets = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var IGNORED = new Set(['definition','key points','example','examples','summary','input devices','output devices','storage devices','computer system','components','key terms']);
  function cleanName(value) { return String(value || '').replace(/^\s*(?:the|a|an)\s+/i, '').replace(/[\s*_:;,.!?]+$/g, '').replace(/\s+/g, ' ').trim(); }
  function validName(value) { var name = cleanName(value); return name.length >= 3 && name.length <= 42 && name.split(' ').length <= 4 && !IGNORED.has(name.toLowerCase()) && !/\b(?:is|are|was|were|means|refers|include|includes|used|helps|allows)\b/i.test(name); }
  function extract(markdown, limit) {
    var lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    var start = lines.findIndex(function (line) { return /^#{1,3}\s+.*study notes?\b/i.test(line.trim()); });
    if (start < 0) return [];
    var end = lines.findIndex(function (line, i) { return i > start && /^(?:#{1,3}\s*)?(?:bece practice|assessment rubric|interactive closing|references|further reading|homework|class exercise)\b/i.test(line.trim()); });
    if (end < 0) end = lines.length;
    var found = [], seen = new Set(), max = limit || 8;
    function add(name, i) { name = cleanName(name); var key = name.toLowerCase(); if (!validName(name) || seen.has(key)) return; seen.add(key); found.push({ concept: name, lineIndex: i, anchorLine: lines[i] }); }
    for (var i = start + 1; i < end && found.length < max; i++) {
      var line = lines[i].trim(), m;
      if (!line || line.charAt(0) === '|' || /^#{1,6}\s/.test(line) || /^```/.test(line)) continue;
      m = line.match(/^(?:[-•▪]\s*)?\*\*([^*]{2,48})\*\*\s*(?::|—|–|-)\s*\S/);
      if (m) { add(m[1], i); continue; }
      m = line.match(/^[-•▪*]\s+([A-Z][A-Za-z0-9 ()/&-]{1,38}?)\s*(?::|—|–|-)\s+\S/);
      if (m) { add(m[1], i); continue; }
      m = line.match(/\b(?:such as|including|for example|examples?\s+(?:include|are)|(?:components?|parts|devices)\s+(?:include|are))\s+([^.!?;]{3,140})/i);
      if (m) m[1].replace(/[()]/g, '').split(/,|\band\b|\bor\b/i).forEach(function (item) { if (found.length < max) add(item, i); });
    }
    return found.slice(0, max);
  }
  return { extract: extract, cleanName: cleanName, validName: validName };
});
