import {assert} from './http.mjs';
// Verify complete Layer III frames and duration without installing a codec on every runner.
// The source is a known one-second synthetic fixture; this does not assess recording quality.
export function validateConvertedMp3(bytes) {
 let offset=0;let frames=0;let duration=0;
 if(bytes.subarray(0,3).toString()==='ID3'){
  assert(bytes.length>=10 && [6,7,8,9].every(i=>bytes[i]<128),'converted_audio_invalid');
  offset=10+(bytes[6]<<21)+(bytes[7]<<14)+(bytes[8]<<7)+bytes[9];
 }
 const bitrates1=[0,32,40,48,56,64,80,96,112,128,160,192,224,256,320];
 const bitrates2=[0,8,16,24,32,40,48,56,64,80,96,112,128,144,160];
 while(offset+4<=bytes.length){
  if(bytes.subarray(offset,offset+3).toString()==='TAG' && bytes.length-offset===128)break;
  const header=bytes.readUInt32BE(offset);const version=(header>>>19)&3;const layer=(header>>>17)&3;const index=(header>>>12)&15;const sampleIndex=(header>>>10)&3;
  assert((header>>>21)===2047 && version!==1 && layer===1 && index>0 && index<15 && sampleIndex<3,'converted_audio_invalid');
  const rate=[44100,48000,32000][sampleIndex]/(version===3?1:version===2?2:4);
  const bitrate=(version===3?bitrates1:bitrates2)[index];
  const length=Math.floor((version===3?144000:72000)*bitrate/rate)+((header>>>9)&1);
  assert(length>=4 && offset+length<=bytes.length,'converted_audio_truncated');
  duration+=(version===3?1152:576)/rate;frames++;offset+=length;
 }
 assert(frames>=3 && duration>=0.8 && duration<=2,'converted_audio_duration_invalid');
 return {frames,duration};
}
