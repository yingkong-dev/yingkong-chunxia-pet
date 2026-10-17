// Thin extension: use the original player/physics/menu; suppress same active click action.
(() => {
  if (window.__chunxiaAddon) return;
  const prototype=PetSprite.prototype;
  const quotaStyle=document.createElement('style');quotaStyle.textContent='.pet-bubble.chunxia-quota-bubble{box-sizing:border-box;width:min(calc(var(--pet-size,462px)*.72),calc(100vw - 24px));max-width:calc(100vw - 24px);}';document.head.appendChild(quotaStyle);
  const quotaObserved=new Set();
  function fitQuotaBubble(s){
    const bubble=s.bubble;if(!bubble)return;
    const quota=!!(s.__quotaBubble&&s.bubbleOn&&s.balanceView?.[0]?.text&&bubble.classList.contains('is-on')&&bubble.textContent.startsWith(s.balanceView[0].text));
    bubble.classList.toggle('chunxia-quota-bubble',quota);bubble.style.translate='';
    if(!quota)return;
    const r=bubble.getBoundingClientRect(),gap=8;
    const dx=Math.max(gap-r.left,Math.min(0,innerWidth-gap-r.right));
    const dy=Math.max(gap-r.top,Math.min(0,innerHeight-gap-r.bottom));
    if(dx||dy)bubble.style.translate=dx+'px '+dy+'px';
    if(!s.__quotaLayoutObserver){s.__quotaLayoutObserver=new ResizeObserver(()=>fitQuotaBubble(s));s.__quotaLayoutObserver.observe(bubble);quotaObserved.add(s);}
  }
  window.addEventListener('resize',()=>{for(const s of quotaObserved)fitQuotaBubble(s);});
  window.addEventListener('beforeunload',()=>{for(const s of quotaObserved)s.__quotaLayoutObserver?.disconnect();quotaObserved.clear();},{once:true});
  const disposeLayoutOriginal=prototype.dispose;
  prototype.dispose=function(){this.__quotaLayoutObserver?.disconnect();quotaObserved.delete(this);return disposeLayoutOriginal.call(this);};
  const renderBubbleOriginal=prototype.renderBubble;
  prototype.renderBubble=function(){
    let result;
    if(this.__presentationTest){const view=Object.create(this);view.workOn=true;view.workState='success';view.workText='【模拟UI测试】'+this.__presentationTest.text;result=renderBubbleOriginal.call(view);}
    else if(this.__quotaManual&&this.__quotaBubble&&this.bubbleOn){const view=Object.create(this);view.workOn=false;view.whisperOn=false;result=renderBubbleOriginal.call(view);}
    else result=renderBubbleOriginal.call(this);
    fitQuotaBubble(this);return result;
  };
  const mount=window.PetShared.mountContextMenu;
  window.PetShared.mountContextMenu=function(options){
    // Standalone cannot provide AI chat or whispers; retain original home/reload/action menu.
    const tree=options.tree.filter(n=>!['chat','whisper','open-site','show-balance'].includes(n.action));
    const cached=window.__chunxiaQuota;
    const q=cached?.expiresAt&&Date.now()>cached.expiresAt?{...cached,data:null,status:'stale'}:cached;
    const details=[];
    for(const b of q?.data?.buckets||[]){const children=[];
      for(const w of b.windows){const minutes=w.windowDurationMins;
        const name=minutes===null?'时长未知':minutes%1440===0?minutes/1440+'天':minutes%60===0?minutes/60+'小时':minutes+'分钟';
        children.push({label:name+'：'+(w.remainingPercent===null?'比例未知':'剩余 '+Math.round(w.remainingPercent*10)/10+'%'),action:'codex-quota-info'});
        children.push({label:w.resetsAt?'重置：'+new Date(w.resetsAt*1000).toLocaleString('zh-CN'):'重置时间未知',action:'codex-quota-info'});
      }
      details.push({label:b.name||b.id,children});
    }
    if(q?.data?.resetAvailableCount!==null&&q?.data?.resetAvailableCount!==undefined)details.push({label:'可用重置次数：'+q.data.resetAvailableCount+'（仅查看）',action:'codex-quota-info'});
    if(q?.data&&q?.lastUpdated)details.push({label:'更新于 '+new Date(q.lastUpdated).toLocaleTimeString('zh-CN'),action:'codex-quota-info'});
    const pc=window.__chunxiaPresentation?.options||{};
    tree.unshift({label:'文案与系统通知',children:[...[
      ['randomTexts','状态随机文案'],['systemNotifications','Windows 系统通知'],['completed','完成系统通知'],['interruptedErrors','中断/异常系统通知'],['approval','待确认系统通知'],['quota','额度不足系统通知']].map(([k,t])=>({label:(pc[k]?'✓ ':'○ ')+t,action:'presentation-'+k})),
      {label:'策略：'+(pc.policy==='unfocused'?'未获焦点时提醒':'重要事件始终提醒'),action:'presentation-policy'},
      {label:'重新加载本地文案',action:'presentation-reload'},
      {label:'人工验收（模拟UI）',children:[['work','普通工作气泡'],['completeBubble','任务完成气泡'],['quotaBubble','额度不足气泡'],['testCompleted','任务完成系统通知'],['testQuota','额度不足系统通知']].map(([k,t])=>({label:t,action:'presentation-'+k}))}]});
    tree.unshift({label:'查看 Codex 额度',action:'codex-quota-read'});
    if(q?.status==='stale')tree.splice(1,0,{label:'额度数据已过期，请刷新',action:'codex-quota-info'});
    if(details.length)tree.splice(1,0,{label:'Codex 额度详情',children:details});
    return mount({...options,tree,onAction:leaf=>{
      if(leaf.action?.startsWith('presentation-')){window.chunxiaPresentation?.action(leaf.action.slice(13)).then(window.__chunxiaPresentationReceive).catch(()=>{});return;}
      if(leaf.action==='codex-quota-read'){for(const s of sprites)s.closeMenu();window.__chunxiaQuotaLoading();window.chunxiaQuota?.read().then(v=>window.__chunxiaQuotaReceive(v,true,{manual:true})).catch(()=>window.__chunxiaQuotaFailure());return;}
      if(leaf.action==='codex-quota-info')return;
      options.onAction(leaf);
    }});
  };
  const original=prototype.playOnce;
  // A single idle with optional click actions uses native idle looping. Click actions
  // keep the official single-play/ended return path. Expanded automatic pools remain
  // on the official scheduler, preserving future pack extensibility.
  const singleIdle=(s,name) => s.pet.assetRoot==='chunxia' && s.animations.idle.length===1 &&
    name===s.animations.idle[0] && !s.animations.drag.length &&
    !s.animations.turn.length && !s.animations.moves.actions.length && !s.animations.categories.length &&
    s.weights.idle===100 && !s.pet.balanceEnabled && !s.pet.whisperEnabled && !s.pet.workStatusEnabled;
  // Rewind/decode the existing hidden idle buffer while a click animation is playing.
  // The original host otherwise calls load() only after ended, holding the last wave
  // frame until the idle's first frame arrives. No third video or new asset is used.
  const switchOriginal=prototype.switchTo;
  const RETURN_FADE_MS=120; // User-selected gentle return, about three 24fps frames.
  function cancelReturnFade(s){
    const state=s.__returnFade;if(!state)return;
    s.__returnFade=null;state.animation.cancel();
    state.old.style.opacity='';state.old.style.zIndex='';state.next.style.zIndex='';
    s.__lastReturnFade={durationMs:RETURN_FADE_MS,elapsedMs:performance.now()-state.at,canceled:true};
  }
  function warmIdle(s,clickName,gen){
    const deadline=performance.now()+4000;
    const wait=()=>{
      if(s.gen!==gen||s.anim!==clickName||!singleIdle(s,s.animations.idle[0]))return;
      if(s.pending){if(performance.now()<deadline)requestAnimationFrame(wait);return;}
      const back=s.front===0?s.videoB:s.videoA,front=s.front===0?s.videoA:s.videoB;
      const target=s.__chunxiaReturnTarget?.(clickName)||{name:s.__chunxiaReturnLoop?.(clickName)||s.animations.idle[0],once:false};
      const url=s.assetBase+encodeURIComponent(target.name)+(S.ANIMATION_EXT||'.webm');
      const token=(s.__returnWarmToken||0)+1;s.__returnWarmToken=token;
      const state=s.__returnWarm={ready:false,video:back,url,once:target.once,token,clickName,started:performance.now(),error:null};
      const valid=()=>s.__returnWarm===state&&s.anim===clickName&&s.gen===gen&&back!==((s.front===0)?s.videoA:s.videoB)&&back.src===url;
      back.pause();back.onended=null;back.loop=false;back.autoplay=false;back.preload='auto';
      let callbackId=null,timer=null;
      const finish=()=>{if(timer!==null)clearTimeout(timer);if(callbackId!==null)back.cancelVideoFrameCallback(callbackId);};
      const fail=message=>{finish();if(s.__returnWarm===state){state.error=message;state.ready=false;}if(valid())back.pause();};
      const decoded=(_now,metadata)=>{
        callbackId=null;if(!valid()){finish();return;}
        if(metadata.mediaTime>.09){callbackId=back.requestVideoFrameCallback(decoded);return;}
        back.pause();finish();state.ready=true;state.decodedAt=performance.now();state.mediaTime=metadata.mediaTime;
      };
      const prepare=()=>{
        if(!valid())return;
        callbackId=back.requestVideoFrameCallback(decoded);
        back.currentTime=0;
        back.play().catch(e=>{if(valid()&&!state.ready)fail(e.message);});
      };
      timer=setTimeout(()=>fail('待机首帧预解码超时；保留原版加载路径'),3000);
      if(back.src===url&&back.readyState>=2)prepare();
      else{
        back.src=url;
        back.addEventListener('loadeddata',prepare,{once:true});
        back.load();
      }
    };requestAnimationFrame(wait);
  }
  prototype.__chunxiaRefreshReturn=function(){
    if(!this.once||this.pending)return;
    const target=this.__chunxiaReturnTarget?.(),warm=this.__returnWarm;
    if(target&&(!warm||warm.url!==this.assetBase+encodeURIComponent(target.name)+(S.ANIMATION_EXT||'.webm')||warm.once!==target.once))warmIdle(this,this.anim,this.gen);
  };
  prototype.switchTo=function(next,nextOnce){
    cancelReturnFade(this);
    if(singleIdle(this,this.animations.idle[0])){
      // The upstream 180ms opacity dissolve holds a paused old frame over the next
      // action. This pack uses a decoded-frame buffer swap, with only one visible video.
      this.videoA.style.transition='none';this.videoB.style.transition='none';
    }
    const warm=this.__returnWarm,back=this.front===0?this.videoB:this.videoA;
    if(warm?.once===nextOnce&&(nextOnce||singleIdle(this,next)||this.__chunxiaIsLoop?.(next))&&warm?.ready&&warm.video===back&&warm.url===back.src&&warm.url===this.assetBase+encodeURIComponent(next)+(S.ANIMATION_EXT||'.webm')&&
       back.readyState>=2&&!back.seeking&&back.currentTime<.12&&!this.pending){
      const old=this.front===0?this.videoA:this.videoB;
      ++this.gen;this.__returnWarm=null;
      back.loop=!nextOnce;back.autoplay=true;back.onended=nextOnce?()=>this.handleEnded():null;
      back.style.transform=this.facing==='right'?'scaleX(-1)':'';
      back.classList.add('is-front');old.classList.remove('is-front');old.onended=null;old.pause();
      this.front=this.front===0?1:0;this.pending=null;this.pendingSquash=false;
      this.__lastWarmReturn={at:performance.now(),warmupMs:warm.decodedAt-warm.started,firstFrame:warm.mediaTime,used:true};
      back.play().catch(e=>console.error('[春夏] 已预加载的待机播放失败：'+e.message));
      // Start the loaded idle immediately at full opacity. Only the outgoing wave
      // fades above it; complementary fades would make the character translucent.
      if(old.ended&&RETURN_FADE_MS>0){
        back.style.zIndex='1';old.style.zIndex='2';
        const animation=old.animate([{opacity:1},{opacity:0}],{duration:RETURN_FADE_MS,easing:'ease-out',fill:'forwards'});
        const state=this.__returnFade={old,next:back,animation,at:performance.now()};
        this.__lastReturnFade={durationMs:RETURN_FADE_MS,active:true};
        animation.onfinish=()=>{
          if(this.__returnFade!==state)return;
          this.__returnFade=null;
          old.style.opacity='';old.style.zIndex='';back.style.zIndex='';animation.cancel();
          this.__lastReturnFade={durationMs:RETURN_FADE_MS,elapsedMs:performance.now()-state.at,active:false,canceled:false};
        };
      }
      return;
    }
    if(nextOnce&&this.animations.clicks.includes(next))this.__lastWarmReturn=null;
    else if(!nextOnce&&singleIdle(this,next)&&warm)this.__lastWarmReturn={at:performance.now(),used:false,error:warm.error||'首帧尚未准备，使用原版加载路径'};
    this.__returnWarm=null;
    const result=switchOriginal.call(this,next,nextOnce);
    if(nextOnce&&(this.animations.clicks.includes(next)||this.__chunxiaIsOneShot?.(next))&&singleIdle(this,this.animations.idle[0]))warmIdle(this,next,this.gen);
    return result;
  };
  prototype.playOnce=function(name){
    if(singleIdle(this,name)) {
      const front=this.front===0?this.videoA:this.videoB;
      if(this.anim===name && !this.pending && front?.readyState>=2 && !front.ended) {
        this.once=false;front.loop=true;front.onended=null;
        if(front.paused)front.play().catch(()=>{});
        return;
      }
      this.anim=name;this.once=false;this.switchTo(name,false);return;
    }
    const front=this.front===0?this.videoA:this.videoB;
    if (this.pet.assetRoot==='chunxia' && this.animations.clicks.includes(name) && this.anim===name &&
        ((this.pending && this.pending.anim===name) || (front && !front.ended && !front.paused))) {
      this.pendingSquash=false;
      console.log('[春夏] 重复触发已忽略：'+name);
      return;
    }
    return original.call(this,name);
  };
  // Reuse the official single bubble slot and playOnce scheduler. No new video,
  // renderer IPC or second animation engine. Click playback always takes priority.
  let codexTimer=null,codexRevision=-1,lastCodexNotice='',lastWorkingNotice=0;
  const codexStates=new Set(['idle','running','tool_running','awaiting_approval','completed','failed','interrupted','unknown']);
  function hideCodex(){
    clearTimeout(codexTimer);codexTimer=null;
    for(const s of sprites){s.workOn=false;s.workText=null;s.workState=null;s.renderBubble();}
  }
  window.__chunxiaCodexReceive=value=>{
    if(!sprites.length)return; // The official config fetch may finish after did-finish-load.
    if(!value||!codexStates.has(value.state)||!Number.isInteger(value.revision)||value.revision<codexRevision)return;
    codexRevision=value.revision;
    const previousState=window.__chunxiaCodex?.state;
    window.__chunxiaCodex={state:value.state,connection:String(value.connection||'').slice(0,80),
      activeCount:value.activeCount,eventId:value.eventId,revision:value.revision,options:value.options};
    const options=value.options;
    if(!options||options.enabled!==true||value.state==='idle'){hideCodex();return;}
    if(options.bubbles!==true||(value.state==='completed'&&options.completionNotice!==true))hideCodex();
    if(!value.notify&&!['running','tool_running','awaiting_approval','unknown'].includes(value.state))return;
    const key=value.state+'|'+value.eventId;
    if(key===lastCodexNotice)return;
    lastCodexNotice=key;
    const working=['running','tool_running'].includes(value.state);
    if(working&&['running','tool_running'].includes(previousState)&&Date.now()-lastWorkingNotice<15000)return;
    if(working)lastWorkingNotice=Date.now();
    const messages={running:'Codex 正在努力工作～',tool_running:'Codex 正在执行工具～',
      awaiting_approval:'Codex 正在等待你的确认！',completed:'本轮任务完成啦！',
      failed:'Codex 遇到问题啦',interrupted:'任务已中断',unknown:'Codex 状态未知'};
    if(options.bubbles===true&&(value.state!=='completed'||options.completionNotice===true)){
      hideCodex();
      for(const s of sprites){s.workText=(typeof value.presentationText==='string'&&value.presentationText.length<=180?value.presentationText:messages[value.state])+(value.activeCount>1?'（多会话）':'');
        s.workOn=true;s.workState=value.state==='completed'?'success':value.state==='failed'?'error':'working';s.renderBubble();}
      codexTimer=setTimeout(hideCodex,value.state==='awaiting_approval'?10000:6500);
    }
    if(value.state==='completed'&&options.completionNotice===true&&options.completionWave===true&&!Object.keys(window.__chunxiaActions?.catalog?.statusActions||{}).length){
      const s=sprites.find(s=>s.pet.assetRoot==='chunxia');
      if(s&&!s.once&&!s.pending&&!s.dragState.dragging&&s.animations.clicks.length===1){
        const accepted=s.__chunxiaRequestAction?s.__chunxiaRequestAction(s.animations.clicks[0],'status'):(s.playOnce(s.animations.clicks[0]),true);window.__chunxiaCodex.lastWave=accepted?'played':'skipped-busy';
      }else window.__chunxiaCodex.lastWave='skipped-busy';
    }
    return {state:value.state,revision:value.revision,bubbleVisible:sprites.some(s=>s.workOn),
      text:sprites.find(s=>s.workOn)?.workText||null,
      animation:sprites[0]?.anim,lastWave:window.__chunxiaCodex.lastWave||null};
  };
  window.addEventListener('beforeunload',hideCodex,{once:true});
  // Reuse native balance bubble rendering; never call its API-balance provider or animations.
  let quotaTimer=null;
  function showQuotaRows(rows,manual=false,pending=false){
    clearTimeout(quotaTimer);
    for(const s of sprites){s.balanceView=rows;s.balanceWrap=true;s.bubbleOn=true;s.__quotaBubble=true;s.__quotaManual=manual;s.__quotaPending=pending;s.renderBubble();}
    quotaTimer=setTimeout(()=>{for(const s of sprites)if(s.__quotaBubble){s.bubbleOn=false;s.__quotaBubble=false;s.__quotaManual=false;s.__quotaPending=false;s.renderBubble();}},12000);
  }
  window.__chunxiaQuotaLoading=()=>showQuotaRows([{role:'label',text:'Codex 使用额度'},{role:'sub',text:'正在读取当前账号额度…'}],true,true);
  window.__chunxiaQuotaFailure=()=>showQuotaRows([{role:'error',text:'额度读取失败，请稍后重试'}],true);
  window.__chunxiaQuotaReceive=(value,show=false,display={})=>{
    if(!value||!Number.isInteger(value.revision)||value.revision<(window.__chunxiaQuota?.revision||0)||!Array.isArray(value.rows)||value.rows.length>8)return;
    window.__chunxiaQuota=value;
    if(value.status!=='connected')for(const s of sprites)if(s.__quotaBubble&&!(value.status==='loading'&&s.__quotaPending)){s.bubbleOn=false;s.__quotaBubble=false;s.__quotaManual=false;s.__quotaPending=false;s.renderBubble();}
    if(!show)return;
    const rows=value.rows.filter(r=>['label','sub','error'].includes(r.role)&&typeof r.text==='string'&&r.text.length<=180).map(r=>({role:r.role,text:r.text}));
    if(value.alert){const title=value.alert.level==='empty'?'Codex 额度已耗尽':value.alert.level==='critical'?'Codex 额度紧张':'Codex 额度不足';
      if(typeof value.alert.presentationText==='string'&&value.alert.presentationText.length<=180)rows.unshift({role:'sub',text:value.alert.presentationText});
      rows.unshift({role:'error',text:title+'（'+String(value.alert.bucket||'codex').slice(0,40)+' '+String(value.alert.window||'').slice(0,30)+'）'});}
    showQuotaRows(rows,display.manual===true);
  };
  window.addEventListener('beforeunload',()=>clearTimeout(quotaTimer),{once:true});
  let presentationTestTimer=null;
  window.__chunxiaPresentationReceive=v=>{if(v&&v.options)window.__chunxiaPresentation=v;};
  window.__chunxiaPresentationTest=v=>{
    if(!v||!['running','completed','critical'].includes(v.kind)||typeof v.text!=='string'||v.text.length>180)return;
    clearTimeout(presentationTestTimer);
    // Separate whisper slot: simulated UI never changes real Codex snapshots, quota or animation state.
    for(const s of sprites){s.__presentationTest={text:v.text};s.renderBubble();}
    presentationTestTimer=setTimeout(()=>{for(const s of sprites){delete s.__presentationTest;s.renderBubble();}},6500);
  };
  window.addEventListener('beforeunload',()=>clearTimeout(presentationTestTimer),{once:true});
  window.__chunxiaAddon={version:'0.5-random-native-notifications',installed:true};
  for(const s of sprites)if(singleIdle(s,s.anim))s.playOnce(s.anim);
  // Snapshot reads the original renderer state; it does not control its animation engine.
  window.__chunxiaSnapshot=() => {
    const s=sprites[0];
    if (!s) return {ready:false,debug:window.__dshPetDebug};
    const f=s.front===0?s.videoA:s.videoB;
    return {ready:window.__dshPetDebug.configOk===true,addon:true,id:s.pet.id,name:s.pet.name,
      assetRoot:s.assetRoot,anim:s.anim,once:s.once,front:s.front,pending:!!s.pending,
      currentTime:f?.currentTime,duration:f?.duration,paused:f?.paused,ended:f?.ended,
      loop:f?.loop,
      readyState:f?.readyState,videoWidth:f?.videoWidth,videoHeight:f?.videoHeight,src:f?.src,
      renderedSprites:document.querySelectorAll('.pet-sprite').length,
      frontVideos:document.querySelectorAll('video.is-front').length,
      returnPreload:s.__returnWarm?{ready:s.__returnWarm.ready,error:s.__returnWarm.error,mediaTime:s.__returnWarm.mediaTime}:null,
      lastWarmReturn:s.__lastWarmReturn||null,
      returnFade:s.__returnFade?{durationMs:RETURN_FADE_MS,elapsedMs:performance.now()-s.__returnFade.at}:null,
      lastReturnFade:s.__lastReturnFade||null,
      codex:window.__chunxiaCodex||null,
      quota:window.__chunxiaQuota?{status:window.__chunxiaQuota.status,lastUpdated:window.__chunxiaQuota.lastUpdated}:null,
      actions:s.__chunxiaActionSnapshot?.()||null,
      audio:window.__chunxiaAudio?{state:window.__chunxiaAudio.state,notice:window.__chunxiaAudio.notice,actionId:window.__chunxiaAudio.action?.id||null,test:window.__chunxiaAudio.test===true}:null,
      position:s.pos,size:s.size,dragging:s.dragState.dragging,debug:window.__dshPetDebug};
  };
})();
