// 莺空社区. Load official Electron helper unmodified, with isolated profile and a small addon.
const {app,Tray,Menu,nativeImage,BrowserWindow,shell,ipcMain,session,Notification,screen}=require('electron');
// Must precede Notification.isSupported(): Electron caches a notifier on that call.
app.setAppUserModelId('Yingkong.Chunxia.DesktopPet');
const fs=require('node:fs');
const path=require('node:path');
const http=require('node:http');
const dir=__dirname;
const official=process.env.CHUNXIA_OFFICIAL_MAIN;
if (!official || !fs.existsSync(official)) throw new Error('春夏：官方宿主入口缺失');
const home=process.env.DSH_HOME;
app.setName('dsh-pet-electron-helper');
fs.mkdirSync(path.join(home,'春夏Electron缓存'),{recursive:true});
app.setPath('userData',path.join(home,'春夏Electron缓存'));
app.setAppPath(path.dirname(official));
if (process.env.CHUNXIA_TEST_CDP) {
  app.commandLine.appendSwitch('remote-debugging-address','127.0.0.1');
  app.commandLine.appendSwitch('remote-debugging-port',process.env.CHUNXIA_TEST_CDP);
}
const statusPath=path.join(home,'桌宠运行状态.json');
const eventLog=process.env.CHUNXIA_EVENT_LOG;
const {PlaybackRestart}=require('./playback-restart.cjs');
const playbackRestart=new PlaybackRestart(path.join(home,'播放进程恢复记录.json'));
ipcMain.handle('chunxia:playback-restart',(event)=>{
 if(!trustedSender(event))throw Error('不允许的播放恢复请求');
 const result=playbackRestart.request();if(result.accepted)log('连续真实解码失败：请求宿主重建播放进程');return result;
});
const {SizeSettings}=require('./size-settings.cjs');
const sizeSettings=new SizeSettings(path.join(dir,'..','动作配置','桌宠设置.json'),path.join(home,'dsh-pet','pet','chunxia-config.json'),path.join(dir,'..','回滚备份'));
ipcMain.handle('chunxia:size',(event,action,size)=>{
 if(!trustedSender(event))throw Error('不允许的尺寸请求');
 if(action==='view')return sizeSettings.view();
 if(action==='set')return sizeSettings.set(size);
 throw Error('不允许的尺寸操作');
});
const {TongtouSettings}=require('./tongtou-settings.cjs');
const tongtou=new TongtouSettings(path.join(dir,'..','动作配置','通透模式设置.json'));
const tongtouCenters=new WeakMap();let tongtouSequence=0;
function tongtouView(win){const bounds=win.getContentBounds(),p=tongtouCenters.get(win)||{centerX:bounds.width/2,centerY:bounds.height/2};
 const area=screen.getDisplayNearestPoint({x:Math.round(bounds.x+p.centerX),y:Math.round(bounds.y+p.centerY)}).workArea;
 return {...tongtou.view(),sequence:++tongtouSequence,limits:{left:area.x-bounds.x,top:area.y-bounds.y,right:area.x+area.width-bounds.x,bottom:area.y+area.height-bounds.y}};}
function sendTongtou(win){if(!win.isDestroyed()&&!win.webContents.isDestroyed())win.webContents.executeJavaScript('window.__chunxiaTongtouReceive?.('+JSON.stringify(tongtouView(win))+')').catch(()=>{});}
ipcMain.handle('chunxia:tongtou',(event,action,payload={})=>{
 if(!trustedSender(event)||!['view','toggle','set','defaults'].includes(action))throw Error('不允许的通透请求');
 const win=BrowserWindow.fromWebContents(event.sender);
 if(action==='view'){const b=win.getContentBounds();if(payload&&Object.keys(payload).length){if(Object.keys(payload).some(k=>!['centerX','centerY'].includes(k))||!Number.isFinite(payload.centerX)||!Number.isFinite(payload.centerY)||payload.centerX<0||payload.centerY<0||payload.centerX>b.width||payload.centerY>b.height)throw Error('通透中心参数无效');tongtouCenters.set(win,{centerX:payload.centerX,centerY:payload.centerY});}return tongtouView(win);}
 tongtou.configure(action,payload);for(const w of BrowserWindow.getAllWindows())sendTongtou(w);return tongtouView(win);
});
const {ActionControls}=require('./action-controls.cjs');
const actions=new ActionControls({settingsPath:path.join(dir,'..','动作配置','动作管理设置.json'),catalogPath:path.join(home,'动作运行清单.json'),resourceDir:path.join(home,'dsh-pet','pet','chunxia-animation'),diagnosticPath:path.join(home,'动作管理诊断.json')});
const {SystemAudio}=require('./system-audio.cjs');
const audio=new SystemAudio({settingsPath:path.join(dir,'..','动作配置','系统音频监听设置.json'),helperPath:path.join(dir,'音频工具','SystemAudioMeter.exe'),diagnosticPath:path.join(home,'系统音频监听诊断.json'),resourceDir:path.join(home,'dsh-pet','pet','chunxia-animation'),catalog:()=>actions.catalog});
let audioTestTimer=null,audioTestUntil=0;
function audioView(value=audio.view()){return audioTestUntil>Date.now()?{...value,state:'active',test:true}:value;}
function sendAudio(win,value){if(!win.isDestroyed())win.webContents.executeJavaScript('window.__chunxiaAudioReceive?.('+JSON.stringify(audioView(value))+')').catch(()=>{});}
audio.on('state',value=>{for(const win of BrowserWindow.getAllWindows())sendAudio(win,value);refreshTray();});
ipcMain.handle('chunxia:audio',async(event,action,payload)=>{
 if(!trustedSender(event)||!['view','toggle','select','sensitivity','test','diagnostic'].includes(action))throw Error('不允许的音频请求');
 if(action==='view')return audioView();
 if(action==='diagnostic'){audio.publish();shell.openPath(path.join(home,'系统音频监听诊断.json'));return audioView();}
 if(action==='test'){clearTimeout(audioTestTimer);if(!audio.view().action||!audio.cfg.enabled)return audioView();audioTestUntil=Date.now()+20000;
  audioTestTimer=setTimeout(()=>{audioTestUntil=0;audioTestTimer=null;audio.publish();},20000);audioTestTimer.unref?.();const v=audio.view();for(const win of BrowserWindow.getAllWindows())sendAudio(win,v);return audioView(v);}
 clearTimeout(audioTestTimer);audioTestTimer=null;audioTestUntil=0;
 if(action==='toggle')return audio.configure({enabled:!audio.cfg.enabled});
 if(action==='select'&&payload&&(payload.actionId===null||typeof payload.actionId==='string'&&payload.actionId.length<=100))return audio.configure({actionId:payload.actionId});
 if(action==='sensitivity'&&payload&&[.006,.012,.025].includes(payload.threshold))return audio.configure({threshold:payload.threshold});
 throw Error('音频参数无效');
});
function sendActions(win){if(!win.isDestroyed())win.webContents.executeJavaScript('window.__chunxiaActionsReceive?.('+JSON.stringify(actions.view())+')').catch(()=>{});}
ipcMain.handle('chunxia:actions',(event,action)=>{
 if(!trustedSender(event))throw Error('不允许的动作设置请求');
 if(action==='view')return actions.view();
 if(action==='toggleMirror'){const value=actions.toggle();for(const win of BrowserWindow.getAllWindows())sendActions(win);return value;}
 if(action==='diagnostic'){const value=actions.view();try{const status=JSON.parse(fs.readFileSync(statusPath,'utf8'));fs.writeFileSync(path.join(home,'动作管理诊断.json'),JSON.stringify({...value,runtime:status.actions||null},null,2));}catch{}shell.openPath(path.join(home,'动作管理诊断.json'));return value;}
 throw Error('不允许的动作操作');
});
const {Presentation}=require('./presentation.cjs');
let nativeNotices;
const presentation=new Presentation({settingsPath:path.join(dir,'..','动作配置','状态文案与通知设置.json'),textPath:path.join(dir,'..','动作配置','春夏状态文案.json'),ledgerPath:path.join(home,'系统通知去重.json'),auditPath:path.join(dir,'..','..','05-日志','春夏系统通知.jsonl'),notify:v=>{if(!nativeNotices)throw Error('通知尚未初始化');nativeNotices.send(v);},isFocused:()=>!!BrowserWindow.getFocusedWindow()});
function sendPresentation(win){if(!win.isDestroyed())win.webContents.executeJavaScript('window.__chunxiaPresentationReceive?.('+JSON.stringify(presentation.view())+')').catch(()=>{});}
function broadcastPresentation(){for(const win of BrowserWindow.getAllWindows())sendPresentation(win);refreshTray();}
function configurePresentation(key){try{presentation.configure(key);broadcastPresentation();}catch{log('通知设置保存失败');}}
function testPresentation(kind){
 const bubbleKinds={work:'running',completeBubble:'completed',quotaBubble:'critical'};
 if(bubbleKinds[kind]){const text=presentation.picker.pick(bubbleKinds[kind],'manual-test',presentation.cfg.randomTexts)||'春夏测试提示';for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.executeJavaScript('window.__chunxiaPresentationTest?.('+JSON.stringify({kind:bubbleKinds[kind],text})+')').catch(()=>{});}
 else if(['completed','critical'].includes(kind))presentation.send(kind,'manual-'+Date.now(),{test:true});
 return presentation.view();
}
function trustedSender(event){try{const {fileURLToPath}=require('node:url');return BrowserWindow.fromWebContents(event.sender)&&event.senderFrame===event.sender.mainFrame&&path.resolve(fileURLToPath(new URL(event.sender.getURL()))).toLowerCase()===path.join(path.dirname(official),'index.html').toLowerCase();}catch{return false;}}
ipcMain.handle('chunxia:presentation',(_event,action)=>{
 if(!trustedSender(_event))throw Error('不允许的通知请求');
 if(action==='view')return {...presentation.view(),petFocused:!!BrowserWindow.getFocusedWindow()};
 if(action==='reload'){presentation.reload();broadcastPresentation();return presentation.view();}
 const toggles=['randomTexts','systemNotifications','completed','interruptedErrors','approval','quota','policy'];
 if(toggles.includes(action)){configurePresentation(action);return presentation.view();}
 if(['work','completeBubble','quotaBubble','testCompleted','testQuota'].includes(action))return testPresentation(({testCompleted:'completed',testQuota:'critical'})[action]||action);
 throw Error('不允许的通知操作');
});
const {CodexBridge}=require('./codex-bridge.cjs');
const {execFile}=require('node:child_process');
const {QuotaMonitor}=require('./codex-quota.cjs');
const quota=new QuotaMonitor({
  settingsPath:path.join(dir,'..','动作配置','Codex额度设置.json'),
  ledgerPath:path.join(home,'Codex额度提醒记录.json'),
  diagnosticPath:path.join(home,'Codex额度诊断.json')
});
function sendQuota(win,value,show=false,manual=false){
  if(win.isDestroyed()||win.webContents.isDestroyed())return;
  win.webContents.executeJavaScript('window.__chunxiaQuotaReceive?.('+JSON.stringify(value)+','+JSON.stringify(show)+','+JSON.stringify({manual})+')').catch(()=>{});
}
quota.on('data',value=>{for(const win of BrowserWindow.getAllWindows())sendQuota(win,value);refreshTray();});
quota.on('alert',value=>{const display=presentation.quotaText(value);for(const win of BrowserWindow.getAllWindows())sendQuota(win,display,true);presentation.quota(value);});
ipcMain.handle('chunxia:quota',async(event,action)=>{
  const win=BrowserWindow.fromWebContents(event.sender);
  let sourceOK=false;try{const {fileURLToPath}=require('node:url');sourceOK=path.resolve(fileURLToPath(new URL(event.sender.getURL()))).toLowerCase()===path.join(path.dirname(official),'index.html').toLowerCase();}catch{}
  if(!win||!sourceOK||event.senderFrame!==event.sender.mainFrame||!['read','toggleEnabled','toggleAuto','toggleAlerts'].includes(action))throw Error('不允许的额度请求');
  if(action==='read')return quota.refresh({manual:true});
  const key={toggleEnabled:'enabled',toggleAuto:'autoRefresh',toggleAlerts:'alerts'}[action];
  return quota.configure({[key]:!quota.cfg[key]});
});
const bridge=new CodexBridge({
  settingsPath:path.join(dir,'..','动作配置','Codex监听设置.json'),
  diagnosticPath:path.join(home,'Codex监听诊断.json'),
  checkpointPath:path.join(home,'Codex监听游标.json'),
  auditPath:path.join(dir,'..','..','05-日志','Codex状态事件.jsonl'),
  checkClient:()=>new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',
    "if(Get-Process -Name codex -ErrorAction SilentlyContinue){'online'}else{'offline'}"],
    {windowsHide:true,timeout:3000,maxBuffer:1024},(err,out)=>resolve(err?null:out.trim()==='online')))
});
function sendStatus(win,value){
  value=presentation.decorate(value);
  if(win.isDestroyed()||win.webContents.isDestroyed())return;
  // No renderer-to-main command endpoint; only a validated state snapshot goes in.
  win.webContents.executeJavaScript('window.__chunxiaCodexReceive?.('+JSON.stringify(value)+')').then(ack=>{
    if(!ack||ack.state!==value.state)return;
    const proofPath=path.join(home,'Codex实机会话记录.json');
    let proof={署名:'莺空社区',source:'真实Codex Desktop会话记录→Electron界面',visual:'MANUAL REQUIRED'};
    try{proof=JSON.parse(fs.readFileSync(proofPath,'utf8'));}catch{}
    const evidence={at:new Date().toISOString(),session:value.session,turn:value.turn,eventId:value.eventId,
      state:value.state,live:value.notify===true,ack};
    if(value.state==='running'){
      if(proof.end&&(proof.end.turn!==evidence.turn||proof.end.session!==evidence.session))delete proof.end;
      proof.start=evidence;
    }
    if(['completed','interrupted','failed'].includes(value.state)&&value.notify===true)proof.end=evidence;
    proof.status=proof.start&&proof.end&&proof.start.turn===proof.end.turn&&proof.start.session===proof.end.session?'真实任务状态闭环已收到':'已收到真实处理中状态；等待同轮实时结束事件';
    try{fs.writeFileSync(proofPath,JSON.stringify(proof,null,2));}catch{}
    if(value.state==='completed'&&value.notify===true&&ack.bubbleVisible){
      setTimeout(()=>{if(!win.isDestroyed())win.webContents.capturePage().then(img=>
        fs.writeFileSync(path.join(home,'Codex真实完成提示.png'),img.toPNG())).catch(()=>{});},350);
    }
  }).catch(()=>{});
}
bridge.on('state',value=>{
  presentation.state(value);
  for(const win of BrowserWindow.getAllWindows())sendStatus(win,value);
  refreshTray();
});
let cleanupDone=false;
let cleanupAudio=Promise.resolve();
function cleanup(){if(cleanupDone)return cleanupAudio;cleanupDone=true;clearTimeout(audioTestTimer);audioTestTimer=null;cleanupAudio=audio.dispose();bridge.stop();quota.stop();presentation.stop();nativeNotices?.stop();ipcMain.removeHandler('chunxia:presentation');ipcMain.removeHandler('chunxia:actions');ipcMain.removeHandler('chunxia:audio');ipcMain.removeHandler('chunxia:tongtou');ipcMain.removeHandler('chunxia:size');ipcMain.removeHandler('chunxia:playback-restart');shutdownWatch?.close();return cleanupAudio;}
app.on('before-quit',cleanup);app.on('will-quit',cleanup);process.on('exit',cleanup);
// Windows host uses TerminateProcess: bounded local-file handshake before its existing /shutdown.
// Same-user project file only; fixed cleanup action, no executable command or event payload.
const shutdownRequest=path.join(home,'春夏退出请求.json'),shutdownAck=path.join(home,'春夏退出确认.json'),startedAt=Date.now();
const shutdownWatch=fs.watch(home,{persistent:false},(_event,name)=>{
 if(String(name)!=='春夏退出请求.json'||cleanupDone)return;
 try{if(fs.statSync(shutdownRequest).size>256)return;const r=JSON.parse(fs.readFileSync(shutdownRequest,'utf8'));if(!/^[a-f0-9]{32}$/.test(r.id)||!Number.isFinite(r.at)||r.at<startedAt||Math.abs(Date.now()-r.at)>5000)return;
 cleanup().then(()=>fs.writeFileSync(shutdownAck,JSON.stringify({id:r.id,pid:process.pid,cleaned:true}))).catch(()=>{});}catch{}
});
shutdownWatch.on('error',()=>log('退出清理观察器不可用；系统仍会释放进程资源'));
function log(s){
  if(eventLog) fs.appendFileSync(eventLog,new Date().toISOString()+' '+s+'\n','utf8');
}
app.on('browser-window-created',(_event,win)=>{
  let timer;
  win.on('move',()=>{if(!cleanupDone)sendTongtou(win);});
  win.on('resize',()=>{if(!cleanupDone)sendTongtou(win);});
  win.webContents.on('console-message',(event)=>log('renderer '+event.message));
  win.webContents.on('did-finish-load',async()=>{
    clearInterval(timer);
    try {
      win.setTitle('春夏 — 莺空社区');
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'renderer-addon.js'),'utf8'));
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'action-policy.js'),'utf8'));
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'playback-health.js'),'utf8'));
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'action-addon.js'),'utf8'));
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'audio-addon.js'),'utf8'));
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'size-addon.js'),'utf8'));
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'tongtou-core.js'),'utf8'));
      await win.webContents.executeJavaScript(fs.readFileSync(path.join(dir,'tongtou-addon.js'),'utf8'));
      sendTongtou(win);
      sendActions(win);
      sendStatus(win,{...(bridge.current||bridge.snapshot()),notify:false});
      sendQuota(win,quota.view());
      sendPresentation(win);
      sendAudio(win,audio.view());
      let lastAnim='';
      timer=setInterval(async()=>{
        if(win.isDestroyed()) return;
        try{
          const snapshot=await win.webContents.executeJavaScript('window.__chunxiaSnapshot?.()');
          if(snapshot?.ready&&!snapshot.codex)sendStatus(win,{...(bridge.current||bridge.snapshot()),notify:false});
          if(snapshot?.ready&&!snapshot.quota)sendQuota(win,quota.view());
          if(snapshot?.ready&&!snapshot.actions)sendActions(win);
          if(snapshot?.ready&&!snapshot.audio)sendAudio(win,audio.view());
          const record={...snapshot,pid:process.pid,hostPid:Number(process.env.DSH_PET_HOST_PID),
            timestamp:new Date().toISOString(),bounds:win.getBounds(),visible:win.isVisible(),
            alwaysOnTop:win.isAlwaysOnTop(),userData:app.getPath('userData')};
          fs.writeFileSync(statusPath+'.tmp',JSON.stringify(record,null,2),'utf8');
          fs.renameSync(statusPath+'.tmp',statusPath);
          if(snapshot?.anim && snapshot.anim!==lastAnim){lastAnim=snapshot.anim;log('animation '+lastAnim);}
        }catch(e){log('snapshot '+e.message);}
      },500);
    }catch(e){log('适配层失败 '+e.stack); app.exit(2);}
  });
  win.on('closed',()=>clearInterval(timer));
});
function shutdown(){
  cleanup();
  const u=new URL('/shutdown',process.env.DSH_PET_CONFIG_URL);
  if(u.hostname!=='127.0.0.1') return;
  const req=http.request(u,{method:'POST'},res=>res.resume());req.on('error',()=>app.quit());req.end();
}
let tray;
function refreshTray(){
  if(!tray||tray.isDestroyed())return;
  const setQuota=patch=>quota.configure(patch).catch(()=>log('额度设置保存失败；状态监听继续运行'));
  const toggle=(key)=>()=>bridge.configure({[key]:!bridge.options[key]}).catch(()=>log('Codex设置保存失败'));
  tray.setContextMenu(Menu.buildFromTemplate([
    {label:'春夏 · 莺空社区',enabled:false},
    {label:'尺寸：右键角色 → 桌宠尺寸',enabled:false},
    {type:'separator'},
    {label:'Codex 状态监听',type:'checkbox',checked:bridge.options.enabled,click:toggle('enabled')},
    {label:'显示状态气泡',type:'checkbox',checked:bridge.options.bubbles,click:toggle('bubbles')},
    {label:'任务完成气泡',type:'checkbox',checked:bridge.options.completionNotice,click:toggle('completionNotice')},
    {label:'任务完成时播放完成动画',type:'checkbox',checked:bridge.options.completionWave,click:toggle('completionWave')},
    {label:'Codex：'+bridge.connection,enabled:false},
    {label:'打开监听诊断',click:()=>shell.openPath(path.join(home,'Codex监听诊断.json'))},
    {type:'separator'},
    {label:'查看 Codex 额度',click:async()=>{
      for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.executeJavaScript('window.__chunxiaQuotaLoading?.()').catch(()=>{});
      try{const value=await quota.refresh({manual:true});for(const win of BrowserWindow.getAllWindows())sendQuota(win,value,true,true);}
      catch{for(const win of BrowserWindow.getAllWindows())if(!win.isDestroyed())win.webContents.executeJavaScript('window.__chunxiaQuotaFailure?.()').catch(()=>{});}
    }},
    {label:'Codex 额度监控',type:'checkbox',checked:quota.cfg.enabled,click:()=>setQuota({enabled:!quota.cfg.enabled})},
    {label:'额度自动刷新（默认10分钟）',type:'checkbox',checked:quota.cfg.autoRefresh,click:()=>setQuota({autoRefresh:!quota.cfg.autoRefresh})},
    {label:'额度不足提醒',type:'checkbox',checked:quota.cfg.alerts,click:()=>setQuota({alerts:!quota.cfg.alerts})},
    {label:'额度：'+quota.view().label,enabled:false},
    {label:'打开额度诊断',click:()=>shell.openPath(path.join(home,'Codex额度诊断.json'))},
    {type:'separator'},
    {label:'系统音频监听',type:'checkbox',checked:audio.cfg.enabled,click:()=>audio.configure({enabled:!audio.cfg.enabled}).catch(()=>log('音频设置保存失败'))},
    {label:'音频：'+({active:'活跃',quiet:'安静',unavailable:'不可用',disabled:'已关闭'}[audio.cfg.enabled?audio.gate.state:'disabled']||'不可用')+(audio.view().notice?'；音频待机素材未配置':''),enabled:false},
    {label:'音频设置：右键点击角色→系统音频监听',enabled:false},
    {type:'separator'},
    {label:'文案与 Windows 通知',submenu:[
      ...[['randomTexts','启用状态随机文案'],['systemNotifications','启用 Windows 系统通知'],['completed','Codex 任务完成系统通知'],['interruptedErrors','Codex 中断/异常系统通知'],['approval','Codex 待确认系统通知'],['quota','额度不足系统通知']].map(([key,label])=>({label,type:'checkbox',checked:presentation.cfg[key],click:()=>configurePresentation(key)})),
      {label:'通知策略：'+(presentation.cfg.policy==='always'?'重要事件始终提醒':'桌宠窗口未获焦点时提醒'),click:()=>configurePresentation('policy')},
      {label:'重新加载本地文案',click:()=>{presentation.reload();broadcastPresentation();}},
      {label:'打开文案配置',click:()=>shell.openPath(presentation.textPath)},
      {label:'通知状态与权限诊断',click:()=>shell.openPath(path.join(home,'Windows通知诊断.json'))},
      {label:'人工验收测试（模拟UI）',submenu:[['work','普通工作气泡'],['completeBubble','任务完成气泡'],['quotaBubble','额度不足气泡'],['completed','任务完成 Windows 通知'],['critical','额度不足 Windows 通知']].map(([kind,label])=>({label,click:()=>testPresentation(kind)}))}
    ]},
    {type:'separator'},{label:'退出春夏桌宠',click:shutdown}
  ]));
}
app.whenReady().then(()=>{
  try{nativeNotices=require('./windows-notifications.cjs').initialize({app,shell,Notification,nativeImage,root:process.env.CHUNXIA_LAUNCH_ROOT||path.resolve(dir,'..','..'),icon:path.join(dir,'春夏托盘.png'),report:path.join(home,'Windows通知诊断.json')});presentation.status=nativeNotices.diagnostic.identity?'Windows通知身份已配置；横幅显示及勿扰模式请人工确认':'通知身份不可用；请查看通知诊断';}catch{presentation.status='Windows通知初始化失败；桌宠仍可使用';}

  try{session.defaultSession.registerPreloadScript({type:'frame',filePath:path.join(dir,'quota-preload.cjs')});}
  catch{log('额度菜单IPC初始化失败；状态监听继续运行');}
  const image=nativeImage.createFromPath(path.join(dir,'春夏托盘.png'));
  tray=new Tray(image.resize({width:32,height:32}));
  tray.setToolTip('春夏桌宠 · 莺空社区');
  refreshTray();
  bridge.start().catch(()=>log('Codex监听不可用，桌宠继续运行'));
  quota.start().catch(()=>log('额度读取不可用；状态监听继续运行'));
  audio.start().catch(()=>log('系统音频监听不可用；桌宠继续运行'));
});
require(official);
