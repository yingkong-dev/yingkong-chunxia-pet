// 莺空社区 · admission policy only; original Electron player owns decoding/buffers.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ChunxiaActionPolicy=factory();})(globalThis,()=>{
 const SOURCES={manual:0,click:1,status:2,audio:3,auto:3,idle:4};
 class Policy{
  constructor(){this.current=null;this.manual=false;this.trace=[];}
  request(action,source){
   if(!action||!Object.hasOwn(SOURCES,source))return false;
   const priority=source==='idle'?4:source==='auto'?Math.max(3,action.priority??3):SOURCES[source];
   const same=this.current?.id===action.id;
   if(this.current&&this.current.priority<priority||this.current&&!this.current.interruptible&&source!=='manual'&&priority>=this.current.priority)return this.record('skip',action,source);
   this.manual=source==='manual';this.current={id:action.id,name:action.name,priority,source,interruptible:action.interruptible,loop:action.loop};
   this.record(same?'same':'play',action,source);return same?'same':true;
  }
  record(result,a,source){this.trace.push({result,id:a.id,source});if(this.trace.length>48)this.trace.shift();return false;}
  release(){this.current=null;this.manual=false;}
 }
 function pickIdle(pool,last,rng=Math.random){const choices=pool.filter(id=>pool.length===1||id!==last);if(!choices.length)return null;return choices[Math.min(choices.length-1,Math.floor(Math.max(0,rng())*choices.length))];}
 return {Policy,SOURCES,pickIdle};
});
