import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';
test('browser and monitor use identical status definitions and freshness rules',async()=>{
 for(const name of ['catalog','state'])assert.equal(await readFile(new URL(`../lib/${name}.mjs`,import.meta.url),'utf8'),await readFile(new URL(`../docs/lib/${name}.mjs`,import.meta.url),'utf8'));
});
test('published page cannot call ShiurBank to determine its own status',async()=>{
 const code=await readFile(new URL('../docs/app.mjs',import.meta.url),'utf8');assert.equal((code.match(/fetch\(/g)||[]).length,1);assert.ok(code.includes('raw.githubusercontent.com/ilevin1/shiurbank-status'));assert.ok(!code.includes('innerHTML'));
});
