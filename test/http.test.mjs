import test from 'node:test';import assert from 'node:assert/strict';import http from 'node:http';
import {request,jsonRequest,safeUrl} from '../lib/http.mjs';
const server=http.createServer((req,res)=>{
 if(req.url==='/wrong'){res.setHeader('Content-Type','text/html');res.end('<html>login</html>');}
 else if(req.url==='/redirect'){res.writeHead(302,{location:'/json'});res.end();}
 else if(req.url==='/large'){res.end('x'.repeat(1024));}
 else if(req.url==='/fail'){res.writeHead(503);res.end('upstream failed');}
 else if(req.url==='/malformed'){res.setHeader('Content-Type','application/json');res.end('{');}
 else {res.setHeader('Content-Type','application/json');res.end('{"ok":true}');}
});
await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const base=`http://127.0.0.1:${server.address().port}`;
test.after(()=>new Promise(resolve=>server.close(resolve)));
test('HTTP 200 containing a login/error page is not healthy JSON',async()=>{await assert.rejects(jsonRequest(base+'/wrong'),{code:'wrong_content_type'});});
test('redirects do not silently change check destinations',async()=>{await assert.rejects(request(base+'/redirect'),{code:'http_302'});});
test('downloads cannot exceed the configured byte budget',async()=>{await assert.rejects(request(base+'/large',{maxBytes:100}),{code:'response_too_large'});});
test('non-200 responses and malformed JSON fail',async()=>{await assert.rejects(jsonRequest(base+'/fail'),{code:'http_503'});await assert.rejects(jsonRequest(base+'/malformed'),{code:'invalid_json'});});
test('valid JSON is checked',async()=>{assert.deepEqual(await jsonRequest(base+'/json'),{ok:true});});
test('signed media destinations must use HTTPS and the allowlisted origin',()=>{
 assert.equal(safeUrl('https://media.example/a?signature=private',['https://media.example']).origin,'https://media.example');
 for(const url of ['http://media.example/a','https://evil.example/a','https://secret@media.example/a'])assert.throws(()=>safeUrl(url,['https://media.example']),{code:'unexpected_destination'});
});
