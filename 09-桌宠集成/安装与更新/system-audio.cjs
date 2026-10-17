// 莺空社区. Volume metadata only, no microphone, audio samples or network.
'use strict';
const fs=require('node:fs'),path=require('node:path'),{spawn}=require('node:child_process'),{EventEmitter}=require('node:events');
const {performance}=require('node:perf_hooks');
const DEFAULT={enabled:true,type:'audio_idle',actionId:null,threshold:.012,offRatio:.6,attackMs:2000,releaseMs:5000};
function settings(v={}){if(!v||typeof v!=='object'||Array.isArray(v))v={};const o={...DEFAULT};if(typeof v.enabled==='boolean')o.enabled=v.enabled;if(typeof v.actionId==='string'&&/^[A-Za-z0-9_-]{1,100}$/.test(v.actionId))o.actionId=v.actionId;
 for(const [k,min,max] of [['threshold',.001,.2],['offRatio',.2,.9],['attackMs',1000,10000],['releaseMs',2000,30000]])if(typeof v[k]==='number'&&Number.isFinite(v[k])&&v[k]>=min&&v[k]<=max)o[k]=v[k];return o;}
function eligible(catalog,resourceDir){const stages=Object.values(catalog?.statusActions||{});return (catalog?.actions||[]).filter(a=>a.trigger!=='点击'&&a.trigger!=='拖动'&&!stages.includes(a.id)&&(a.category==='audio_idle'||catalog.idlePool?.includes(a.id)||a.name===catalog.defaultIdle)&&(!resourceDir||typeof a.file==='string'&&path.basename(a.file)===a.file&&fs.existsSync(path.join(resourceDir,a.file))));}
class AudioGate{
 constructor(cfg={}){this.configure(cfg);this.reset();}
 configure(cfg){this.cfg=settings(cfg);this.high=null;this.low=null;}
 reset(){this.state='unavailable';this.smooth=0;this.last=null;this.device=null;this.high=null;this.low=null;}
 sample(v,now){
  if(!v||v.v!==1||typeof v.available!=='boolean'||!Number.isFinite(v.peak)||v.peak<0||v.peak>1||!Number.isSafeInteger(v.deviceRevision)||v.deviceRevision<0)return false;
  const before=this.state;
  if(!v.available){this.reset();return before!==this.state;}
  if(this.device!==v.deviceRevision){this.reset();this.device=v.deviceRevision;}
  if(this.last!==null&&now-this.last>1200){this.state='unavailable';this.smooth=0;this.last=null;this.high=null;this.low=null;}
  const dt=this.last===null?200:Math.min(500,Math.max(0,now-this.last));
  this.last=now;this.smooth+=(v.peak-this.smooth)*(1-Math.exp(-dt/(v.peak>this.smooth?250:600)));
  if(this.state==='unavailable')this.state='quiet';
  if(this.state==='quiet'){
   this.low=null;if(this.smooth>=this.cfg.threshold&&v.peak>=this.cfg.threshold*this.cfg.offRatio){if(this.high===null)this.high=now;if(now-this.high>=this.cfg.attackMs){this.state='active';this.high=null;}}else this.high=null;
  }else{this.high=null;if(this.smooth<this.cfg.threshold*this.cfg.offRatio){if(this.low===null)this.low=now;if(now-this.low>=this.cfg.releaseMs){this.state='quiet';this.low=null;}}else this.low=null;}
  return before!==this.state;
 }
}
class SystemAudio extends EventEmitter{
 constructor({settingsPath,helperPath,diagnosticPath,resourceDir,catalog=()=>null,spawnHelper=spawn,now=()=>performance.now()}={}){
  super();Object.assign(this,{settingsPath,helperPath,diagnosticPath,resourceDir,catalog,spawnHelper,now});let v={};try{v=JSON.parse(fs.readFileSync(settingsPath,'utf8'));}catch{}
  this.cfg=settings(v);this.gate=new AudioGate(this.cfg);this.revision=0;this.started=false;this.child=null;this.retry=null;this.watchdog=null;this.generation=0;this.error=null;this.lastPacket=0;this.restartCount=0;
  this.configureQueue=Promise.resolve();this.disposed=false;
  if(settingsPath&&!fs.existsSync(settingsPath))try{fs.writeFileSync(settingsPath,JSON.stringify(this.cfg,null,2));}catch{this.error='音频配置不可写，暂用默认值';}
 }
 view(){const choices=eligible(this.catalog(),this.resourceDir),selected=choices.find(a=>a.id===this.cfg.actionId);
  return {revision:++this.revision,state:this.cfg.enabled?this.gate.state:'disabled',options:{...this.cfg},action:selected?{...selected,loop:true,interruptible:true}:null,
   choices:choices.map(a=>({id:a.id,name:a.name})),notice:!selected?'音频待机素材未配置':null,error:this.error,deviceRevision:this.gate.device,helperPid:this.child?.pid||null,
   source:'Windows默认播放输出峰值；不采集音频内容',exclusiveMode:'软件音量计无法保证独占输出可见'};
 }
 publish(){const v=this.view();if(this.diagnosticPath)try{fs.writeFileSync(this.diagnosticPath,JSON.stringify({...v,updated:new Date().toISOString()},null,2));}catch{}this.emit('state',v);return v;}
 async start(){if(this.disposed)return;this.started=true;if(!this.cfg.enabled){this.publish();return;}if(this.child)return;const gen=++this.generation;this.error=null;
  if(!fs.existsSync(this.helperPath)){this.error='音频音量计程序缺失';this.publish();return;}
  const child=this.child=this.spawnHelper(this.helperPath,[],{windowsHide:true,stdio:['pipe','pipe','ignore']});let buffer='';this.lastPacket=this.now();
  child.stdin.on('error',()=>{});child.stdout.on('data',chunk=>{if(gen!==this.generation)return;buffer+=chunk.toString('utf8');if(buffer.length>16384){buffer='';this.error='音量计数据过大';child.kill();return;}
   let i;while((i=buffer.indexOf('\n'))>=0){const line=buffer.slice(0,i);buffer=buffer.slice(i+1);if(line.length>1024)continue;try{const v=JSON.parse(line);if(v?.v!==1||typeof v.available!=='boolean'||!Number.isFinite(v.peak)||v.peak<0||v.peak>1||!Number.isSafeInteger(v.deviceRevision)||v.deviceRevision<0)continue;
    this.lastPacket=this.now();const old=this.gate.device,changed=this.gate.sample(v,this.now());const material=this.cfg.actionId?eligible(this.catalog(),this.resourceDir).some(a=>a.id===this.cfg.actionId):false;const materialChanged=material!==this.materialAvailable;this.materialAvailable=material;if(changed||old!==this.gate.device||materialChanged)this.publish();}catch{}}
  });
  let exitHandled=false;const exited=()=>{if(gen!==this.generation||exitHandled)return;exitHandled=true;this.child=null;clearInterval(this.watchdog);this.watchdog=null;this.gate.reset();this.error='音频监听进程不可用，正在自动恢复';this.publish();if(this.started&&this.cfg.enabled){this.retry=setTimeout(()=>{this.retry=null;this.start();},Math.min(30000,2000*2**Math.min(this.restartCount++,4)));this.retry.unref?.();}};
  child.once('error',exited);child.once('exit',exited);
  this.watchdog=setInterval(()=>{if(this.now()-this.lastPacket>5000)child.kill();},2000);this.watchdog.unref?.();this.publish();
 }
 async stop(){this.started=false;++this.generation;clearTimeout(this.retry);this.retry=null;clearInterval(this.watchdog);this.watchdog=null;
  const child=this.child;this.child=null;this.gate.reset();if(child){await new Promise(resolve=>{let done=false;const timer=setTimeout(()=>{child.kill();finish();},1500);const finish=()=>{if(done)return;done=true;clearTimeout(timer);resolve();};child.once('exit',finish);try{child.stdin.end('stop\n');}catch{child.kill();}if(child.exitCode!==null)finish();});}
 }
 configure(patch){const job=async()=>{if(this.disposed)throw Error('音频监听已退出');const next=settings({...this.cfg,...patch});if(Object.hasOwn(patch,'actionId')&&next.actionId&&!eligible(this.catalog(),this.resourceDir).some(a=>a.id===next.actionId))throw Error('仅允许已启用普通待机或audio_idle素材，点击与Codex状态动作不可选择');
  if(this.settingsPath)try{const tmp=this.settingsPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(next,null,2));fs.renameSync(tmp,this.settingsPath);}catch{this.error='音频配置保存失败；保留原监听状态';this.publish();throw Error(this.error);}
  await this.stop();this.cfg=next;this.gate=new AudioGate(next);this.restartCount=0;await this.start();return this.publish();
 };const result=this.configureQueue.then(job);this.configureQueue=result.catch(()=>{});return result;}
 async dispose(){this.disposed=true;await this.stop();await this.configureQueue;await this.stop();}
}
module.exports={AudioGate,SystemAudio,settings,eligible};
