'use strict';
// Teachers can plan from their own scheme: parsing of .csv / .xlsx / .docx, the lookup that replaces the built-in scheme, and the server's checks.
const zlib = require('zlib');
const My = require('../public/myscheme.js');
const Server = require('../api/_myscheme.js');

// A tiny zip writer so the tests need no fixtures.
function zip(files) {
  const parts = [], central = []; let offset = 0;
  const crcTable = Array.from({ length: 256 }, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = (b) => { let c = 0xffffffff; for (const x of b) c = crcTable[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
  for (const [name, text] of Object.entries(files)) {
    const raw = Buffer.from(text), data = zlib.deflateRawSync(raw), nm = Buffer.from(name);
    const lh = Buffer.alloc(30); lh.writeUInt32LE(0x04034b50, 0); lh.writeUInt16LE(20, 4); lh.writeUInt16LE(8, 8); lh.writeUInt32LE(crc(raw), 14); lh.writeUInt32LE(data.length, 18); lh.writeUInt32LE(raw.length, 22); lh.writeUInt16LE(nm.length, 26);
    parts.push(lh, nm, data);
    const ch = Buffer.alloc(46); ch.writeUInt32LE(0x02014b50, 0); ch.writeUInt16LE(20, 4); ch.writeUInt16LE(20, 6); ch.writeUInt16LE(8, 10); ch.writeUInt32LE(crc(raw), 16); ch.writeUInt32LE(data.length, 20); ch.writeUInt32LE(raw.length, 24); ch.writeUInt16LE(nm.length, 28); ch.writeUInt32LE(offset, 42);
    central.push(ch, nm); offset += lh.length + nm.length + data.length;
  }
  const cd = Buffer.concat(central), end = Buffer.alloc(22); end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(files).length, 8); end.writeUInt16LE(Object.keys(files).length, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(offset, 16);
  const out = Buffer.concat([...parts, cd, end]); return out.buffer.slice(out.byteOffset, out.byteOffset + out.length);
}
const file = (name, content) => ({ name, arrayBuffer: async () => (typeof content === 'string' ? Buffer.from(content) : content), text: async () => String(content) });

const results = [];
const check = (name, ok) => { results.push([name, !!ok]); };

(async () => {
  // CSV with quoted cells, a week range, a merged (empty) strand and an exam week
  const csv = 'Week,Strand,Sub-strand,Content standard,Indicators\r\n1,Revision,,,\r\n2,Computing,Parts,"B7.1.1.1. Parts","B7.1.1.1.1 Discuss ""fourth"" generation\nB7.1.1.1.2 Input devices"\r\n"3-4",,Desktop,,B7.1.1.2.1 Files\r\n12,End of term examination,,,\r\n';
  const a = await My.readFile(file('s.csv', csv));
  check('CSV: finds the header and rows', a.rows && a.rows.length === 4);
  check('CSV: revision, teach and exam weeks are told apart', a.rows && a.rows[0].type === 'revision' && a.rows[1].type === 'teach' && a.rows[3].type === 'exam');
  check('CSV: week ranges and quoted indicators', a.rows && a.rows[2].weeks.join() === '3,4' && a.rows[1].indicators.length === 2 && /"fourth"/.test(a.rows[1].indicators[0]));
  check('CSV: a blank strand carries down from the row above', a.rows && a.rows[2].strand === 'Computing' && a.rows[2].standard === 'B7.1.1.1. Parts');
  check('CSV: missing Week column is explained', (await My.readFile(file('x.csv', 'Topic,Notes\nA,B'))).error.includes('Week'));
  check('PDF is refused with a clear message', /\.docx, \.xlsx or \.csv/.test((await My.readFile(file('x.pdf', 'x'))).error));

  // XLSX: shared strings, a number cell and an empty cell in the middle
  const sheet = '<worksheet><sheetData><row r="1"><c r="A1" t="s"><v>0</v></c><c r="B1" t="s"><v>1</v></c><c r="D1" t="s"><v>2</v></c></row>' +
    '<row r="2"><c r="A2"><v>5</v></c><c r="B2" t="s"><v>3</v></c><c r="D2" t="inlineStr"><is><t>B8.2.1.1.1 Do &amp; learn</t></is></c></row></sheetData></worksheet>';
  const sst = '<sst><si><t>Week</t></si><si><t>Strand</t></si><si><t>Indicators</t></si><si><r><t>Algebra </t></r><r><t>basics</t></r></si></sst>';
  const x = await My.readFile(file('s.xlsx', zip({ 'xl/worksheets/sheet1.xml': sheet, 'xl/sharedStrings.xml': sst })));
  check('XLSX: cells, shared strings and gaps', x.rows && x.rows[0].weeks[0] === 5 && x.rows[0].strand === 'Algebra basics' && x.rows[0].indicators[0] === 'B8.2.1.1.1 Do & learn');

  // DOCX table with a two-paragraph indicator cell
  const cellX = (t) => '<w:tc><w:tcPr/>' + t.split('\n').map((p) => '<w:p><w:r><w:t>' + p + '</w:t></w:r></w:p>').join('') + '</w:tc>';
  const docx = '<w:document><w:body><w:p><w:r><w:t>Scheme</w:t></w:r></w:p><w:tbl>' +
    [['Weeks', 'Strand', 'Indicators'], ['1', 'Number', 'B7.1.1.1.1 One\nB7.1.1.1.2 Two']].map((r) => '<w:tr>' + r.map(cellX).join('') + '</w:tr>').join('') + '</w:tbl></w:body></w:document>';
  const d = await My.readFile(file('s.docx', zip({ 'word/document.xml': docx })));
  check('DOCX: reads the table and splits paragraph indicators', d.rows && d.rows[0].strand === 'Number' && d.rows[0].indicators.length === 2);
  check('DOCX without a table says so', /no table/.test((await My.readFile(file('n.docx', zip({ 'word/document.xml': '<w:document><w:body><w:p/></w:body></w:document>' })))).error));

  // Lookup: matches the shape of the built-in scheme and recalls the week before
  const entry = { rows: a.rows };
  const w3 = My.lookupCustom(entry, 1, 3), w12 = My.lookupCustom(entry, 1, 12), w1 = My.lookupCustom(entry, 1, 1);
  check('Lookup: a week inside a range', w3 && w3.type === 'teach' && w3.custom === true && w3.source === 'Your own scheme');
  check('Lookup: recalls the previous topic', w3 && /Computing/.test(w3.recall || ''));
  check('Lookup: exam weeks and weeks not in the scheme', w12 && w12.type === 'exam' && My.lookupCustom(entry, 1, 7) === null);
  check('Lookup: revision lists the topics taught', w1 && w1.type === 'revision' && w1.topics.length >= 1);
  check('Template parses back into rows', My.fromTable(My.parseDelimited(My.templateCsv())).rows.length === 4);

  // Server: only the row for the planned week, rebuilt with limits
  const s = Server.fromRequest({ weeks: [3, 4], type: 'teach', strand: 'S'.repeat(900), indicators: Array(30).fill('B7.1.1.1.1 x'), evil: '<script>', topics: 'nope' }, 1, 3);
  check('Server: limits lengths and counts and drops unknown fields', s && s.strand.length === 300 && s.indicators.length === 12 && !('evil' in s) && s.topics.length === 0 && s.custom === true);
  check('Server: refuses a row that is not for the planned week', Server.fromRequest({ weeks: [3], type: 'teach', strand: 'x' }, 1, 5) === null);
  check('Server: refuses junk and empty teaching rows', Server.fromRequest('x', 1, 1) === null && Server.fromRequest({ weeks: [1], type: 'teach' }, 1, 1) === null);
  check('Server: unknown types become teaching rows', Server.fromRequest({ weeks: [1], type: 'bogus', strand: 'x' }, 1, 1).type === 'teach');

  let failed = 0;
  for (const [name, ok] of results) { console.log((ok ? 'PASS ' : 'FAIL ') + name); if (!ok) failed++; }
  if (failed) process.exit(1);
  console.log('Own scheme tests passed.');
})();
