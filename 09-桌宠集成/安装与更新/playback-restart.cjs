// 莺空社区 · bounded escalation for repeated real decoder failures, no task inference.
const fs=require('node:fs');
class PlaybackRestart{
 constructor(file,now=Date.now){this.file=file;this.now=now;this.pending=false;}
 request(){
  const now=this.now();let previous=0;try{previous=JSON.parse(fs.readFileSync(this.file,'utf8')).at||0;}catch{}
  if(this.pending||previous>now||now-previous<300000)return{accepted:false,reason:'播放进程重建冷却中'};
  fs.writeFileSync(this.file,JSON.stringify({at:now,reason:'连续两次真实视频解码错误，重建播放进程'}));this.pending=true;
  return{accepted:true};
 }
}
module.exports={PlaybackRestart};
