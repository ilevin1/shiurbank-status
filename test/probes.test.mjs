import test from 'node:test';import assert from 'node:assert/strict';
import { createProbes,executeCheck } from '../lib/probes.mjs';import { CheckError } from '../lib/http.mjs';import { CHECKS } from '../lib/catalog.mjs';
const check=CHECKS[0];
test('a real failing service is retried and then reported failed',async()=>{
 let calls=0;const result=await executeCheck(check,async()=>{calls++;throw new CheckError('http_503');},{sleep:async()=>{}});
 assert.equal(calls,2);assert.equal(result.outcome,'fail');assert.equal(result.reason,'http_503');
});
test('a transient first request can recover on retry',async()=>{
 let calls=0;const result=await executeCheck(check,async()=>{if(++calls===1)throw new CheckError('network_or_timeout');},{sleep:async()=>{}});assert.equal(calls,2);assert.equal(result.outcome,'pass');
});
test('write checks are not automatically retried after an ambiguous mutation',async()=>{
 let calls=0;const result=await executeCheck(CHECKS.find(c=>c.id==='upload-direct'),async()=>{calls++;throw new CheckError('network_or_timeout');},{sleep:async()=>{}});assert.equal(calls,1);assert.equal(result.outcome,'fail');
});
test('unconfigured and disabled probes are unknown, never green',async()=>{
 for(const code of ['not_configured','not_enabled']){const result=await executeCheck(check,async()=>{throw new CheckError(code);});assert.equal(result.outcome,'unknown');}
});
test('unexpected exceptions cannot disclose response bodies or secrets',async()=>{
 const secret='password-and-signed-url';const result=await executeCheck(check,async()=>{throw new Error(secret);},{sleep:async()=>{}});assert.equal(result.reason,'check_error');assert.ok(!JSON.stringify(result).includes(secret));
});
test('a valid HTTP response with the wrong catalog identity fails',async()=>{
 const {probes}=createProbes({PUBLIC_SERIES_ID:'expected'}, {jsonRequest:async()=>({data:{id:'wrong',privacy_level:'public'}})});
 await assert.rejects(probes['catalog-web'](),{code:'catalog_fixture_missing'});
});
test('an empty search result does not pass',async()=>{
 const {probes}=createProbes({SEARCH_QUERY:'fixture',PUBLIC_TEACHER_ID:'known'}, {jsonRequest:async()=>({results:[]})});await assert.rejects(probes.search(),{code:'search_expected_result_missing'});
});
test('a public or moved upload fixture cannot receive writes',async()=>{
 const env={SUPABASE_URL:'https://ztihjogbjwgrwgwwvgil.supabase.co',SUPABASE_ANON_KEY:'fake',MONITOR_EMAIL:'fake',MONITOR_PASSWORD:'fake',MONITOR_USER_ID:'fake',MONITOR_SERIES_ID:'private',MONITOR_TEACHER_ID:'teacher',MONITOR_SHIUR_ID:'audio',PUBLIC_SERIES_ID:'public',PUBLIC_TEACHER_ID:'public-teacher',SEARCH_QUERY:'fixture',MEDIA_ORIGIN:'https://media.example',ENABLE_UPLOAD_CHECKS:'true'};
 let writes=0;const {probes}=createProbes(env,{jsonRequest:async(url,options={})=>{
  if(url.includes('/auth/v1/token'))return{user:{id:'fake'},access_token:'fake',refresh_token:'fake'};
  if(options.method==='POST')writes++;
  return{data:{privacy_level:'public',rebbe_id:'teacher'}};
 }});
 await assert.rejects(probes['upload-direct'](),{code:'unsafe_upload_fixture'});assert.equal(writes,0);
});
test('the website check follows the actual module URL and requests only a bounded byte range',async()=>{
 const calls=[];const {probes}=createProbes({}, {request:async(url,options={})=>{
  calls.push({url:String(url),options});
  if(calls.length===1)return{headers:new Headers({'content-type':'text/html'}),text:()=>'<title>ShiurBank</title><script type="module" crossorigin src="/app-assets/renamed-version.js"></script>'};
  return{headers:new Headers({'content-type':'application/javascript'}),bytes:Buffer.alloc(1024)};
 }});await probes.website();assert.ok(calls[1].url.endsWith('/app-assets/renamed-version.js'));assert.equal(calls[1].options.headers.Range,'bytes=0-1023');assert.equal(calls[1].options.maxBytes,4096);
});
