'use strict';
// Exercises the free-plan reservation contract with a deterministic database stand-in.
// The production SQL uses a transaction-scoped advisory lock; this fake applies each
// reservation atomically so parallel calls can verify the public contract.
const assert = require('node:assert/strict');
const planLog = new Map(), reservations = new Map(), bonus = new Map();
const key = (s,p,c) => [s,p,c].join('|');
const squash = s => s.replace(/\s+/g,' ').trim();
global.__PADI_SQL__ = { query: async (sql, p) => {
  const t = squash(sql);
  if (/WITH lock AS MATERIALIZED/.test(t)) {
    const [subject,period,now,cls,limit,classLimit,id,kind,uid] = p;
    const committed = [...planLog.entries()].filter(([k]) => k.startsWith(subject+'|'+period+'|'));
    const active = [...reservations.values()].filter(r => r.subject===subject && r.period===period && r.expiresAt>now && r.kind!=='bonus');
    const classes = new Set(committed.filter(([,n])=>n>0).map(([k])=>k.split('|')[2]).concat(active.map(r=>r.cls)));
    const used = committed.reduce((n,[,v])=>n+v,0)+active.length;
    const classOk = !classLimit || classes.has(cls) || classes.size<classLimit;
    const weeklyOk = !limit || used<limit;
    if(classOk && weeklyOk){reservations.set(id,{subject,period,cls,kind,userId:uid,expiresAt:now+1800000});return [{id,kind:'normal'}]}
    if(classOk && !weeklyOk && kind==='teacher' && (bonus.get(uid)||0)>0){
      bonus.set(uid,bonus.get(uid)-1);reservations.set(id,{subject,period,cls,kind:'bonus',userId:uid,expiresAt:now+1800000});return [{id,kind:'bonus'}]
    }
    return [];
  }
  if (/^select cls, n from plan_log/.test(t)) {
    return [...planLog.entries()].filter(([k])=>k.startsWith(p[0]+'|'+p[1]+'|')).map(([k,n])=>({cls:k.split('|')[2],n}));
  }
  if (/^select cls from free_plan_reservations/.test(t)) {
    return [...reservations.values()].filter(r=>r.subject===p[0]&&r.period===p[1]&&r.expiresAt>p[2]&&r.kind!=='bonus').map(r=>({cls:r.cls}));
  }
  if (/^select id from free_plan_reservations/.test(t)) {
    return [...reservations.entries()].filter(([,r])=>r.subject===p[0]&&r.period===p[1]&&r.expiresAt>p[2]&&r.kind==='parent').map(([id])=>({id}));
  }
  if (/^select n from bonus/.test(t)) return bonus.has(p[0])?[{n:bonus.get(p[0])}]:[];
  if (/^WITH r AS \(SELECT subject, period, cls, kind FROM free_plan_reservations/.test(t)) {
    const r=reservations.get(p[0]); if(!r)return [];
    if(r.kind==='teacher'||r.kind==='parent'){const k=key(r.subject,r.period,r.cls);planLog.set(k,(planLog.get(k)||0)+1)}
    reservations.delete(p[0]);return [{kind:r.kind}];
  }
  if (/^WITH r AS \(DELETE FROM free_plan_reservations/.test(t)) {
    const r=reservations.get(p[0]);if(r){reservations.delete(p[0]);if(r.kind==='bonus')bonus.set(r.userId,(bonus.get(r.userId)||0)+1)}return [];
  }
  if (/^insert into events/.test(t)) return [];
  return [];
}};
process.env.DATABASE_URL='test';
process.env.FREE_PLANS_WEEKLY='2';
process.env.FREE_CLASSES='2';
process.env.FREE_PARENT_WEEKLY='1';
process.env.REWARDED_ADS='test';
const E=require('../api/_entitle');

(async()=>{
  const ent={uid:'teacher-1',subject:'u:teacher-1'};
  const attempts=await Promise.all(Array.from({length:8},()=>E.reserveFree(ent,'Basic 7')));
  const accepted=attempts.filter(x=>x.ok);
  assert.equal(accepted.length,2,'parallel requests cannot reserve more than the weekly allowance');
  await E.commitFree(accepted[0].reservation);
  await E.releaseFree(accepted[1].reservation);
  let next=await E.reserveFree(ent,'Basic 8');
  assert.equal(next.ok,true,'a released reservation restores the unused slot');
  await E.commitFree(next.reservation);
  next=await E.reserveFree(ent,'Basic 9');
  assert.equal(next.ok,false,'the class limit blocks a third distinct class');

  const parent={uid:'parent-1',subject:'u:parent-1'};
  const p=await E.reserveFreeParent(parent);
  assert.equal(p.ok,true);
  const p2=await E.reserveFreeParent(parent);
  assert.equal(p2.ok,false,'parent allowance counts in-flight reservations');
  await E.releaseFree(p.reservation);

  // Bonus plans are atomically deducted at reservation and restored on failure.
  bonus.set(ent.uid,1);
  const b=await E.reserveFree(ent,'Basic 7');
  assert.equal(b.ok,true);
  assert.equal(b.bonus,true);
  assert.equal(bonus.get(ent.uid),0);
  await E.releaseFree(b.reservation);
  assert.equal(bonus.get(ent.uid),1);
  console.log('Entitlement reservation tests passed.');
})().catch(e=>{console.error(e);process.exit(1)});
