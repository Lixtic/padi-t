'use strict';
(function (root, factory) {
  var api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  if (root) root.GuidEdIllustrationTargets = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
  var IGNORED = new Set([
    'definition','key points','example','examples','worked or real-life example','worked or real-life examples',
    'ghanaian example','summary','quick summary','diagram','common mistakes','support','extension','answer','answers',
    'meaning','input device','input devices','output device','output devices','storage device','storage devices',
    'computer system','computer systems','parts of a computer','main parts','components','main components',
    'key term','key terms','key terms and meanings','learning objectives','lesson objectives','prerequisite knowledge',
    'features','functions','uses','advantages','disadvantages','importance','characteristics','types','steps','process',
    'materials','tools','equipment','resources','activities','assessment','class exercise',\n    'which subject','subject','class','class level','level','content standard','content standards',\n    'curriculum standard','curriculum standards','curriculum indicator','curriculum indicators',\n    'learning indicator','learning indicators','strand','sub-strand','substrand','term','week',\n    'duration','date','teacher','school','topic','lesson topic','subject area','grade','basic level'
  ]);
  function cleanName(value) {
    return String(value || '').replace(/^\s*(?:the|a|an)\s+/i, '')
      .replace(/^[\s*_\x60]+|[\s*_\x60]+$/g, '')
      .replace(/[\s*_:;,.!?]+$/g, '').replace(/\s+/g, ' ').trim();
  }
  function validName(value) {
    var name = cleanName(value);
    return name.length >= 3 && name.length <= 48 && name.split(' ').length <= 5 &&
      !IGNORED.has(name.toLowerCase()) &&
      !/\b(?:is|are|was|were|means|refers|include|includes|used|helps|allows|consists|contains)\b/i.test(name) &&
      !/^(?:lesson|topic|section|objective|indicator)\b/i.test(name);
  }
  function extract(markdown, limit) {
    var lines = String(markdown || '').replace(/\r\n?/g, '\n').split('\n');
    var start = lines.findIndex(function (line) { return /^#{1,3}\s+.*\bstudy notes?\b/i.test(line.trim()); });
    if (start < 0) return [];
    var stopHeading = /^(?:#{1,3}\s*)?(?:bece practice|wassce practice|assessment rubric|interactive closing|references|further reading|homework|class exercise|teacher reflection)\b/i;
    var end = lines.findIndex(function (line, i) { return i > start && stopHeading.test(line.trim()); });
    if (end < 0) end = lines.length;
    var found = [], seen = new Set(), max = Number.isInteger(limit) && limit > 0 ? limit : 8;
    function add(name, i) {
      name = cleanName(name);
      var key = name.toLowerCase();
      if (!validName(name) || seen.has(key) || found.length >= max) return;
      seen.add(key);
      found.push({ concept: name, lineIndex: i, anchorLine: lines[i] });
    }
    function addList(value, i) {
      String(value || '').replace(/[()\[\]]/g, '').split(/,|\band\b|\bor\b/i).forEach(function (item) {
        if (found.length < max) add(item, i);
      });
    }
    for (var i = start + 1; i < end && found.length < max; i++) {
      var line = lines[i].trim(), m;
      if (!line || /^\|/.test(line) || /^#{1,6}\s/.test(line) || /^\x60{3}/.test(line)) continue;
      m = line.match(/^(?:(?:[-•▪*]|\d{1,2}[.)])\s*)?\*\*([^*]{2,52}?):?\*\*\s*(?::|—|–|-)\s*\S/);
      if (m) { add(m[1], i); continue; }
      m = line.match(/^(?:(?:[-•▪*]|\d{1,2}[.)])\s*)?\*\*([^*]{2,52}?)\s*:\*\*\s*\S/);
      if (m) { add(m[1], i); continue; }
      m = line.match(/^(?:[-•▪*]|\d{1,2}[.)])\s+([A-Z][A-Za-z0-9 ()/&'-]{1,44}?)\s*(?::|—|–)\s+\S/);
      if (m) { add(m[1], i); continue; }
      m = line.match(/\b(?:such as|including|for example|examples?\s+(?:include|are)|(?:components?|parts|devices|materials|tools)\s+(?:include|are))\s+([^.!?;]{3,160})/i);
      if (m) { addList(m[1], i); continue; }
      m = line.match(/\b(?:input|output|storage)\s+devices?\s*:\s*([^.!?;]{3,160})/i);
      if (m) { addList(m[1], i); continue; }
      m = line.match(/\b(?:main|common|major)\s+(?:parts|components|devices|materials|tools)\s+(?:include|are|:)\s*([^.!?;]{3,160})/i);
      if (m) addList(m[1], i);
    }
    return found;
  }
  return { extract: extract, cleanName: cleanName, validName: validName };
});
