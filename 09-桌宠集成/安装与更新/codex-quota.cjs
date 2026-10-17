// 莺空社区 · V0.4 read-only Codex subscription quota. No auth-file contents or inference.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const {spawn}=require('node:child_process'),{createHash}=require('node:crypto'),{EventEmitter}=require('node:events');
const {performance}=require('node:perf_hooks');
const os=require('node:os');
const {resolveEngine,sameHome}=require('./codex-runtime.cjs');
const sha=x=>typeof x==='string'?createHash('sha256').update(x).digest('hex'):null;
const finite=x=>typeof x==='number'&&Number.isFinite(x);
const DEFAULT={enabled:true,autoRefresh:true,alerts:true,refreshSeconds:600,lowThreshold:30,criticalThreshold:10};
const LABELS={disabled:'额度监控已关闭',loading:'正在读取 Codex 额度…',connected:'已读取已核对账号额度',
 not_logged_in:'未登录 Codex',api_key_mode:'当前为 API Key 模式，不是订阅额度',account_mismatch:'查询期间账号不一致，暂不显示额度',
 identity_unverified:'账号身份尚未核对，暂不显示额度',auth_changed:'认证环境变化，旧额度已清除',
 network_error:'网络异常，暂时无法获取额度',auth_expired:'登录认证失效',unsupported:'当前服务暂不支持额度读取',
 unavailable:'暂时无法获取额度',stale:'额度数据已过期，请刷新',clock_skew:'本机时间发生变化，请核对系统时间并刷新'};
function sanitizeSettings(v={}){
 if(!v||typeof v!=='object'||Array.isArray(v))v={};
 const o={...DEFAULT};for(const k of ['enabled','autoRefresh','alerts'])if(typeof v[k]==='boolean')o[k]=v[k];
 if(Number.isInteger(v.refreshSeconds)&&v.refreshSeconds>=60&&v.refreshSeconds<=86400)o.refreshSeconds=v.refreshSeconds;
 if(finite(v.lowThreshold)&&v.lowThreshold>0&&v.lowThreshold<=100)o.lowThreshold=v.lowThreshold;
 if(finite(v.criticalThreshold)&&v.criticalThreshold>0&&v.criticalThreshold<o.lowThreshold)o.criticalThreshold=v.criticalThreshold;
 if(o.criticalThreshold>=o.lowThreshold)o.criticalThreshold=o.lowThreshold/2;
 for(const k of ['enginePath','codexHome'])if(typeof v[k]==='string'&&v[k].length<2048&&path.isAbsolute(v[k]))o[k]=v[k];
 o.codexHome=o.codexHome||process.env.CODEX_HOME||path.join(os.homedir(),'.codex');
 return o;
}
// File metadata only; never deserialize authentication credentials.
function authStamp(home){try{const s=fs.statSync(path.join(home,'auth.json'),{bigint:true});return [s.ino,s.size,s.mtimeNs,s.ctimeNs].join(':');}catch(e){return e.code==='ENOENT'?'missing':'unreadable';}}
function quotaWindow(w,slot,now=Date.now()){
 if(!w||typeof w!=='object')return null;
 const valid=finite(w.usedPercent)&&w.usedPercent>=0&&w.usedPercent<=100;
 const mins=finite(w.windowDurationMins)&&w.windowDurationMins>0&&w.windowDurationMins<=5256000?w.windowDurationMins:null;
 const reset=Number.isInteger(w.resetsAt)&&w.resetsAt>=1000000000&&w.resetsAt<=4102444800?w.resetsAt:null;
 return {slot,usedPercent:valid?w.usedPercent:null,remainingPercent:valid?Math.max(0,Math.min(100,100-w.usedPercent)):null,
   windowDurationMins:mins,resetsAt:reset,invalidPercent:!valid,resetPast:reset!==null&&reset*1000<now-60000};
}
function normalize(raw,now=Date.now()){
 if(!raw||typeof raw!=='object')throw Object.assign(Error('unavailable'),{kind:'unavailable'});
 let entries=raw.rateLimitsByLimitId&&typeof raw.rateLimitsByLimitId==='object'?Object.entries(raw.rateLimitsByLimitId):[];
 if(!entries.length&&raw.rateLimits)entries=[[raw.rateLimits.limitId||'codex',raw.rateLimits]];
 const buckets=entries.sort(([a],[b])=>(a==='codex'?-1:0)-(b==='codex'?-1:0)).slice(0,16).filter(([k,b])=>typeof k==='string'&&k.length<=80&&b&&typeof b==='object').map(([k,b])=>({
   id:k,name:typeof b.limitName==='string'?b.limitName.slice(0,80):k,
   planType:typeof b.planType==='string'&&/^[a-z0-9_]{1,60}$/.test(b.planType)?b.planType:null,
   reachedType:typeof b.rateLimitReachedType==='string'&&/^[a-z_]{1,100}$/.test(b.rateLimitReachedType)?b.rateLimitReachedType:null,
   windows:[quotaWindow(b.primary,'primary',now),quotaWindow(b.secondary,'secondary',now)].filter(Boolean)}));
 if(!buckets.length)throw Object.assign(Error('unsupported'),{kind:'unsupported'});
 const count=raw.rateLimitResetCredits?.availableCount;
 return {buckets,mainBucketId:buckets.some(b=>b.id==='codex')?'codex':buckets[0].id,
   resetAvailableCount:Number.isInteger(count)&&count>=0&&count<=100000?count:null,
   ordinaryUsageAllowed:typeof raw.ordinaryUsageAllowed==='boolean'?raw.ordinaryUsageAllowed:null,
   creditDetailsReturned:buckets.some(b=>raw.rateLimitsByLimitId?.[b.id]?.credits!=null)||raw.rateLimits?.credits!=null,
   fetchedAt:now};
}
function windowName(w){
 const m=w.windowDurationMins;if(m===null)return w.slot==='primary'?'主窗口（时长未知）':'次窗口（时长未知）';
 if(m%1440===0)return m/1440===7?'7天窗口':`${m/1440}天窗口`;
 if(m%60===0)return `${m/60}小时窗口`;return `${m}分钟窗口`;
}
function resetText(w,now=Date.now(),timeZone=Intl.DateTimeFormat().resolvedOptions().timeZone){
 if(w.resetsAt===null)return '重置时间未知';
 const date=new Date(w.resetsAt*1000),left=w.resetsAt*1000-now;
 const local=new Intl.DateTimeFormat('zh-CN',{timeZone,month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date);
 if(left<=0)return `${local}（已到重置时间，待服务端更新）`;
 const mins=Math.max(1,Math.ceil(left/60000));let relative;
 if(mins>=1440)relative=`约${Math.floor(mins/1440)}天${Math.floor(mins%1440/60)}小时后`;
 else if(mins>=60)relative=`约${Math.floor(mins/60)}小时${mins%60}分后`;
 else relative=`约${mins}分钟后`;
 return `${local}（${relative}）`;
}
function rowsFor(view,now=Date.now(),tz){
 const rows=[{role:'label',text:'Codex 使用额度'}];
 if(view.status!=='connected'||!view.data){rows.push({role:'error',text:LABELS[view.status]||LABELS.unavailable});return rows;}
 const main=view.data.buckets.find(b=>b.id===view.data.mainBucketId);
 for(const w of main?.windows||[]){
  rows.push({role:'label',text:`${windowName(w)}：${w.remainingPercent===null?'比例未知':'剩余 '+Math.round(w.remainingPercent*10)/10+'%'}`});
  rows.push({role:'sub',text:'重置：'+resetText(w,now,tz)});
 }
 if(!main?.windows.length)rows.push({role:'sub',text:'服务端未提供窗口数据'});
 if(view.data.ordinaryUsageAllowed===false||main?.reachedType)rows.push({role:'error',text:'服务端当前限制使用；比例不代表已解除限制'});
 return rows.slice(0,7);
}
const failure=kind=>Object.assign(Error(kind),{kind});
function classifyError(err){
 const s=String(err?.message||'').toLowerCase();
 if(err?.kind&&Object.hasOwn(LABELS,err.kind))return err.kind;
 if(/401|unauthorized|authentication expired|refresh.*token/.test(s))return 'auth_expired';
 if(/not authenticated|authentication required|not logged/.test(s))return 'not_logged_in';
 if(/method not found|unsupported|not support|-32601/.test(s))return 'unsupported';
 if(/timeout|network|connection|dns|fetch|transport/.test(s))return 'network_error';
 return 'unavailable';
}
class ReadonlyRpc{
 constructor(cfg,signal){
  this.pending=new Map();this.sequence=0;this.buffer=Buffer.alloc(0);this.methods=[];this.closed=false;
  this.child=spawn(cfg.enginePath,['app-server','--listen','stdio://'],{windowsHide:true,env:{...process.env,CODEX_HOME:cfg.codexHome},stdio:['pipe','pipe','ignore']});
  this.done=new Promise(resolve=>this.child.once('exit',(code,sign)=>{this.exit={code,signal:sign};this.rejectAll(failure('unavailable'));resolve();}));
  this.child.on('error',()=>this.rejectAll(failure('unavailable')));this.child.stdin.on('error',()=>this.rejectAll(failure('unavailable')));
  this.child.stdout.on('data',chunk=>{
   this.buffer=Buffer.concat([this.buffer,chunk]);if(this.buffer.length>4*1024*1024){this.rejectAll(failure('unavailable'));this.child.kill();return;}
   let idx;while((idx=this.buffer.indexOf(10))!==-1){const line=this.buffer.subarray(0,idx);this.buffer=this.buffer.subarray(idx+1);this.consume(line);}
  });
  this.onAbort=()=>{this.rejectAll(failure('unavailable'));this.child.stdin.end();};
  signal?.addEventListener('abort',this.onAbort,{once:true});this.signal=signal;if(signal?.aborted)this.onAbort();
 }
 consume(line){
  try{const r=JSON.parse(line.toString('utf8'));
   if(r.method&&r.id!==undefined){this.child.stdin.write(JSON.stringify({id:r.id,error:{code:-32601,message:'Read-only client does not handle server requests'}})+'\n');return;}
   const p=this.pending.get(r.id);if(!p)return;this.pending.delete(r.id);clearTimeout(p.timer);
   r.error?p.reject(failure(classifyError(r.error))):p.resolve(r.result);
  }catch{/* no raw response/logging */}
 }
 rejectAll(err){for(const p of this.pending.values()){clearTimeout(p.timer);p.reject(err);}this.pending.clear();}
 call(method,params){
  if(!['initialize','account/read','account/rateLimits/read'].includes(method))return Promise.reject(failure('unsupported'));
  if(this.closed||this.signal?.aborted)return Promise.reject(failure('unavailable'));
  this.methods.push(method);return new Promise((resolve,reject)=>{const id=++this.sequence;
   const timer=setTimeout(()=>{this.pending.delete(id);reject(failure('network_error'));},15000);
   this.pending.set(id,{resolve,reject,timer});this.child.stdin.write(JSON.stringify({id,method,params})+'\n');});
 }
 async close(){
  if(this.closed)return;this.closed=true;this.signal?.removeEventListener('abort',this.onAbort);this.rejectAll(failure('unavailable'));this.child.stdin.end();
  let timer;await Promise.race([this.done,new Promise(r=>{timer=setTimeout(r,2500);})]);clearTimeout(timer);
  if(!this.exit){this.child.kill();let force;await Promise.race([this.done,new Promise(r=>{force=setTimeout(r,1500);})]);clearTimeout(force);}
 }
}
async function queryOfficial(cfg,signal,onSpawn,deps={}){
 if(!cfg.codexHome)throw failure('identity_unverified');
 const enginePath=await (deps.resolveEngine||resolveEngine)(cfg.enginePath);if(!enginePath)throw failure('unsupported');
 cfg={...cfg,enginePath};
 const readStamp=deps.authStamp||authStamp,stamp=readStamp(cfg.codexHome);if(stamp==='unreadable')throw failure('identity_unverified');
 const rpc=deps.createRpc?deps.createRpc(cfg,signal):new ReadonlyRpc(cfg,signal),started=Date.now();let result;
 onSpawn?.(rpc.child.pid);
 const auth=a=>{
  if(!a?.account)throw failure('not_logged_in');if(a.account.type==='apiKey')throw failure('api_key_mode');
  if(a.account.type!=='chatgpt')throw failure('unsupported');
  const routing=a.workspaceRouting;let origin;
  try{origin=new URL(routing.backendOrigin);}catch{throw failure('identity_unverified');}
  if(origin.protocol!=='https:'||!['chatgpt.com','chat.openai.com'].includes(origin.hostname)||origin.username||origin.password)throw failure('unsupported');
  const fingerprint=sha(routing.chatgptAccountId);
  const userFingerprint=sha(a.account.email);
  if(!fingerprint||!routing.chatgptAccountId||!userFingerprint||!a.account.email)throw failure('identity_unverified');
  return {accountFingerprint:fingerprint,userFingerprint};
 };
 try{
  const init=await rpc.call('initialize',{clientInfo:{name:'chunxia_quota',version:'0.4.0'},capabilities:{explicitGatewayOauth:true,experimentalApi:true}});
  if(!sameHome(init,cfg.codexHome))throw failure('unsupported');
  rpc.child.stdin.write('{"method":"initialized"}\n');
  const before=auth(await rpc.call('account/read',{refreshToken:false}));
  const raw=await rpc.call('account/rateLimits/read',{});
  if(sha(raw.accountId)!==before.accountFingerprint)throw failure('account_mismatch');
  const after=auth(await rpc.call('account/read',{refreshToken:false}));
  if(before.accountFingerprint!==after.accountFingerprint||before.userFingerprint!==after.userFingerprint)throw failure('account_mismatch');
  if(signal?.aborted||readStamp(cfg.codexHome)!==stamp)throw failure('auth_changed');
  result={...after,identityVerified:true,data:normalize(raw),telemetry:{pid:rpc.child.pid,elapsedMs:Date.now()-started,methods:rpc.methods,createdTasks:0,identityChecks:['official_origin','same_codex_home','account_before_after','quota_account','auth_metadata_unchanged']}};
 }finally{await rpc.close();}
 result.telemetry.helperExited=!!rpc.exit;return result;
}
class AlertLedger{
 constructor(value={}){this.values=value&&typeof value==='object'&&!Array.isArray(value)?value:{};}
 clear(){this.values={};}
 check(account,data,cfg){
  const alerts=[];
  for(const b of data.buckets)for(const w of b.windows){
   if(w.remainingPercent===null||w.resetPast)continue;
   const key=[account,b.id,w.slot,w.windowDurationMins,w.resetsAt||'unknown'].join('|'),v=this.values[key]||{};
   const bands=[['low',cfg.lowThreshold,w.remainingPercent<cfg.lowThreshold],['critical',cfg.criticalThreshold,w.remainingPercent<cfg.criticalThreshold],['empty',0,w.remainingPercent===0]];
   for(const [level,,below] of bands){if(!below)delete v[level];else if(!v[level]){v[level]=true;alerts.push({level,bucket:b.id,window:windowName(w),remaining:w.remainingPercent});}}
   this.values[key]=v;
  }
  const keys=Object.keys(this.values);for(const k of keys.slice(0,Math.max(0,keys.length-256)))delete this.values[k];
  const priority={empty:0,critical:1,low:2};return alerts.sort((a,b)=>priority[a.level]-priority[b.level])[0]||null;
 }
}
class QuotaMonitor extends EventEmitter{
 constructor({settingsPath,ledgerPath,diagnosticPath,provider=queryOfficial,now=Date.now,mono=()=>performance.now()}={}){
  super();Object.assign(this,{settingsPath,ledgerPath,diagnosticPath,provider,now,mono});
  try{this.cfg=sanitizeSettings(JSON.parse(fs.readFileSync(settingsPath,'utf8')));}catch{this.cfg=sanitizeSettings();}
  try{this.ledger=new AlertLedger(JSON.parse(fs.readFileSync(ledgerPath,'utf8')));}catch{this.ledger=new AlertLedger();}
  this.status=this.cfg.enabled?'loading':'disabled';this.data=null;this.inflight=null;this.timer=null;this.watcher=null;this.generation=0;this.failures=0;this.started=false;this.lastRequestAt=0;
  this.wall=this.now();this.tick=this.mono();this.telemetry=null;this.revision=0;
  this.identity=null;this.identityPath=ledgerPath?path.join(path.dirname(ledgerPath),'Codex额度身份缓存.json'):null;
  try{const saved=JSON.parse(fs.readFileSync(this.identityPath,'utf8'));if(/^[a-f0-9]{64}$/.test(saved.accountFingerprint)&&/^[a-f0-9]{64}$/.test(saved.userFingerprint))this.identity=saved;}catch{}
 }
 view(){
  let status=this.status;
  if(status==='connected'&&this.data&&this.now()-this.data.fetchedAt>Math.max(this.cfg.refreshSeconds*1500,900000))status='stale';
  return {status,revision:this.revision,label:LABELS[status]||LABELS.unavailable,data:status==='connected'?this.data:null,
    options:{enabled:this.cfg.enabled,autoRefresh:this.cfg.autoRefresh,alerts:this.cfg.alerts},
    verifiedAccount:status==='connected',source:'官方本地app-server只读查询（已核对账号）',
    rows:rowsFor({status,data:this.data},this.now()),lastUpdated:this.data?.fetchedAt||null,
    expiresAt:this.data?this.data.fetchedAt+Math.max(this.cfg.refreshSeconds*1500,900000):null};
 }
 publish(){
  this.revision++;const v=this.view();if(this.diagnosticPath)try{fs.mkdirSync(path.dirname(this.diagnosticPath),{recursive:true});
    fs.writeFileSync(this.diagnosticPath,JSON.stringify({...v,telemetry:this.telemetry,activeHelperPid:this.activeHelperPid||null,updatedAt:this.now(),sourceIdentity:'每次查询重新核验本机Codex认证上下文；缓存只保存哈希，不绑定固定个人账号'},null,2));}catch{}
  this.emit('data',v);return v;
 }
 watchAuth(){
  if(this.watcher||!this.cfg.codexHome)return;
  try{this.watcher=fs.watch(this.cfg.codexHome,(_event,name)=>{if(String(name)==='auth.json'){
    this.pendingIdentityRefresh=this.cfg.autoRefresh;this.invalidate('auth_changed');this.schedule(2000);
  }});this.watcher.on('error',()=>{this.invalidate('identity_unverified');this.watcher?.close();this.watcher=null;});}catch{}
 }
 invalidate(status='identity_unverified'){
  this.generation++;this.abort?.abort();this.data=null;this.telemetry=null;this.status=status;
  if(status!=='clock_skew'){this.ledger.clear();this.saveLedger();this.identity=null;this.saveIdentity();}this.publish();
 }
 saveIdentity(){if(this.identityPath)try{if(this.identity)fs.writeFileSync(this.identityPath,JSON.stringify(this.identity));else fs.rmSync(this.identityPath,{force:true});}catch{}}
 saveLedger(){if(this.ledgerPath)try{fs.mkdirSync(path.dirname(this.ledgerPath),{recursive:true});fs.writeFileSync(this.ledgerPath,JSON.stringify(this.ledger.values));}catch{}}
 schedule(delay){
  clearTimeout(this.timer);this.timer=null;if(!this.started||!this.cfg.enabled||!this.cfg.autoRefresh)return;
  this.timer=setTimeout(()=>{this.timer=null;this.refresh().catch(()=>{});},delay??this.cfg.refreshSeconds*1000);this.timer.unref?.();
 }
 async start(){if(this.started)return;this.started=true;if(!this.cfg.enabled){this.publish();return;}this.watchAuth();if(this.cfg.autoRefresh)await this.refresh();else this.publish();}
 refresh({manual=false}={}){
  if(!this.cfg.enabled)return Promise.resolve(this.view());
  if(this.inflight)return this.inflight;
  if(manual&&this.now()-this.lastRequestAt>=0&&this.now()-this.lastRequestAt<5000&&this.status!=='auth_changed')return Promise.resolve(this.view());
  const drift=Math.abs((this.now()-this.wall)-(this.mono()-this.tick));
  if(drift>120000){this.wall=this.now();this.tick=this.mono();this.invalidate('clock_skew');this.schedule();return Promise.resolve(this.view());}
  this.lastRequestAt=this.now();const generation=this.generation;this.abort=new AbortController();this.status='loading';this.data=null;this.publish();
  this.inflight=(async()=>{
   try{
    const result=await Promise.resolve().then(()=>this.provider(this.cfg,this.abort.signal,pid=>{this.activeHelperPid=pid;this.publish();}));
    if(generation!==this.generation||!this.cfg.enabled)return this.view();
    if(result.identityVerified!==true||!/^[a-f0-9]{64}$/.test(result.accountFingerprint)||!/^[a-f0-9]{64}$/.test(result.userFingerprint))throw failure('identity_unverified');
    if(!this.identity||this.identity.accountFingerprint!==result.accountFingerprint||this.identity.userFingerprint!==result.userFingerprint){this.ledger.clear();this.saveLedger();}
    this.identity={accountFingerprint:result.accountFingerprint,userFingerprint:result.userFingerprint};this.saveIdentity();
    this.data=result.data;this.telemetry=result.telemetry;this.status='connected';this.failures=0;
    if(this.cfg.alerts){const alert=this.ledger.check(result.accountFingerprint,result.data,this.cfg);this.saveLedger();if(alert)this.emit('alert',{...this.view(),alert});}
   }catch(err){if(generation===this.generation&&this.cfg.enabled){this.data=null;this.status=classifyError(err);this.failures++;
     if(['account_mismatch','not_logged_in','api_key_mode','auth_expired','identity_unverified','auth_changed'].includes(this.status)){this.ledger.clear();this.saveLedger();this.identity=null;this.saveIdentity();}}}
   finally{this.inflight=null;this.abort=null;this.activeHelperPid=null;
     if(this.pendingIdentityRefresh){this.pendingIdentityRefresh=false;this.schedule(2000);}
     else this.schedule(this.failures?Math.min(3600000,Math.max(60000,this.cfg.refreshSeconds*1000)*2**Math.min(this.failures-1,4)):undefined);}
   return this.publish();
  })();return this.inflight;
 }
 async configure(patch){
  const wasEnabled=this.cfg.enabled;
  const allowed={};for(const k of ['enabled','autoRefresh','alerts'])if(typeof patch?.[k]==='boolean')allowed[k]=patch[k];
  this.cfg=sanitizeSettings({...this.cfg,...allowed});
  if(this.settingsPath){const tmp=this.settingsPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.cfg,null,2));fs.renameSync(tmp,this.settingsPath);}
  if(!this.cfg.enabled){this.stop();this.status='disabled';this.data=null;return this.publish();}
  if(!this.started){this.started=true;this.watchAuth();}
  if(!wasEnabled){this.status='loading';this.lastRequestAt=0;if(this.inflight)await this.inflight;
    if(this.cfg.autoRefresh)return this.refresh();}
  this.schedule();return this.publish();
 }
 stop(){this.started=false;this.generation++;clearTimeout(this.timer);this.timer=null;this.watcher?.close();this.watcher=null;this.abort?.abort();}
}
module.exports={sanitizeSettings,normalize,quotaWindow,windowName,resetText,rowsFor,classifyError,ReadonlyRpc,queryOfficial,AlertLedger,QuotaMonitor,LABELS};
