'use strict';
/* Inclusive teaching options: support for slow and average learners, gender-responsive grouping, a simple ICT step,
   and the kinds of activity the teacher wants. Only whitelisted values reach the prompt. */
const Levels = require('./_levels');

const ACTIVITIES = {
  group: 'Group discussion',
  roleplay: 'Role play',
  song: 'Song, rhyme or chant',
  game: 'Learning game',
  make: 'Drawing or making',
  talk: 'Talk by a resource person',
  call: 'Voice call to a resource person',
};

// Lower primary starts with learner support and gender-responsive grouping on; the teacher can change it.
function defaultFor(cls) {
  const l = Levels.levelOfClass(cls);
  const lower = !!l && l.id === 'lower';
  return { support: lower, gender: lower, ict: false, acts: [] };
}

// A clean { support, gender, ict, acts } from whatever the browser sent; missing means the level default.
function normalise(raw, cls) {
  const d = defaultFor(cls);
  if (!raw || typeof raw !== 'object') return d;
  const acts = Array.isArray(raw.acts) ? Array.from(new Set(raw.acts.map(String).filter((a) => Object.prototype.hasOwnProperty.call(ACTIVITIES, a)))) : d.acts;
  return {
    support: raw.support === undefined ? d.support : raw.support === true,
    gender: raw.gender === undefined ? d.gender : raw.gender === true,
    ict: raw.ict === undefined ? d.ict : raw.ict === true,
    acts: acts.slice(0, 7),
  };
}

// Instruction lines for the plan request. They describe how to write the plan, in plain wording.
function lines(inc) {
  if (!inc) return [];
  const out = [];
  if (inc.support) out.push('Learner support: in every lesson phase write a "Support" task for slow learners (smaller steps, real objects or pictures, a partner or the teacher close by) and a "Core" task for average learners, then one quick check for each group. Use short, plain sentences for the slow-learner task.');
  if (inc.gender) out.push('Gender-responsive: use mixed-gender groups, give every learner a turn at each group role (reporter, writer, materials, timekeeper) and rotate the roles; use names, examples and pictures that include girls and boys equally and avoid stereotypes; say how the teacher will invite quiet learners to speak.');
  if (inc.ict) out.push('ICT: include one simple, low-bandwidth ICT step the teacher can do with a phone or radio (an audio clip, a photo, the calculator or a short voice message), and give an offline alternative in the same row.');
  if (inc.support || inc.acts.length) out.push('Activity variety: use at least three different kinds of learner activity across the two lessons, and do not repeat the same activity in two phases of one lesson.');
  if (inc.acts.length) out.push('Required activities (put each in a Learning Activities cell where it fits the lesson): ' + inc.acts.map((a) => ACTIVITIES[a]).join('; ') + '.');
  if (inc.acts.includes('call')) out.push('Voice call to a resource person: say who the teacher should call (for example a police officer, nurse or farmer) and why, give 3 or 4 short child-friendly questions to ask, explain how to run the call on speaker with learners taking turns to ask, add what learners do before and after the call, and give a back-up if the person cannot be reached (a recorded message or the teacher answering in role). Use it instead of a visit when a visit is not possible.');
  if (inc.acts.includes('talk') && !inc.acts.includes('call')) out.push('Talk by a resource person: say who to invite, what to ask them to cover in 10 minutes, and what learners do before and after.');
  return out;
}

module.exports = { ACTIVITIES, defaultFor, normalise, lines };
