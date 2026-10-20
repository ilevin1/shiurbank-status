import test from 'node:test';import assert from 'node:assert/strict';import {readFile} from 'node:fs/promises';import {validateConvertedMp3} from '../lib/media.mjs';
const mp3=await readFile(new URL('../fixtures/tone.mp3',import.meta.url));
test('the synthetic source contains complete MP3 frames and a one-second duration',()=>{const result=validateConvertedMp3(mp3);assert.ok(result.frames>=3);assert.ok(result.duration>=0.8&&result.duration<=2);});
test('truncated or fabricated audio cannot pass conversion verification',()=>{
 assert.throws(()=>validateConvertedMp3(Buffer.from('ID3'+'x'.repeat(1200))));
 assert.throws(()=>validateConvertedMp3(mp3.subarray(0,mp3.length-20)));
 assert.throws(()=>validateConvertedMp3(Buffer.alloc(1197)));
});
