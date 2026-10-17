// 莺空社区 · small continuous playback watchdog; no task-state inference.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ChunxiaPlaybackHealth=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 class ProgressWatch{
  constructor(){this.reset();}
  reset(){this.key=null;this.time=null;this.frames=null;this.progressAt=0;this.frameAt=0;this.pendingAt=0;}
  observe(v,now){
   if(v.suspended){this.reset();return null;}
   if(this.key!==v.key){this.reset();this.key=v.key;this.progressAt=now;this.frameAt=now;this.pendingAt=now;}
   if(v.pending)return now-this.pendingAt>=11000?'加载超过11秒未完成':null;
   if(Number.isFinite(v.time)&&(this.time===null||Math.abs(v.time-this.time)>.015)){this.time=v.time;this.progressAt=now;}
   if(Number.isFinite(v.frames)&&(this.frames===null||v.frames!==this.frames)){this.frames=v.frames;this.frameAt=now;}
   if(v.error)return '视频解码错误';
   if(now-this.progressAt<5000)return null;
   if(v.paused)return '视频意外暂停超过5秒';
   if(v.readyState<3)return '视频缓冲超过5秒';
   if(v.ended)return '片尾未恢复播放';
   return '播放时间超过5秒未推进';
  }
 }
 return {ProgressWatch};
});
