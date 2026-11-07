'use strict';
// School levels, their classes and subjects, and the name of the exam-practice section at each level.
// SOURCE OF TRUTH. public/levels.js is generated from this file by `node scripts/build-levels.js`. Do not edit that copy.
(function (root, factory) {
  const L = factory();
  if (typeof module === 'object' && module.exports) module.exports = L;
  else root.GuidedLevels = L;
})(typeof self !== 'undefined' ? self : this, function () {
  const LEVELS = [
    {
      id: 'lower', name: 'Lower Primary', classes: ['Basic 1', 'Basic 2', 'Basic 3'],
      subjects: ['English Language', 'Mathematics', 'Ghanaian Language', 'Our World Our People', 'Creative Arts', 'Religious and Moral Education', 'Physical Education', 'Computing'],
      exam: { id: 'class', toggle: 'Class exercise', section: 'Class Exercise', tag: 'No class exercise', title: ' – Class Exercise', more: '10 more class exercise questions', ask: "Write 10 more class exercise questions on this week's topics." },
      notes: { toggle: "Teacher's notes", tag: "No teacher's notes" },
    },
    {
      id: 'upper', name: 'Upper Primary', classes: ['Basic 4', 'Basic 5', 'Basic 6'],
      subjects: ['English Language', 'Mathematics', 'Science', 'Our World Our People', 'History', 'Computing', 'Creative Arts', 'Religious and Moral Education', 'Physical Education', 'Ghanaian Language', 'French'],
      exam: { id: 'class', toggle: 'Class exercise', section: 'Class Exercise', tag: 'No class exercise', title: ' – Class Exercise', more: '10 more class exercise questions', ask: "Write 10 more class exercise questions on this week's topics." },
      notes: { toggle: 'Study notes', tag: 'No study notes' },
    },
    {
      id: 'jhs', name: 'JHS', classes: ['Basic 7', 'Basic 8', 'Basic 9'],
      subjects: ['Integrated Science', 'Mathematics', 'English Language', 'Social Studies', 'Religious and Moral Education', 'Computing', 'Career Technology', 'Creative Arts and Design', 'Ghanaian Language', 'French', 'Physical Education and Health'],
      exam: { id: 'bece', toggle: 'BECE practice', section: 'BECE Practice', tag: 'No BECE questions', title: ' – BECE Practice', more: '10 more BECE questions', ask: "Write 10 more BECE-style questions on this week's topics." },
      notes: { toggle: 'Study notes', tag: 'No study notes' },
    },
    {
      id: 'shs', name: 'SHS', classes: ['SHS 1', 'SHS 2', 'SHS 3'],
      subjects: ['English Language', 'Mathematics', 'General Science', 'Social Studies'],
      exam: { id: 'wassce', toggle: 'WASSCE practice', section: 'WASSCE Practice', tag: 'No WASSCE questions', title: ' – WASSCE Practice', more: '10 more WASSCE questions', ask: "Write 10 more WASSCE-style questions on this week's topics." },
      notes: { toggle: 'Study notes', tag: 'No study notes' },
    },
  ];
  const ALL_CLASSES = LEVELS.reduce((a, l) => a.concat(l.classes), []);
  const levelOfClass = (cls) => LEVELS.find((l) => l.classes.includes(cls)) || null;
  return { LEVELS, ALL_CLASSES, levelOfClass, isClass: (c) => ALL_CLASSES.includes(c), DEFAULT_LEVEL: 'jhs' };
});
