// 莺空社区 · F41. Shared pure settings/timeline; two extrema, no translation.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ChunxiaTongtou=factory();})(typeof globalThis!=='undefined'?globalThis:this,()=>{
 'use strict';
 const DEFAULT={enabled:false,cycleMs:800,intensity:1,squashX:1.12,squashY:.85,stretchX:.94,stretchY:1.10};
 const ANCHOR={x:.5,y:1}; // Bottom center: the entire rendered picture stays above this point.
 const finite=n=>typeof n==='number'&&Number.isFinite(n),clamp=(n,lo,hi)=>Math.min(hi,Math.max(lo,n));
 function settings(v={}){if(!v||typeof v!=='object'||Array.isArray(v))v={};const o={...DEFAULT};if(typeof v.enabled==='boolean')o.enabled=v.enabled;
  const limits={cycleMs:[300,5000],intensity:[.25,2],squashX:[1,1.3],squashY:[.65,1],stretchX:[.7,1],stretchY:[1,1.3]};
  for(const [k,[lo,hi]]of Object.entries(limits))if(finite(v[k]))o[k]=clamp(v[k],lo,hi);return o;}
 function extrema(cfg,intensity=cfg.intensity){return [{x:1+(cfg.squashX-1)*intensity,y:1+(cfg.squashY-1)*intensity},{x:1+(cfg.stretchX-1)*intensity,y:1+(cfg.stretchY-1)*intensity}];}
 // Exact CSS ease-in-out cubic Bezier (.42,0,.58,1), bounded and monotonic.
 function ease(x){x=clamp(x,0,1);let lo=0,hi=1,t=x;for(let i=0;i<24;i++){t=(lo+hi)/2;const a=1-t,b=3*a*a*t*.42+3*a*t*t*.58+t*t*t;if(b<x)lo=t;else hi=t;}return 3*(1-t)*t*t+t*t*t;}
 function sample(time,cfg,intensity=cfg.intensity){const phase=((time%cfg.cycleMs)+cfg.cycleMs)%cfg.cycleMs/(cfg.cycleMs/2),t=ease(phase<=1?phase:2-phase),[a,b]=extrema(cfg,intensity);return{x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t};}
 function fit(cfg,box,limits,anchor=ANCHOR){if(!box||!limits)return 0;const cx=box.x+box.width*anchor.x,cy=box.y+box.height*anchor.y;
  if(cx<limits.left||cx>limits.right||cy<limits.top||cy>limits.bottom)return 0;
  const mx=Math.min((cx-limits.left)/(box.width*anchor.x),(limits.right-cx)/(box.width*(1-anchor.x))),my=Math.min((cy-limits.top)/(box.height*anchor.y),(anchor.y===1?Infinity:(limits.bottom-cy)/(box.height*(1-anchor.y))));
  let intensity=cfg.intensity;for(const x of [cfg.squashX,cfg.stretchX])if(x>1)intensity=Math.min(intensity,(mx-1)/(x-1));for(const y of [cfg.squashY,cfg.stretchY])if(y>1)intensity=Math.min(intensity,(my-1)/(y-1));return Math.max(0,intensity);}
 return {DEFAULT,ANCHOR,settings,extrema,ease,sample,fit};
});
