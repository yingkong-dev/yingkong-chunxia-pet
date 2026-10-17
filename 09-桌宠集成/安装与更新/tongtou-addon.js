// 莺空社区 · F41. Scale around the bottom-center landing point; video transforms stay separate.
(()=>{
 if(window.__chunxiaTongtouAddon)return;window.__chunxiaTongtouAddon=true;
 const core=window.ChunxiaTongtou,owned=new Map();let view=null,disposed=false;
 const str=v=>`scale(${v.x}, ${v.y})`,same=(a,b)=>Math.abs(a.x-b.x)+Math.abs(a.y-b.y)<.00001;
 class Shape{
  constructor(s){this.s=s;this.cfg=core.settings();this.animation=null;this.kind='none';this.token=0;this.paused=false;this.effective=0;this.key='';
   this.anchor={...core.ANCHOR};
   this.layer=document.createElement('div');this.layer.className='chunxia-tongtou';Object.assign(this.layer.style,{position:'absolute',inset:'0',width:'100%',height:'100%',overflow:'visible',pointerEvents:'none',transformOrigin:`50% ${this.anchor.y*100}%`});
   s.stage.insertBefore(this.layer,s.videoA);this.layer.append(s.videoA,s.videoB);
  }
  current(){const m=new DOMMatrixReadOnly(getComputedStyle(this.layer).transform);return{x:m.a,y:m.d};}
  cancel(){this.token++;if(this.animation){this.animation.onfinish=null;this.animation.cancel();this.animation=null;}this.kind='none';}
  loop(time=0){const [a,b]=core.extrema(this.cfg,this.effective);this.kind='loop';this.layer.style.willChange='transform';
   this.animation=this.layer.animate([{transform:str(a)},{transform:str(b)}],{duration:this.cfg.cycleMs/2,direction:'alternate',iterations:Infinity,easing:'ease-in-out',fill:'both'});this.animation.currentTime=time;if(this.paused)this.animation.pause();}
  transition(from,to,done,duration=120){this.cancel();const token=this.token;this.kind='transition';this.layer.style.willChange='transform';
   this.animation=this.layer.animate([{transform:str(from)},{transform:str(to)}],{duration,easing:'ease-in-out',fill:'both'});
   this.animation.onfinish=()=>{if(token!==this.token||disposed)return;this.layer.style.transform=str(to);this.cancel();done();};if(this.paused)this.animation.pause();}
  apply(cfg,limits){const box=this.s.stage.getBoundingClientRect(),viewport={left:0,top:0,right:innerWidth,bottom:innerHeight};
   const area=limits?{left:Math.max(0,limits.left),top:Math.max(0,limits.top),right:Math.min(innerWidth,limits.right),bottom:Math.min(innerHeight,limits.bottom)}:viewport;
   const eff=core.fit(cfg,box,area,this.anchor),key=JSON.stringify([cfg,Math.round(eff*100000)]);if(this.key===key)return;
   const previous=this.cfg,current=this.current(),phase=this.kind==='loop'?(Number(this.animation.currentTime)||0)/(previous.cycleMs/2):0;
   const speedOnly=this.kind==='loop'&&cfg.enabled&&previous.enabled&&eff===this.effective&&Object.keys(cfg).every(k=>k==='cycleMs'||cfg[k]===previous[k]);
   this.cfg=cfg;this.effective=eff;this.key=key;
   if(speedOnly){this.animation.effect.updateTiming({duration:cfg.cycleMs/2});this.animation.currentTime=phase*cfg.cycleMs/2;return;}
   if(!cfg.enabled||eff<.00001){if(same(current,{x:1,y:1})){this.cancel();this.layer.style.transform='none';this.layer.style.willChange='';return;}
    this.transition(current,{x:1,y:1},()=>{this.layer.style.transform='none';this.layer.style.willChange='';},160);return;}
   // Cancel only upstream click squash, not facing/mirror or the playback state.
   if(this.s.squashRef!==null){this.s.stopSquash();for(const v of [this.s.videoA,this.s.videoB]){v.style.transform=v.style.transform.replace(/\s*scaleY\([^)]*\)/g,'');v.style.transformOrigin='';}}
   const targetTime=phase*cfg.cycleMs/2,target=core.sample(targetTime,cfg,eff);
   this.transition(current,target,()=>this.loop(targetTime));
  }
  pause(){this.paused=true;this.animation?.pause();}
  resume(){this.paused=false;this.animation?.play();}
  dispose(){this.cancel();this.layer.style.willChange='';this.layer.style.transform='none';this.s.stage.insertBefore(this.s.videoA,this.layer);this.s.stage.insertBefore(this.s.videoB,this.layer);this.layer.remove();}
  snapshot(){return{enabled:this.cfg.enabled,effectiveIntensity:this.effective,limited:this.effective+1e-5<this.cfg.intensity,kind:this.kind,paused:this.paused,scale:this.current(),cycleMs:this.cfg.cycleMs,animations:this.layer.getAnimations().length,anchor:this.anchor,origin:getComputedStyle(this.layer).transformOrigin};}
 }
 function ensure(s){if(s.pet.assetRoot!=='chunxia')return null;if(!owned.has(s))owned.set(s,new Shape(s));return owned.get(s);}
 function receive(v){if(disposed||!v||!Number.isInteger(v.sequence)||v.sequence<(view?.sequence??-1))return;view=v;window.__chunxiaTongtou=v;const cfg=core.settings(v.options);for(const s of sprites)ensure(s)?.apply(cfg,v.limits);}
 window.__chunxiaTongtouReceive=receive;
 function sync(){if(disposed||!sprites.length)return;const s=sprites.find(s=>s.pet.assetRoot==='chunxia');if(!s)return;ensure(s);const r=s.stage.getBoundingClientRect();window.chunxiaTongtou?.action('view',{centerX:r.x+r.width/2,centerY:r.y+r.height*core.ANCHOR.y}).then(receive).catch(()=>{});}
 const baseSquash=PetSprite.prototype.startSquash;PetSprite.prototype.startSquash=function(...a){const c=owned.get(this);if(c&&(c.cfg.enabled||c.animation))return;return baseSquash.apply(this,a);};
 const baseDispose=PetSprite.prototype.dispose;PetSprite.prototype.dispose=function(...a){owned.get(this)?.dispose();owned.delete(this);return baseDispose.apply(this,a);};
 const baseLayout=PetSprite.prototype.relayout;PetSprite.prototype.relayout=function(...a){const r=baseLayout.apply(this,a);sync();return r;};
 const snapshot=window.__chunxiaSnapshot;window.__chunxiaSnapshot=()=>({...snapshot?.(),tongtou:{options:view?.options||core.settings(),instances:[...owned.values()].map(c=>c.snapshot())}});
 const ac=new AbortController();
 window.addEventListener('pointerdown',e=>{if(e.button!==0)return;for(const [s,c]of owned)if(s.hit.contains(e.target))c.pause();},{capture:true,signal:ac.signal});
 const resume=()=>{for(const c of owned.values())c.resume();sync();};
 window.addEventListener('pointerup',resume,{signal:ac.signal});window.addEventListener('pointercancel',resume,{signal:ac.signal});window.addEventListener('blur',resume,{signal:ac.signal});window.addEventListener('resize',sync,{signal:ac.signal});
 const observer=new MutationObserver(sync);observer.observe(rootEl,{childList:true});
 const mount=window.PetShared.mountContextMenu;window.PetShared.mountContextMenu=options=>{
  const cfg=core.settings(view?.options),limited=[...owned.values()].some(c=>c.snapshot().limited);
  return mount({...options,tree:[{label:'通透模式',children:[{label:(cfg.enabled?'✓ ':'○ ')+'开启通透模式',action:'tongtou-toggle'},
   {label:'形变速度',children:[['快速（500ms）',500],['标准（800ms）',800],['舒缓（1200ms）',1200],['慢速（1600ms）',1600]].map(([label,cycleMs])=>({label:(cfg.cycleMs===cycleMs?'✓ ':'')+label,action:'tongtou-set',payload:{cycleMs}}))},
   {label:'形变强度',children:[['轻柔',.5],['标准',1],['明显',1.5],['强烈',2]].map(([label,intensity])=>({label:(cfg.intensity===intensity?'✓ ':'')+label,action:'tongtou-set',payload:{intensity}}))},
   {label:'恢复默认参数（关闭）',action:'tongtou-defaults'},{label:limited?'边界保护：已限制幅度，请手动向内拖动':'脚底落点固定；只向两侧与上方形变',action:'tongtou-info'}]},...options.tree],onAction:leaf=>{
    if(leaf.action==='tongtou-info')return;if(leaf.action?.startsWith('tongtou-')){for(const s of sprites)s.closeMenu();window.chunxiaTongtou.action(leaf.action.slice(8),leaf.payload||{}).then(receive).catch(()=>console.warn('通透设置保存失败'));return;}options.onAction(leaf);
   }});
 };
 window.addEventListener('beforeunload',()=>{disposed=true;observer.disconnect();ac.abort();for(const c of owned.values())c.dispose();owned.clear();},{once:true});
 sync();
})();
