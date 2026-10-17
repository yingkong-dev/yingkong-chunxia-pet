// 莺空社区 · reuse original PetSprite player; add request admission, mirror and recovery.
(()=>{
 if(window.__chunxiaActionAddon)return;
 const proto=PetSprite.prototype,basePlay=proto.playOnce,baseEnded=proto.handleEnded,baseClick=proto.onClick,basePointerUp=proto.onPointerUp,baseDispose=proto.dispose;
 let config=null;const owned=new Set();
 let statusPhase='idle',statusState='unknown',statusRevision=-1,statusKey='',statusEnabled=false;
 const seenStatusTasks=new Set();
 const stage=phase=>find(config?.catalog?.statusActions?.[phase]);
 const randomMode=()=>config?.catalog?.idleMode==='random_once';
 function audioTarget(){const v=window.__chunxiaAudio,a=find(v?.action?.id);
  return v?.options?.enabled===true&&v.state==='active'&&a&&a.trigger!=='点击'&&a.trigger!=='拖动'&&!Object.values(config?.catalog?.statusActions||{}).includes(a.id)?a:null;}
 const desired=()=>{const a=stage(statusPhase);return a?{a,source:'status'}:audioTarget()?{a:audioTarget(),source:'audio'}:null;};
 function reserveIdle(s){
  const pool=config.catalog.idlePool;
  const last=find(s.anim)?.id||s.__idleLast;
  if(!s.__idleNext||!pool.includes(s.__idleNext)||pool.length>1&&s.__idleNext===last)s.__idleNext=window.ChunxiaActionPolicy.pickIdle(pool,last);
  return find(s.__idleNext);
 }
 function waitBoundary(s){
  const current=s.__actionPolicy?.current,v=s.front===0?s.videoA:s.videoB;
  return randomMode()&&current&&['idle','status','audio','auto'].includes(current.source)&&
   (s.once||['status','audio'].includes(current.source)&&current.loop)&&!v.ended&&(!!s.pending||v.readyState>=2&&!v.paused);
 }
 function resumeStatus(s,boundary=false){if(!boundary&&waitBoundary(s))return true;const nextTarget=desired();if(nextTarget)return request(s,nextTarget.a.id,nextTarget.source);
  if(randomMode()){const next=reserveIdle(s);if(!next){trace(s,'随机待机池不可用，已停止自动调度');return false;}return request(s,next.id,'idle',true);}
  return request(s,idle().id,'idle');}
 function statusReceive(value){
  if(!sprites.length)return;
  if(!config?.catalog?.statusActions||!Object.keys(config.catalog.statusActions).length)return;
  if(!value||!['idle','running','completed','interrupted','unknown','failed','awaiting_approval','tool_running'].includes(value.state)||!Number.isInteger(value.revision)||value.revision<statusRevision)return;
  statusRevision=value.revision;const key=value.state+'|'+value.eventId+'|'+(value.options?.enabled===true);
  if(key===statusKey)return;statusKey=key;
  const previous=statusState,wasEnabled=statusEnabled;statusState=value.state;statusEnabled=value.options?.enabled===true;
  const taskKey=typeof value.session==='string'&&value.session&&typeof value.turn==='string'&&value.turn?value.session+'|'+value.turn:null;
  const newTask=!!taskKey&&!seenStatusTasks.has(taskKey);
  if(taskKey&&value.state==='running'){
   seenStatusTasks.add(taskKey);if(seenStatusTasks.size>1024)seenStatusTasks.delete(seenStatusTasks.values().next().value);
  }
  if(value.options?.enabled!==true)statusPhase='idle';
  else if(value.state==='running'){
   if(previous==='running'&&wasEnabled&&!(value.notify===true&&newTask))return;
   statusPhase=value.notify===true&&(newTask||previous!=='running')?'start':'working';
  }else if(value.state==='completed'&&value.notify===true)statusPhase=value.options.completionWave===true&&stage('completed')?'completed':'idle';
  else if(value.state==='completed')statusPhase=statusPhase==='completed'?'completed':'idle';
  else if(!(value.state==='idle'&&statusPhase==='completed'))statusPhase='idle';
  for(const s of sprites){if(!ensure(s))continue;
   s.__chunxiaRefreshReturn?.();
   if(statusPhase==='idle'){
    if(s.__actionPolicy.current?.source==='status'){if(waitBoundary(s))continue;s.__actionPolicy.release();resumeStatus(s);}
   }else if(!resumeStatus(s)){
    // A real completion stays pending until the higher-priority action finishes.
    if(statusPhase==='start')statusPhase='working';
   }
  }
 }
 const baseCodexReceive=window.__chunxiaCodexReceive;
 window.__chunxiaCodexReceive=value=>{statusReceive(value);return baseCodexReceive?.(value);};
 window.__chunxiaAudioApply=()=>{for(const s of sprites)if(ensure(s))resumeStatus(s);};
 const list=()=>config?.catalog?.actions||[];
 const find=name=>list().find(a=>a.name===name||a.id===name);
 const idle=()=>find(config?.catalog?.defaultIdle);
 function trace(s,message){s.__actionError=message;console.warn('[春夏动作] '+message);}
 function videoHealth(s){const v=s.front===0?s.videoA:s.videoB;return{time:v.currentTime,frames:v.getVideoPlaybackQuality?.().totalVideoFrames??null,paused:v.paused,readyState:v.readyState,ended:v.ended,error:v.error?{code:v.error.code,message:String(v.error.message||'').slice(0,220)}:null,front:s.front,generation:s.gen,pending:!!s.pending};}
 function ensure(s){
  if(s.pet.assetRoot!=='chunxia'||!idle())return false;
  if(s.__actionPolicy)return true;
  const p=s.__actionPolicy=new window.ChunxiaActionPolicy.Policy();owned.add(s);
  const a=find(s.anim)||idle();p.request(a,a.name===idle().name?'idle':'auto');
  s.__actionBaseHit={...s.hitRect};s.__actionRecoveries=[];
  s.__chunxiaRequestAction=(name,source='auto')=>request(s,name,source);
  s.__chunxiaIsOneShot=name=>p.current?.name===name?(!p.current.loop||p.current.source==='status'):find(name)?.loop===false;
  s.__chunxiaIsLoop=name=>p.current?.name===name?p.current.loop:find(name)?.loop===true;
  s.__chunxiaReturnLoop=()=>stage(statusPhase==='start'?'working':statusPhase)?.loop?stage(statusPhase==='start'?'working':statusPhase).name:audioTarget()?.name||idle().name;
  s.__chunxiaReturnTarget=()=>{const phase=statusPhase==='start'?'working':statusPhase,a=stage(phase);if(a)return {name:a.name,once:true};const audio=audioTarget();if(!a&&audio)return {name:audio.name,once:false};if(randomMode()){const n=reserveIdle(s);return n?{name:n.name,once:true}:null;}return {name:idle().name,once:false};};
  s.__chunxiaActionSnapshot=()=>({mode:p.manual?'manual':'auto',current:p.current,statusPhase,idleMode:config.catalog.idleMode,idlePool:config.catalog.idlePool,nextIdle:s.__idleNext||null,mirrorEnabled:config.mirrorEnabled,effectiveMirror:!!(config.mirrorEnabled&&find(s.anim)?.mirror),error:s.__actionError||null,playback:videoHealth(s),recovery:s.__actionRecovery||null,retryAt:s.__actionRetryAt||null,queueLength:0,trace:p.trace.slice(-12)});
  const watch=s.__actionProgress=new window.ChunxiaPlaybackHealth.ProgressWatch();
  s.__actionWatchTimer=setInterval(()=>{if(!owned.has(s))return;const h=videoHealth(s),now=performance.now();const reason=watch.observe({...h,key:s.gen+'|'+s.front+'|'+s.anim,suspended:s.dragState.active||!!s.__returnFade||document.hidden},now);
   if(reason&&!s.__actionCooldownTimer&&(!s.__actionLastAttempt||now-s.__actionLastAttempt>3500))recover(s,reason);
   if(!reason&&!h.pending&&!h.paused&&!h.error&&now-watch.progressAt<1500){s.__actionHealthyAt??=now;if(now-s.__actionHealthyAt>10000){s.__actionRecoveries=[];s.__actionError=null;}}else s.__actionHealthyAt=null;
  },1000);
  const options={signal:s.ac.signal};
  for(const v of [s.videoA,s.videoB]){
   let lastTime=0;
   v.addEventListener('timeupdate',()=>{
    const t=v.currentTime,wrapped=t+.3<lastTime;lastTime=t;
    if(v!==(s.front===0?s.videoA:s.videoB)||v.seeking||!v.loop||!wrapped||s.dragState.active)return;
    const current=s.__actionPolicy?.current,target=desired();
    if(['status','audio'].includes(current?.source)&&(!target||target.a.id!==current.id||target.source!==current.source)){
     s.__actionPolicy.release();resumeStatus(s,true);
    }
   },options);
   v.addEventListener('loadeddata',()=>mirror(s),options);
   v.addEventListener('error',()=>{const expected=s.pending&&v!==(s.front===0?s.videoA:s.videoB)&&v.src===s.assetBase+encodeURIComponent(s.pending.anim)+(S.ANIMATION_EXT||'.webm');if(v===(s.front===0?s.videoA:s.videoB)||expected){s.__actionLastVideoError={code:v.error?.code,message:String(v.error?.message||'').slice(0,220),front:v===(s.front===0?s.videoA:s.videoB),pending:!!s.pending};const failedGen=s.gen,failedSrc=v.src;clearTimeout(s.__actionRecoveryTimer);s.__actionRecoveryTimer=setTimeout(()=>{if(s.gen===failedGen&&v.src===failedSrc&&(v===(s.front===0?s.videoA:s.videoB)||s.pending&&v.src===s.assetBase+encodeURIComponent(s.pending.anim)+(S.ANIMATION_EXT||'.webm')))recover(s,'视频加载/解码失败');},40);}},options);
   for(const event of ['waiting','stalled','pause'])v.addEventListener(event,()=>{
    if(v!==(s.front===0?s.videoA:s.videoB)||s.dragState.active||s.__returnFade)return;
    clearTimeout(s.__actionStallTimer);s.__actionStallTimer=setTimeout(()=>{if(v===(s.front===0?s.videoA:s.videoB)&&!s.dragState.active&&(v.paused||v.readyState<3))recover(s,'视频停播或缓冲超时');},3500);
   },options);
   v.addEventListener('playing',()=>{if(v===(s.front===0?s.videoA:s.videoB)){clearTimeout(s.__actionStallTimer);mirror(s);}},options);
  }
  s.__actionObserver=new MutationObserver(()=>mirror(s));
  for(const v of [s.videoA,s.videoB])s.__actionObserver.observe(v,{attributes:true,attributeFilter:['style','src','class']});
  mirror(s);return true;
 }
 function mirror(s){
  if(!s.__actionPolicy)return;
  // Individual CSS scale composes with original transform (including landing/click squash).
  // Never transform the sprite/window or the bubble/menu, and never change facing/random turn pools.
  for(const v of [s.videoA,s.videoB]){
   let name;try{name=decodeURIComponent(new URL(v.src).pathname.split('/').pop()).replace(/\.webm$/i,'');}catch{}
   const effective=config.mirrorEnabled&&find(name)?.mirror;
   const scale=(effective?-1:1)*(s.facing==='right'?-1:1)<0?'-1 1':'1';
   if(v.style.scale!==scale)v.style.scale=scale;
  }
  const front=s.front===0?s.videoA:s.videoB;let name;try{name=decodeURIComponent(new URL(front.src).pathname.split('/').pop()).replace(/\.webm$/i,'');}catch{}
  const h=s.__actionBaseHit,r={...h,x:config.mirrorEnabled&&find(name)?.mirror?s.size-h.x-h.w:h.x};s.hitRect=r;
  const left=r.x/s.size*100+'%';if(s.hit.style.left!==left)s.hit.style.left=left;
 }
 function arm(s,a){
  clearTimeout(s.__actionGuard);const gen=s.gen;
  s.__actionGuard=setTimeout(()=>{if(!s.__actionPolicy||s.gen!==gen)return;const f=s.front===0?s.videoA:s.videoB;if(s.pending)recover(s,'动作加载超时');else if(s.anim===a.name&&(f.paused||f.error||f.readyState<2))recover(s,'动作未正常结束或播放失败');else if(s.anim===a.name&&!a.loop&&!f.ended)arm(s,a);},Math.max(11000,a.duration*1000+3500));
 }
 function request(s,name,source='auto',randomOnce=false){
  if(!ensure(s))return false;const entry=find(name),a=source==='audio'&&entry?{...entry,loop:true,interruptible:true}:randomOnce&&entry?{...entry,loop:false,interruptible:true}:entry;if(!a){trace(s,'动作不在有效运行清单，已拒绝');return false;}
  if(source==='auto'&&a.name===idle().name)source='idle';
  const beforeSource=s.__actionPolicy.current?.source,result=s.__actionPolicy.request(a,source);
  if(!result){s.pendingSquash=false;return false;}
  if(['click','manual'].includes(source)){clearTimeout(s.__actionCooldownTimer);s.__actionCooldownTimer=null;s.__actionRetryAt=null;}
  const front=s.front===0?s.videoA:s.videoB;
  if(result==='same'&&!(beforeSource==='idle'&&source!=='idle')&&s.anim===a.name&&!s.pending&&front.readyState>=2&&!front.paused&&!front.ended&&!front.error){return true;}
  s.__actionError=null;
  try{
   if(randomOnce){s.__idleLast=a.id;s.__idleNext=null;s.anim=a.name;s.once=true;s.switchTo(a.name,true);}
   else if(beforeSource==='idle'&&result==='same'&&!a.loop){s.anim=a.name;s.once=true;s.switchTo(a.name,true);}
   // Decode work loops through the existing two-buffer single-play path.
   // Native VP9-alpha loop rewind repeatedly failed with MEDIA_ERR_DECODE on Windows.
   else if(a.loop){s.anim=a.name;s.once=source==='status';s.switchTo(a.name,s.once);}
   else basePlay.call(s,a.name);
   mirror(s);arm(s,a);return true;
  }catch{recover(s,'动作切换异常');return false;}
 }
 function automatic(s){if(!ensure(s))return false;s.__actionPolicy.release();s.__actionError=null;s.pendingSquash=false;return resumeStatus(s);}
 function recover(s,reason){
  if(!ensure(s)||s.dragState.active||s.__actionCooldownTimer)return;const now=Date.now();s.__actionLastAttempt=performance.now();s.__actionHealthyAt=null;s.__actionRecoveries=s.__actionRecoveries.filter(t=>now-t<30000);
  const h=videoHealth(s);s.__actionRecovery={at:now,reason,video:h,lastError:s.__actionLastVideoError||null};
  if(h.error?.code===3){
   s.__decodeFailures=(s.__decodeFailures||[]).filter(v=>now-v.at<60000);
   if(!s.__decodeFailures.some(v=>v.gen===s.gen))s.__decodeFailures.push({at:now,gen:s.gen});
   if(s.__decodeFailures.length>=2&&typeof window!=='undefined'&&window.chunxiaPlaybackRecovery&&!s.__decoderRestartPending&&(!s.__decoderRestartAttemptAt||now-s.__decoderRestartAttemptAt>=300000)){
    s.__decoderRestartAttemptAt=now;s.__decoderRestartPending=true;s.__actionRecovery.strategy='restart-helper';
    window.chunxiaPlaybackRecovery.restart().then(result=>{if(result.accepted&&owned.has(s)){trace(s,'连续解码失败，正在重建播放进程');s.reloadDesktop();}else s.__decoderRestartPending=false;}).catch(()=>{s.__decoderRestartPending=false;});
    return;
   }
  }
  const f=s.front===0?s.videoA:s.videoB;
  if(!s.pending&&h.ended&&s.once){s.__actionRecovery.strategy='finish';s.handleEnded();return;}
  if(!s.pending&&h.paused&&!h.error&&h.readyState>=2&&(!s.__actionSoftResumeAt||now-s.__actionSoftResumeAt>10000)){
   s.__actionSoftResumeAt=now;s.__actionRecovery.strategy='resume';trace(s,reason+'；尝试原进度继续播放');f.play().catch(()=>{if(!owned.has(s))return;s.__actionSoftResumeAt=Date.now();recover(s,'原进度恢复失败');});return;
  }
  trace(s,reason+'；恢复当前正式自动动作');
  if(s.__actionRecoveries.length>=2){const delay=Math.max(1500,30100-(now-s.__actionRecoveries[0]));s.__actionRetryAt=now+delay;s.__actionRecovery.strategy='cooldown';trace(s,'连续恢复失败；保留最后画面，冷却后自动重试当前正式动作');s.__actionCooldownTimer=setTimeout(()=>{s.__actionCooldownTimer=null;s.__actionRetryAt=null;if(owned.has(s))recover(s,'冷却后重试');},delay);return;}
  s.__actionRecovery.strategy='reload';
  s.__actionRecoveries.push(now);clearTimeout(s.__actionGuard);clearTimeout(s.__actionStallTimer);
  s.__actionPolicy.release();s.pending=null;++s.gen;s.anim='';s.pendingSquash=false;s.__returnWarm=null;
  resumeStatus(s,true);s.__actionError=reason;
 }
 proto.playOnce=function(name){if(this.pet.assetRoot!=='chunxia'||!config)return basePlay.call(this,name);if(randomMode()&&name===idle().name&&!this.__actionSource){if(this.__actionRestoringDrag||waitBoundary(this))return true;return resumeStatus(this);}return request(this,name,this.__actionSource||'auto');};
 proto.onClick=function(){if(!ensure(this))return baseClick.call(this);this.__actionSource='click';try{return baseClick.call(this);}finally{this.__actionSource=null;}};
 proto.onPointerUp=function(e){
  // Upstream explicitly returns to idle after a real drag. Release the old action
  // lease first; otherwise its click/manual priority would reject that recovery.
  const restore=this.dragState.dragging&&ensure(this);if(restore)this.__actionPolicy.release();
  this.__actionRestoringDrag=restore;let result;try{result=basePointerUp.call(this,e);}finally{this.__actionRestoringDrag=false;}
  if(restore&&(randomMode()||statusPhase==='working'))automatic(this);
  return result;
 };
 proto.handleEnded=function(){
  if(!ensure(this))return baseEnded.call(this);if(this.dragState.active)return;
  // Ignore stale ended callbacks from the outgoing/preload video.
  const front=this.front===0?this.videoA:this.videoB;if(!front.ended)return;
  const a=find(this.anim),source=this.__actionPolicy.current?.source;clearTimeout(this.__actionGuard);clearTimeout(this.__actionStallTimer);this.__actionPolicy.release();
  if(source==='status'&&a?.id===stage('start')?.id&&statusPhase==='start')statusPhase='working';
  if(source==='status'&&a?.id===stage('completed')?.id&&statusPhase==='completed')statusPhase='idle';
  if(randomMode()||Object.keys(config.catalog.statusActions||{}).length)return resumeStatus(this);
  const target=find(a?.returnTo)||idle();return request(this,target.name,target.name===idle().name?'idle':'auto');
 };
 proto.dispose=function(){clearTimeout(this.__actionGuard);clearTimeout(this.__actionStallTimer);clearTimeout(this.__actionRecoveryTimer);clearTimeout(this.__actionCooldownTimer);clearInterval(this.__actionWatchTimer);this.__actionObserver?.disconnect();owned.delete(this);return baseDispose.call(this);};
 const mount=window.PetShared.mountContextMenu;
 window.PetShared.mountContextMenu=function(options){
  const s=sprites.find(s=>s.pet.assetRoot==='chunxia');if(!s||!ensure(s))return mount(options);
  const actions=list();const menuActions=actions.map(a=>({label:!randomMode()&&a.name===idle().name?'播放主待机':a.trigger==='点击'?'播放'+a.name.split('-').pop():a.name,action:'chunxia-action',id:a.id}));
  const tree=options.tree.filter(n=>n.label!=='动作'&&n.label!=='动作管理');
  tree.unshift({label:'动作管理',children:[...menuActions,{label:randomMode()?'恢复随机待机':'恢复自动待机',action:'chunxia-auto'},{label:'水平镜像：'+(config.mirrorEnabled?'已开启':'已关闭'),action:'chunxia-mirror'},{label:'打开动作诊断',action:'chunxia-action-diagnostic'}]});
  return mount({...options,tree,onAction:leaf=>{
   if(leaf.action==='chunxia-action'){s.closeMenu();request(s,leaf.id,'manual');return;}
   if(leaf.action==='chunxia-auto'){s.closeMenu();automatic(s);return;}
   if(leaf.action==='chunxia-mirror'){s.closeMenu();window.chunxiaActions.action('toggleMirror').then(window.__chunxiaActionsReceive).catch(()=>trace(s,'镜像设置保存失败'));return;}
   if(leaf.action==='chunxia-action-diagnostic'){s.closeMenu();window.chunxiaActions.action('diagnostic').catch(()=>{});return;}
   options.onAction(leaf);
  }});
 };
 window.__chunxiaActionsReceive=value=>{
  if(!value||!Number.isInteger(value.revision)||value.revision<(config?.revision||0)||!value.catalog?.actions?.length)return;
  config=value;window.__chunxiaActions=value;
  for(const s of sprites)if(ensure(s)){mirror(s);if(randomMode()&&!s.__idleStarted){s.__idleStarted=true;if(s.__actionPolicy.current?.source==='idle')automatic(s);}}
  if(statusRevision<0&&window.__chunxiaCodex)statusReceive({...window.__chunxiaCodex,notify:false});
 };
 window.__chunxiaManualAction=name=>{const s=sprites.find(s=>s.pet.assetRoot==='chunxia');return s?name==='auto'?automatic(s):request(s,name,'manual'):false;};
 window.addEventListener('beforeunload',()=>{for(const s of owned){clearTimeout(s.__actionGuard);clearTimeout(s.__actionStallTimer);clearTimeout(s.__actionRecoveryTimer);clearTimeout(s.__actionCooldownTimer);clearInterval(s.__actionWatchTimer);s.__actionObserver?.disconnect();}owned.clear();},{once:true});
 window.__chunxiaActionAddon={version:'0.6',installed:true};
})();
