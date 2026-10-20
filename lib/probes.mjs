import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { CHECKS } from './catalog.mjs';
import { assert, CheckError, request, jsonRequest, safeUrl } from './http.mjs';
import { validateConvertedMp3 } from './media.mjs';

const REQUIRED = ['SUPABASE_URL','SUPABASE_ANON_KEY','MONITOR_EMAIL','MONITOR_PASSWORD','MONITOR_USER_ID','MONITOR_SERIES_ID','MONITOR_SHIUR_ID','PUBLIC_SERIES_ID','PUBLIC_TEACHER_ID','SEARCH_QUERY','MEDIA_ORIGIN'];
export function createProbes(env, transport = { request, jsonRequest }) {
  const web = env.WEB_BASE || 'https://www.shiurbank.org';
  const api = env.API_BASE || 'https://shiurbank-production.up.railway.app';
  safeUrl(web, ['https://www.shiurbank.org']); safeUrl(api, ['https://shiurbank-production.up.railway.app']);
  const req = transport.request; const json = transport.jsonRequest;
  let sessionPromise;
  const sessions = [];
  const headers = token => ({ Authorization: `Bearer ${token}` });
  const post = (base, route, payload, token, options = {}) => json(`${base}${route}`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', ...(token ? headers(token) : {}) }, body: JSON.stringify(payload), expected: [200,201], ...options,
  });
  function configured(...names) { for (const name of names) if (!env[name]) throw new CheckError('not_configured'); }
  async function session() {
    configured('SUPABASE_URL','SUPABASE_ANON_KEY','MONITOR_EMAIL','MONITOR_PASSWORD','MONITOR_USER_ID');
    if (!sessionPromise) sessionPromise = (async()=>{
      const authOrigin = 'https://ztihjogbjwgrwgwwvgil.supabase.co';
      safeUrl(env.SUPABASE_URL, [authOrigin]);
      const options = { method:'POST',headers:{ apikey:env.SUPABASE_ANON_KEY,'Content-Type':'application/json' },body:JSON.stringify({email:env.MONITOR_EMAIL,password:env.MONITOR_PASSWORD}) };
      const signIn = await json(`${authOrigin}/auth/v1/token?grant_type=password`,options);
      const tracked = typeof signIn.access_token === 'string' ? { token: signIn.access_token } : null;
      if(tracked) sessions.push(tracked);
      assert(signIn.user?.id === env.MONITOR_USER_ID && typeof signIn.access_token === 'string' && typeof signIn.refresh_token === 'string','invalid_auth_session');
      const refreshed = await json(`${authOrigin}/auth/v1/token?grant_type=refresh_token`,{...options,body:JSON.stringify({refresh_token:signIn.refresh_token})});
      assert(refreshed.user?.id === env.MONITOR_USER_ID && typeof refreshed.access_token === 'string','invalid_auth_refresh');
      tracked.token = refreshed.access_token;
      return refreshed.access_token;
    })().catch(error => { sessionPromise = undefined; throw error; });
    return sessionPromise;
  }
  async function catalog(base) {
    configured('PUBLIC_SERIES_ID');
    const series = await json(`${base}/api/series/${env.PUBLIC_SERIES_ID}`);
    assert(series.data?.id === env.PUBLIC_SERIES_ID && series.data?.privacy_level === 'public','catalog_fixture_missing');
    const list = await json(`${base}/api/shiurim?series_id=${env.PUBLIC_SERIES_ID}&limit=1`);
    assert(Array.isArray(list.data) && list.data.length > 0 && list.data[0].series_id === env.PUBLIC_SERIES_ID,'catalog_payload_invalid');
  }
  async function audioUrl(shiurId, token, base = api) {
    const shiur = await json(`${base}/api/shiurim/${shiurId}`,{headers:headers(token)});
    assert(shiur.data?.id === shiurId && typeof shiur.data?.file_key === 'string','audio_record_invalid');
    const key = shiur.data.file_key;
    assert(key.startsWith(`shiurim/${env.MONITOR_SERIES_ID}/`),'audio_outside_fixture');
    const signed = await json(`${base}/api/shiurim/signed-url/${encodeURI(key)}`,{headers:headers(token)});
    return safeUrl(signed.signedUrl,[env.MEDIA_ORIGIN]);
  }
  async function audioBytes(shiurId, token, expectedBytes, base = api) {
    const url = await audioUrl(shiurId,token,base);
    for (const [start,end] of [[0,127],[512,639]]) {
      const part = await req(url,{ headers:{Range:`bytes=${start}-${end}`,Origin:web},expected:[206],maxBytes:128 });
      assert(part.headers.get('content-range') === `bytes ${start}-${end}/${expectedBytes.length}`,'audio_range_invalid');
      assert([web,'*'].includes(part.headers.get('access-control-allow-origin')),'audio_cors_invalid');
      assert(part.bytes.equals(expectedBytes.subarray(start,end+1)),'audio_bytes_mismatch');
    }
  }
  async function fixture() { return readFile(new URL('../fixtures/tone.mp3',import.meta.url)); }
  async function cleanupAbandoned(token) {
    const list = await json(`${api}/api/shiurim?series_id=${env.MONITOR_SERIES_ID}&limit=50`,{headers:headers(token)});
    assert(Array.isArray(list.data),'fixture_listing_invalid');
    const stale = list.data.filter(row => row.id !== env.MONITOR_SHIUR_ID && row.series_id === env.MONITOR_SERIES_ID && /^Status check [0-9a-f-]{36}$/.test(row.title) && Date.now()-Date.parse(row.upload_date)>20*60000);
    assert(stale.length <= 10,'fixture_cleanup_backlog');
    for(const row of stale) await json(`${api}/api/shiurim/${row.id}/permanent`,{method:'DELETE',headers:headers(token)});
  }
  async function upload(mode) {
    configured(...REQUIRED);
    if(env.ENABLE_UPLOAD_CHECKS !== 'true') throw new CheckError('not_enabled');
    const token = await session();
    // Fail closed if the fixture ever becomes public or moves to a different teacher.
    const series = await json(`${api}/api/series/${env.MONITOR_SERIES_ID}`,{headers:headers(token)});
    assert(series.data?.privacy_level === 'private' && series.data?.rebbe_id === env.MONITOR_TEACHER_ID,'unsafe_upload_fixture');
    await cleanupAbandoned(token);
    const bytes = await fixture(); const title = `Status check ${randomUUID()}`;
    let uploaded; let shiurId; let failure;
    try {
      if(mode === 'direct') {
        uploaded = await post(web,'/api/shiurim/presign-upload',{series_id:env.MONITOR_SERIES_ID,filename:'status-check.mp3',content_type:'audio/mpeg',file_size:bytes.length},token);
        assert(uploaded.fileKey?.startsWith(`shiurim/${env.MONITOR_SERIES_ID}/`) && uploaded.uploadReservationId,'upload_response_invalid');
        const preflight = await req(safeUrl(uploaded.uploadUrl,[env.MEDIA_ORIGIN]),{method:'OPTIONS',headers:{Origin:web,'Access-Control-Request-Method':'PUT','Access-Control-Request-Headers':'content-type,x-amz-meta-series-id,x-amz-meta-uploader-user-id'},expected:[200,204],maxBytes:4096});
        assert([web,'*'].includes(preflight.headers.get('access-control-allow-origin')) && /\bPUT\b/i.test(preflight.headers.get('access-control-allow-methods') || ''),'upload_cors_invalid');
        const allowed = (preflight.headers.get('access-control-allow-headers') || '').toLowerCase().split(',').map(value=>value.trim());
        assert(allowed.includes('*') || ['content-type','x-amz-meta-series-id','x-amz-meta-uploader-user-id'].every(name=>allowed.includes(name)),'upload_cors_invalid');
        await req(safeUrl(uploaded.uploadUrl,[env.MEDIA_ORIGIN]),{method:'PUT',headers:uploaded.headers,body:bytes,expected:[200],maxBytes:4096});
      } else {
        const source = await readFile(new URL('../fixtures/tone.m4a',import.meta.url));
        const form = new FormData(); form.set('file',new Blob([source],{type:'audio/mp4'}),'status-check.m4a');form.set('series_id',env.MONITOR_SERIES_ID);
        uploaded = await json(`${api}/api/shiurim/upload`,{method:'POST',headers:headers(token),body:form,timeoutMs:60000});
        assert(uploaded.fileKey?.startsWith(`shiurim/${env.MONITOR_SERIES_ID}/`) && uploaded.uploadReservationId,'upload_response_invalid');
        assert(uploaded.converted === true && uploaded.fileType === 'audio/mpeg' && uploaded.fileSize>600 && uploaded.fileSize<65536,'conversion_not_confirmed');
      }
      const created = await post(mode === 'direct' ? web : api,'/api/shiurim',{
        series_id:env.MONITOR_SERIES_ID,title,file_url:uploaded.fileUrl,file_key:uploaded.fileKey,file_type:'audio/mpeg',file_size:mode==='direct'?bytes.length:uploaded.fileSize,duration:1,suppress_notification:true,upload_reservation_id:uploaded.uploadReservationId,
      },token);
      shiurId = created.data?.[0]?.id;
      assert(typeof shiurId === 'string','publication_not_confirmed');
      if(mode==='direct') await audioBytes(shiurId,token,bytes);
      else {
        const converted = await req(await audioUrl(shiurId,token),{headers:{Origin:web},maxBytes:65536});
        assert(converted.bytes.length === uploaded.fileSize,'converted_audio_size_mismatch');
        validateConvertedMp3(converted.bytes);
        await audioBytes(shiurId,token,converted.bytes);
      }
    } catch(error) { failure = error; }
    // Cleanup is part of success. Never report a healthy check when cleanup fails.
    try {
      if(shiurId) {
        await json(`${api}/api/shiurim/${shiurId}/permanent`,{method:'DELETE',headers:headers(token)});
        await req(`${api}/api/shiurim/${shiurId}`,{headers:headers(token),expected:[404],maxBytes:8192});
      } else if(uploaded?.fileKey && uploaded?.uploadReservationId) {
        // A lost create response may have published the row. Discover ONLY this fixture/key.
        const list = await json(`${api}/api/shiurim?series_id=${env.MONITOR_SERIES_ID}&limit=50`,{headers:headers(token)});
        const found = list.data?.find(row => row.file_key === uploaded.fileKey && row.series_id === env.MONITOR_SERIES_ID && row.title === title);
        if(found) await json(`${api}/api/shiurim/${found.id}/permanent`,{method:'DELETE',headers:headers(token)});
        else await post(api,'/api/shiurim/orphan-upload',{series_id:env.MONITOR_SERIES_ID,file_key:uploaded.fileKey,upload_reservation_id:uploaded.uploadReservationId},token);
      }
    } catch { throw new CheckError('upload_cleanup_failed'); }
    if(failure) throw failure;
  }
  const probes = {
    async website() {
      const page = await req(web,{maxBytes:512*1024});
      assert(page.headers.get('content-type')?.includes('text/html') && /ShiurBank/i.test(page.text()),'website_content_invalid');
      const tag = [...page.text().matchAll(/<script\b[^>]*>/gi)].map(match=>match[0]).find(value=>/\btype=["']module["']/i.test(value) && /\bsrc=/i.test(value));
      const src = tag?.match(/\bsrc=["']([^"']+)["']/i)?.[1];
      assert(src,'website_bundle_missing');
      const script = await req(safeUrl(new URL(src,web).href,[web]),{headers:{Range:'bytes=0-1023'},expected:[200,206],maxBytes:4096});
      assert(/javascript/.test(script.headers.get('content-type') || '') && script.bytes.length > 100,'website_bundle_invalid');
    },
    'catalog-web':()=>catalog(web),
    'catalog-mobile':()=>catalog(api),
    async search() {
      configured('SEARCH_QUERY','PUBLIC_TEACHER_ID');
      const result = await json(`${web}/api/search?q=${encodeURIComponent(env.SEARCH_QUERY)}&type=teachers&limit=10`);
      assert(Array.isArray(result.results) && result.results.some(row => row.id === env.PUBLIC_TEACHER_ID),'search_expected_result_missing');
    },
    async auth() {
      const token = await session();
      const profile = await json(`${api}/api/users/me/bootstrap`,{headers:headers(token)});
      assert(profile.data?.user?.id === env.MONITOR_USER_ID && profile.data.user.is_owner !== true,'profile_identity_invalid');
      configured('MONITOR_SHIUR_ID');
      await req(`${api}/api/shiurim/${env.MONITOR_SHIUR_ID}`,{expected:[401,403,404],maxBytes:8192});
    },
    async audio() { configured('MONITOR_SHIUR_ID','MONITOR_SERIES_ID','MEDIA_ORIGIN'); await audioBytes(env.MONITOR_SHIUR_ID,await session(),await fixture()); },
    async downloads() {
      configured('MONITOR_SHIUR_ID');
      const response = await req(`${web}/api/shiurim/${env.MONITOR_SHIUR_ID}/download`,{headers:headers(await session()),timeoutMs:40000,maxBytes:128*1024});
      assert(/audio\//.test(response.headers.get('content-type') || '') && /attachment/i.test(response.headers.get('content-disposition') || ''),'download_headers_invalid');
      assert(response.bytes.length > 600 && (response.bytes.subarray(0,3).toString() === 'ID3' || response.bytes[0]===255),'download_audio_invalid');
      assert(response.bytes.includes((await fixture()).subarray(200,500)),'download_audio_mismatch');
    },
    'upload-direct':()=>upload('direct'),
    'upload-server':()=>upload('server'),
  };
  async function closeSessions() {
    let failed=false;
    for(const tracked of sessions){
      try { await req(`${env.SUPABASE_URL}/auth/v1/logout?scope=local`,{method:'POST',headers:{apikey:env.SUPABASE_ANON_KEY,...headers(tracked.token)},expected:[200,204],maxBytes:4096}); }
      catch { failed=true; }
    }
    sessions.length=0;sessionPromise=undefined;
    if(failed)throw new CheckError('auth_signout_failed');
  }
  return {probes,session,closeSessions};
}
export async function executeCheck(check, probe, { retry = true, sleep = ms => new Promise(resolve=>setTimeout(resolve,ms)) } = {}) {
  const start = performance.now();
  try {
    try { await probe(); }
    catch(error) {
      if(!retry || check.id.startsWith('upload-') || ['not_enabled','not_configured','unsafe_upload_fixture','unexpected_destination'].includes(error.code)) throw error;
      await sleep(1500); await probe();
    }
    const durationMs=Math.round(performance.now()-start);
    return {id:check.id,outcome:durationMs>check.slowMs?'slow':'pass',durationMs,reason:durationMs>check.slowMs?'slow_response':'verified'};
  } catch(error) {
    const code=error instanceof CheckError?error.code:'check_error';
    // Public output is an allowlisted code only, never response bodies, URLs or credentials.
    return {id:check.id,outcome:['not_enabled','not_configured'].includes(code)?'unknown':'fail',durationMs:Math.round(performance.now()-start),reason:code};
  }
}
