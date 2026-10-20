import test from 'node:test';
import assert from 'node:assert/strict';
import { CHECKS } from '../lib/catalog.mjs';
import { emptyState, applyResults, isDue, effectiveStatus, overallStatus } from '../lib/state.mjs';
const start=Date.parse('2026-10-20T12:00:00Z');
const observation=(outcome,id='website')=>({id,outcome,durationMs:40,reason:outcome==='pass'?'verified':'http_503'});
test('two failed scheduled observations open one incident, two successes resolve it',()=>{
 let state=applyResults(emptyState(),[observation('fail')],start);
 assert.equal(state.checks.website.status,'degraded');assert.equal(state.incidents.length,0);
 state=applyResults(state,[observation('fail')],start+300000);
 assert.equal(state.checks.website.status,'outage');assert.equal(state.incidents.length,1);
 state=applyResults(state,[observation('fail')],start+600000);assert.equal(state.incidents.length,1);
 state=applyResults(state,[observation('pass')],start+900000);assert.equal(state.checks.website.status,'degraded');assert.equal(state.incidents[0].resolvedAt,null);
 state=applyResults(state,[observation('pass')],start+1200000);assert.equal(state.checks.website.status,'operational');assert.ok(state.incidents[0].resolvedAt);
});
test('unknown evidence never resolves a known incident',()=>{
 let state=applyResults(emptyState(),[observation('fail')],start);state=applyResults(state,[observation('fail')],start+300000);state=applyResults(state,[observation('unknown')],start+600000);
 assert.equal(state.checks.website.status,'unknown');assert.equal(state.incidents[0].resolvedAt,null);
});
test('an unavailable monitor becomes unknown while the static page can keep serving',()=>{
 const state=applyResults(emptyState(),CHECKS.map(check=>observation('pass',check.id)),start);
 assert.equal(overallStatus(state,start),'operational');assert.equal(overallStatus(state,start+21*60000),'unknown');
 assert.equal(effectiveStatus(CHECKS.find(check=>check.id==='upload-direct'),state.checks['upload-direct'],start+61*60000),'operational');
 assert.equal(effectiveStatus(CHECKS.find(check=>check.id==='upload-direct'),state.checks['upload-direct'],start+131*60000),'unknown');
});
test('an outage takes precedence over unrelated unknown results',()=>{
 let state=applyResults(emptyState(),[observation('fail')],start);state=applyResults(state,[observation('fail')],start+300000);
 assert.equal(overallStatus(state,start+300000),'outage');
});
test('hourly checks are not silently replaced by a skipped run',()=>{
 const check=CHECKS.find(check=>check.id==='upload-direct');let state=applyResults(emptyState(),[observation('pass',check.id)],start);
 assert.equal(isDue(check,state.checks[check.id],start+5*60000),false);assert.equal(isDue(check,state.checks[check.id],start+60*60000),true);
 state=applyResults(state,[observation('pass')],start+5*60000);assert.equal(state.checks[check.id].checkedAt,new Date(start).toISOString());
});
test('history records only actual observations and retains no invented past days',()=>{
 const state=applyResults(emptyState(),[observation('pass')],start);assert.deepEqual(Object.keys(state.checks.website.history),['2026-10-20']);assert.equal(state.checks.website.history['2026-10-20'].pass,1);assert.equal(state.checks.auth,undefined);
});
test('future and invalid timestamps fail closed',()=>{
 assert.equal(effectiveStatus(CHECKS[0],{checkedAt:'invalid',status:'operational'},start),'unknown');
 assert.equal(effectiveStatus(CHECKS[0],{checkedAt:new Date(start+120000).toISOString(),status:'operational'},start),'unknown');
});
