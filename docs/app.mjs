import { CHECKS, LABELS } from './lib/catalog.mjs';
import { emptyState, effectiveStatus, overallStatus } from './lib/state.mjs';
const DATA_URL='https://raw.githubusercontent.com/ilevin1/shiurbank-status/refs/heads/monitor-data/state.json';
let state=emptyState();let warning='';let loading=false;
const $=selector=>document.querySelector(selector);
const date=value=>value?new Date(value).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'short'}):'Not checked yet';
function element(tag,className,text){const node=document.createElement(tag);if(className)node.className=className;if(text!==undefined)node.textContent=text;return node;}
function reasonText(result,status){if(status==='unknown')return 'Current availability is unverified. No recent successful observation is available.';if(result?.reason==='verified')return result.status==='degraded'?'A check passed; waiting for a second successful observation to confirm recovery.':'The most recent check passed.';if(result?.reason==='slow_response')return 'The check completed more slowly than its configured threshold.';return 'The check did not complete successfully. Results will be checked again on the next scheduled run.';}
function incidentNode(incident,active){const node=element('article',`incident${active?' active':''}`);node.append(element('h3','',incident.title));const line=element('p');line.append(element('span','tag',active?'Investigating':'Resolved'));line.append(document.createTextNode(` · ${date(incident.startedAt)}${incident.resolvedAt?` → ${date(incident.resolvedAt)}`:''}`));node.append(line);if(active)node.append(element('p','',`Automatic detection from repeated failed checks. Affected area: ${CHECKS.find(check=>check.id===incident.checkId)?.name || 'Service'}.`));return node;}
function render(){
 const now=Date.now();const overall=overallStatus(state,now);$('#overview').dataset.status=overall;
 $('#headline').textContent={operational:'All monitored services operational',degraded:'Some services are experiencing issues',outage:'Some services are unavailable',unknown:'Some service statuses are unverified',maintenance:'Scheduled maintenance'}[overall];
 $('#subhead').textContent=overall==='operational'?'Recent checks passed for the services listed below.':overall==='unknown'?'One or more checks are missing or older than their freshness limit.':'See the affected services and recent observations below.';
 $('#updated').textContent=`Last monitor run: ${date(state.generatedAt)}`;
 $('#data-warning').hidden=!warning;$('#data-warning').textContent=warning;
 const expanded=new Set([...document.querySelectorAll('details[open]')].map(node=>node.dataset.id));
 const list=$('#services');list.replaceChildren();
 for(const check of CHECKS){
  const result=state.checks[check.id];const status=effectiveStatus(check,result,now);
  const details=element('details','service');details.dataset.id=check.id;details.open=expanded.has(check.id);
  const summary=element('summary');summary.dataset.status=status;
  const name=element('span','service-name');const chevron=element('span','chevron','›');chevron.setAttribute('aria-hidden','true');name.append(chevron,document.createTextNode(check.name));
  const label=element('span','state');const dot=element('i');dot.setAttribute('aria-hidden','true');label.append(dot,document.createTextNode(LABELS[status] || 'Unknown'));summary.append(name,label);details.append(summary);
  const body=element('div','service-detail');body.append(element('p','',check.description),element('p','',reasonText(result,status)));
  const meta=element('div','check-meta');meta.append(element('span','',`Last checked: ${date(result?.checkedAt)}`),element('span','',`Every ${check.everyMinutes} minutes`));if(result?.durationMs!=null)meta.append(element('span','',`${(result.durationMs/1000).toFixed(2)}s response`));body.append(meta);
  const bars=element('div','bars');bars.setAttribute('aria-label','Observed check history for the last 30 UTC days');
  for(let offset=29;offset>=0;offset--){const key=new Date(now-offset*86400000).toISOString().slice(0,10);const bucket=result?.history?.[key];const bar=element('span','bar');const total=bucket?bucket.pass+bucket.fail+bucket.slow+bucket.unknown:0;const label=total?`${key}: ${bucket.pass} passed, ${bucket.slow} slow, ${bucket.fail} failed, ${bucket.unknown} unknown`:`${key}: no observations`;bar.dataset.state=!total||bucket.unknown===total?'unknown':bucket.fail?'fail':bucket.slow?'slow':'pass';bar.title=label;bar.setAttribute('aria-label',label);bars.append(bar);}body.append(bars);
  const labels=element('div','bar-labels');labels.append(element('span','','30 days ago'),element('span','','Today'));body.append(labels,element('p','small','Bars summarize observed checks, not continuous uptime. Gray days have no confirmed observations.'));
  details.append(body);list.append(details);
 }
 const active=$('#active-incidents');active.replaceChildren();const history=$('#history-list');history.replaceChildren();
 const open=(state.incidents||[]).filter(incident=>!incident.resolvedAt);
 if(open.length>1){const group=element('article','incident active');group.append(element('h3','',`${open.length} open service incidents`),element('p','tag','Repeated failed checks detected'),element('p','',open.map(incident=>CHECKS.find(check=>check.id===incident.checkId)?.name || 'Service').join(' · ')));active.append(group);}
 else if(open.length)active.append(incidentNode(open[0],true));
 for(const incident of state.incidents||[])if(incident.resolvedAt)history.append(incidentNode(incident,false));
 if(!history.children.length)history.append(element('p','empty',state.startedAt?`No resolved incidents recorded since monitoring began on ${date(state.startedAt)}.`:'History begins when the monitor records its first checks.'));
}
function validState(value){return value?.version===1&&value.checks&&typeof value.checks==='object'&&Array.isArray(value.incidents)&&typeof value.generatedAt==='string'&&Number.isFinite(Date.parse(value.generatedAt));}
async function refresh(){
 if(loading)return;loading=true;$('#refresh').disabled=true;
 try{const response=await fetch(`${DATA_URL}?t=${Date.now()}`,{cache:'no-store',signal:AbortSignal.timeout(12000)});if(!response.ok)throw new Error();const value=await response.json();if(!validState(value))throw new Error();state=value;warning='';try{localStorage.setItem('shiurbank-status-v1',JSON.stringify(state));}catch{}}
 catch{warning=state.generatedAt?'The latest observations could not be retrieved. Showing the last available results; freshness limits still apply.':'The monitor’s observations are currently unavailable. Service availability is unknown.';}
 finally{loading=false;$('#refresh').disabled=false;render();}
}
try{const saved=JSON.parse(localStorage.getItem('shiurbank-status-v1'));if(validState(saved))state=saved;}catch{}
$('#refresh').addEventListener('click',refresh);render();refresh();setInterval(refresh,60000);setInterval(render,15000);
document.addEventListener('visibilitychange',()=>{if(!document.hidden){render();refresh();}});
window.addEventListener('pageshow',()=>{render();refresh();});
