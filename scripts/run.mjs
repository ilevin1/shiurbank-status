import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { CHECKS } from '../lib/catalog.mjs';
import { emptyState, isDue, applyResults } from '../lib/state.mjs';
import { createProbes, executeCheck } from '../lib/probes.mjs';
import { requestStats } from '../lib/http.mjs';
const env = process.env;
const publish = process.argv.includes('--publish');
const force = process.argv.includes('--force');
const only = process.argv.find(arg=>arg.startsWith('--only='))?.slice(7).split(',');
const repository = 'ilevin1/shiurbank-status';
async function github(route,options={}) {
  if(!env.GH_TOKEN) throw new Error('GH_TOKEN required for publication');
  const response=await fetch(`https://api.github.com/repos/${repository}${route}`,{...options,headers:{Authorization:`Bearer ${env.GH_TOKEN}`,Accept:'application/vnd.github+json','X-GitHub-Api-Version':'2022-11-28',...(options.headers||{})}});
  if(!response.ok)throw new Error(`GitHub state operation failed (${response.status})`);
  return response.json();
}
let prior=emptyState();let sha;
if(publish) {
  const stored=await github('/contents/state.json?ref=monitor-data');
  prior=JSON.parse(Buffer.from(stored.content,'base64').toString('utf8'));sha=stored.sha;
} else {
  try{prior=JSON.parse(await readFile('output/state.json','utf8'));}catch(error){if(error.code!=='ENOENT')throw error;}
}
const now=Date.now();
const {probes,closeSessions}=createProbes(env);
const selected=CHECKS.filter(check=>(!only||only.includes(check.id))&&(force||isDue(check,prior.checks[check.id],now)));
const results=[];
// Reads run concurrently; fixture writes are sequential so cleanup never races another upload.
results.push(...await Promise.all(selected.filter(check=>!check.id.startsWith('upload-')).map(check=>executeCheck(check,probes[check.id]))));
for(const check of selected.filter(check=>check.id.startsWith('upload-'))) results.push(await executeCheck(check,probes[check.id]));
try { await closeSessions(); }
catch {
  const result={id:'auth',outcome:'fail',reason:'auth_signout_failed',durationMs:0};
  const index=results.findIndex(item=>item.id==='auth');
  if(index<0)results.push(result);else results[index]=result;
}
const state=applyResults(prior,results,Date.now());
await mkdir('output',{recursive:true});
await writeFile('output/state.json',JSON.stringify(state,null,2)+'\n');
for(const result of results) console.log(`${result.id}: ${result.outcome} (${result.reason}, ${result.durationMs} ms)`);
console.log('Request footprint (response bytes, excluding protocol overhead):',JSON.stringify(requestStats()));
if(publish) {
  await github('/contents/state.json',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify({branch:'monitor-data',sha,message:`Service checks ${state.generatedAt}`,content:Buffer.from(JSON.stringify(state)+'\n').toString('base64')})});
  console.log('Sanitized observations published to independent monitor-data branch.');
}
if(results.some(result=>result.outcome==='fail')) process.exitCode=1;
