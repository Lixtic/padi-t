'use strict';
const assert = require('node:assert/strict');
const Targets = require('../public/illustration-targets');
const notes = [
  '## Study Notes','### Parts of a computer system',
  'A computer system is made up of different parts that work together.',
  '- **Monitor:** A monitor displays text, pictures and videos from the computer.',
  '- **Keyboard:** The keyboard is used to type letters and numbers.',
  '- **Mouse:** A mouse helps the user point, click and select items.',
  '- **System unit:** The system unit contains important internal components.',
  '## BECE Practice','- **Printer:** This distractor must not be selected.'
].join('\n');
const targets = Targets.extract(notes, 8);
assert.deepEqual(targets.map(x => x.concept), ['Monitor','Keyboard','Mouse','System unit']);
assert.equal(targets[0].anchorLine.includes('displays text'), true);
assert.equal(targets[0].lineIndex, 3);
const older = Targets.extract(['## Study Notes','Examples of input devices include the keyboard, mouse, and scanner.','## Assessment Rubric'].join('\n'), 8);
assert.deepEqual(older.map(x => x.concept), ['keyboard','mouse','scanner']);
const numbered = Targets.extract(['# Study Notes','1. **Monitor:** Displays information.','2. **Keyboard:** Enters text.','3. Mouse — selects items.','## Homework'].join('\n'), 8);
assert.deepEqual(numbered.map(x => x.concept), ['Monitor','Keyboard','Mouse']);
const categoryList = Targets.extract(['## Study Notes','Input devices: keyboard, mouse and scanner.','Output devices: monitor, printer and speakers.','## Class Exercise'].join('\n'), 8);
assert.deepEqual(categoryList.map(x => x.concept), ['keyboard','mouse','scanner','monitor','printer','speakers']);
assert.equal(categoryList.every(x => x.lineIndex < 3), true);
const components = Targets.extract(['## Study Notes','The main parts are monitor, keyboard and system unit.','The system unit contains the processor.'].join('\n'), 8);
assert.deepEqual(components.map(x => x.concept), ['monitor','keyboard','system unit']);
const metadataLabels = Targets.extract([
  '## Study Notes',
  '- **Which subject:** Computing',
  '- **Content standards:** B7.1.1.1 Examine the parts of a computer system.',
  '- **Curriculum indicator:** B7.1.1.1.1 Identify the parts.',
  '- **Strand:** Computing Systems',
  '- **Topic:** Introduction to Computer Systems',
  '- **Monitor:** Displays information.',
  '## Assessment'
].join('\\n'), 8);
assert.deepEqual(metadataLabels.map(x => x.concept), ['Monitor']);
assert.deepEqual(Targets.extract('## BECE Practice\n- **Keyboard:** not notes', 8), []);
assert.deepEqual(Targets.extract('## Study Notes\n- **Definition:** A computer is...', 8), []);
assert.deepEqual(Targets.extract('## Study Notes\n- **Examples:** a list of ideas', 8), []);
assert.equal(Targets.extract(notes, 2).length, 2);
assert.deepEqual(Targets.extract('## Study Notes\nNo concrete examples here.', 8), []);
process.stdout.write('Study illustration target extraction tests passed.\n');
