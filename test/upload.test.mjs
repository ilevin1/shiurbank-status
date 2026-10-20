import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
import {createProbes} from '../lib/probes.mjs';import {CheckError} from '../lib/http.mjs';
const bytes=await readFile(new URL('../fixtures/tone.mp3',import.meta.url));
const env={SUPABASE_URL:'https://ztihjogbjwgrwgwwvgil.supabase.co',SUPABASE_ANON_KEY:'fake',MONITOR_EMAIL:'fake',MONITOR_PASSWORD:'fake',MONITOR_USER_ID:'monitor',MONITOR_SERIES_ID:'private',MONITOR_TEACHER_ID:'teacher',MONITOR_SHIUR_ID:'permanent',PUBLIC_SERIES_ID:'public',PUBLIC_TEACHER_ID:'public-teacher',SEARCH_QUERY:'fixture',MEDIA_ORIGIN:'https://media.example',ENABLE_UPLOAD_CHECKS:'true'};
function harness({lostCreate=false,cleanupFails=false,wrongBytes=false,badCors=false}={}){
 let created=false;let removed=false;let notified=false;let writes=0;let generatedTitle;
 const key='shiurim/private/test.mp3';
 const uploaded={fileKey:key,uploadReservationId:'reservation',uploadUrl:'https://media.example/test?private-signature=secret',fileUrl:'https://media.example/test',headers:{'Content-Type':'audio/mpeg'}};
 const transport={
  async jsonRequest(url,options={}){
   const route=new URL(url).pathname;
   if(route.startsWith('/auth/v1/token'))return{user:{id:'monitor'},access_token:'fake',refresh_token:'fake'};
   if(route==='/api/series/private')return{data:{privacy_level:'private',rebbe_id:'teacher'}};
   if(route==='/api/shiurim'&&options.method!=='POST')return{data:created&&!removed?[{id:'generated',series_id:'private',file_key:key,title:generatedTitle,upload_date:new Date().toISOString()}]:[]};
   if(route==='/api/shiurim/presign-upload'||route==='/api/shiurim/upload'){writes++;return uploaded;}
   if(route==='/api/shiurim'&&options.method==='POST'){
    const body=JSON.parse(options.body);assert.equal(body.suppress_notification,true);assert.deepEqual(options.expected,[200,201]);notified=body.suppress_notification!==true;created=true;generatedTitle=body.title;
    if(lostCreate)throw new CheckError('network_or_timeout');return{data:[{id:'generated'}]};
   }
   if(route==='/api/shiurim/generated'&&options.method!=='DELETE')return{data:{id:'generated',series_id:'private',file_key:key}};
   if(route.startsWith('/api/shiurim/signed-url/'))return{signedUrl:'https://media.example/test?private-signature=secret'};
   if(route==='/api/shiurim/generated/permanent'){
    if(cleanupFails)throw new CheckError('http_503');assert.ok(created);removed=true;return{data:{id:'generated'}};
   }
   throw new Error('Unexpected request in fixture: '+route);
  },
  async request(url,options={}){
   if(new URL(url).origin==='https://media.example'){
    if(options.method==='OPTIONS')return{headers:new Headers({'access-control-allow-origin':badCors?'https://wrong.example':'https://www.shiurbank.org','access-control-allow-methods':'PUT','access-control-allow-headers':'*'}),bytes:Buffer.alloc(0)};
    if(options.method==='PUT')return{bytes:Buffer.alloc(0)};
    const [start,end]=options.headers.Range.replace('bytes=','').split('-').map(Number);
    return{headers:new Headers({'content-range':`bytes ${start}-${end}/${bytes.length}`,'access-control-allow-origin':'https://www.shiurbank.org'}),bytes:wrongBytes?Buffer.alloc(end-start+1):bytes.subarray(start,end+1)};
   }
   assert.ok(removed);assert.deepEqual(options.expected,[404]);return{status:404};
  }
 };
 return{probes:createProbes(env,transport).probes,state:()=>({created,removed,notified,writes})};
}
test('direct and server uploads publish privately, verify actual audio, and clean up',async()=>{
 for(const name of ['upload-direct','upload-server']){const run=harness();await run.probes[name]();assert.deepEqual(run.state(),{created:true,removed:true,notified:false,writes:1});}
});
test('a lost create response is reconciled and cleaned up without a duplicate publication',async()=>{
 const run=harness({lostCreate:true});await assert.rejects(run.probes['upload-direct'](),{code:'network_or_timeout'});assert.deepEqual(run.state(),{created:true,removed:true,notified:false,writes:1});
});
test('a cleanup failure is a failed upload check',async()=>{
 const run=harness({cleanupFails:true});await assert.rejects(run.probes['upload-direct'](),{code:'upload_cleanup_failed'});assert.equal(run.state().removed,false);
});
test('wrong storage bytes fail even with a valid HTTP range response',async()=>{
 const run=harness({wrongBytes:true});await assert.rejects(run.probes['upload-direct'](),{code:'audio_bytes_mismatch'});assert.equal(run.state().removed,true);
});
test('browser upload CORS failure stops before any publication',async()=>{
 const run=harness({badCors:true});
 // The orphan cleanup endpoint is intentionally absent in this mock: even if cleanup
 // cannot complete, an invalid browser upload must never be declared healthy.
 await assert.rejects(run.probes['upload-direct']());assert.equal(run.state().created,false);
});
