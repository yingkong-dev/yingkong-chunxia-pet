// 莺空社区 · V0.3. Local read-only Codex rollout adapter. No model/API access.
'use strict';
const fs=require('node:fs'), path=require('node:path'), os=require('node:os');
const {EventEmitter}=require('node:events');
const {createHash}=require('node:crypto');
const {sessionHeader}=require('./codex-runtime.cjs');
const STATES=['idle','running','tool_running','awaiting_approval','completed','failed','interrupted','unknown'];
const ACTIVE=['awaiting_approval','tool_running','running','unknown'];
const TERMINAL=['completed','failed','interrupted'];
const MAX_LINE=1024*1024;
const DEFAULTS={enabled:true,bubbles:true,completionNotice:true,completionWave:false};
const safeId=x=>typeof x==='string'&&/^[a-zA-Z0-9_.:-]{1,128}$/.test(x);
const digest=x=>createHash('sha256').update(x).digest('hex').slice(0,16);
function settings(value){return Object.fromEntries(Object.entries(DEFAULTS).map(([k,v])=>[k,typeof value?.[k]==='boolean'?value[k]:v]));}

// Only this on-disk format was observed on this machine. A schema change fails closed.
function parseRollout(line,session){
  if(typeof line!=='string'||Buffer.byteLength(line)>MAX_LINE||!safeId(session))return null;
  // Do not deserialize prompt/reply/tool-output records. task_complete does carry a
  // final-message field; it is discarded immediately and never forwarded/persisted.
  if(!/^\s*\{[^\n]{0,160}"type"\s*:\s*"event_msg"/.test(line))return null;
  if(!/"payload"\s*:\s*\{\s*"type"\s*:\s*"(?:task_started|task_complete|turn_aborted)"/.test(line))return null;
  try{
    const r=JSON.parse(line),p=r.payload,at=Date.parse(r.timestamp);
    if(r.type!=='event_msg'||!p||!safeId(p.turn_id)||!Number.isFinite(at))return null;
    const state=p.type==='turn_aborted'?(p.reason==='interrupted'?'interrupted':'unknown'):
      {task_started:'running',task_complete:'completed'}[p.type];
    if(!state)return null;
    return {session,turn:p.turn_id,state,at,id:digest(session+'|'+p.turn_id+'|'+p.type+'|'+r.timestamp),source:'rollout'};
  }catch{return null;}
}
class StateStore{
  constructor(){this.sessions=new Map();this.seen=new Set();this.seenQueue=[];this.lastSignature='';}
  accept(e){
    if(!e||!safeId(e.session)||!safeId(e.turn)||!safeId(e.id)||!STATES.includes(e.state)||!Number.isFinite(e.at))return false;
    if(this.seen.has(e.id))return false;
    this.seen.add(e.id);this.seenQueue.push(e.id);
    if(this.seenQueue.length>4096)this.seen.delete(this.seenQueue.shift());
    const prev=this.sessions.get(e.session);
    if(prev&&(e.at<prev.at||(e.turn===prev.turn&&TERMINAL.includes(prev.state))||
      (e.turn!==prev.turn&&prev.turn!=='unobserved'&&(e.state!=='running'||e.at<=prev.at))))return false;
    // A terminal from a tail segment is valid even when its start precedes that segment.
    if(this.sessions.size>=256&&!prev)this.sessions.delete(this.sessions.keys().next().value);
    const startedAt=prev?.turn===e.turn?(Number.isFinite(prev.startedAt)?prev.startedAt:prev.at):e.at;
    this.sessions.set(e.session,{session:e.session,turn:e.turn,state:e.state,at:e.at,id:e.id,startedAt});return true;
  }
  unknown(){for(const [id,v] of this.sessions)if(ACTIVE.includes(v.state))this.sessions.set(id,{...v,state:'unknown'});}
  aggregate(now=Date.now()){
    const all=[...this.sessions.values()],active=all.filter(e=>ACTIVE.includes(e.state)&&e.turn!=='unobserved');
    // Follow the most recently started task, never an older session's unfinished
    // marker. Other sessions remain tracked; silence is never a success event.
    const chosen=all.filter(e=>e.turn!=='unobserved').sort((a,b)=>(b.startedAt??b.at)-(a.startedAt??a.at)||b.at-a.at||a.session.localeCompare(b.session))[0];
    const state=chosen?(TERMINAL.includes(chosen.state)&&now-chosen.at>=10000?'idle':chosen.state):'unknown';
    return {state,activeCount:active.length,aggregation:'latest_started_task',otherActiveCount:active.filter(e=>e.session!==chosen?.session).length,
      eventId:chosen?.id||'',session:chosen?digest(chosen.session):'',turn:chosen?digest(chosen.turn):'',at:chosen?.at||0};
  }
}
class CodexBridge extends EventEmitter{
  constructor({root=path.join(os.homedir(),'.codex','sessions'),settingsPath,diagnosticPath,auditPath,checkpointPath,checkClient}={}){
    super();Object.assign(this,{root,settingsPath,diagnosticPath,auditPath,checkpointPath,checkClient});
    this.store=new StateStore();this.files=new Map();this.pending=new Map();this.watch=null;this.timer=null;
    this.closed=false;this.started=false;this.serial=Promise.resolve();this.revision=0;this.last='';this.client=null;
    try{this.options=settings(JSON.parse(fs.readFileSync(settingsPath,'utf8')));}catch{this.options=settings();}
    this.connection='未启动';this.stats={accepted:0,rejected:0,rotations:0,oversize:0,unsupported:0};
    try{
      const cp=JSON.parse(fs.readFileSync(checkpointPath,'utf8'));
      if(cp.version===1&&(cp.schema==='codex-rollout-lifecycle-v1'||cp.engine==='0.162.0-alpha.17.2')&&Array.isArray(cp.sessions)&&Array.isArray(cp.files)){
        for(const e of cp.sessions.slice(0,256))if(safeId(e.session)&&safeId(e.turn)&&safeId(e.id)&&STATES.includes(e.state)&&Number.isFinite(e.at))this.store.sessions.set(e.session,e);
        for(const f of cp.files.slice(0,256))if(typeof f.file==='string'&&path.resolve(f.file).startsWith(path.resolve(root)+path.sep)&&safeId(f.session)&&Number.isSafeInteger(f.offset)&&f.offset>=0&&typeof f.anchorHash==='string')
          this.files.set(f.file,{...f,partial:Buffer.alloc(0),verify:true});
      }
    }catch{}
  }
  checkpoint(){
    if(!this.checkpointPath)return;
    try{
      const files=[...this.files].filter(([,f])=>f.savedOffset!==undefined).map(([file,f])=>({file,session:f.session,offset:f.savedOffset,ino:f.ino,anchorHash:f.savedHash,skip:f.skip}));
      fs.mkdirSync(path.dirname(this.checkpointPath),{recursive:true});
      fs.writeFileSync(this.checkpointPath+'.tmp',JSON.stringify({version:1,schema:'codex-rollout-lifecycle-v1',sessions:[...this.store.sessions.values()],files}));
      fs.renameSync(this.checkpointPath+'.tmp',this.checkpointPath);
    }catch{}
  }
  snapshot(){return {...this.store.aggregate(),revision:this.revision,connection:this.connection,options:{...this.options},
    capabilities:['running','completed','interrupted'],client:this.client};}
  audit(kind,data){
    try{if(!this.auditPath)return;fs.mkdirSync(path.dirname(this.auditPath),{recursive:true});
      if(fs.existsSync(this.auditPath)&&fs.statSync(this.auditPath).size>1024*1024)fs.renameSync(this.auditPath,this.auditPath+'.previous');
      fs.appendFileSync(this.auditPath,JSON.stringify({time:new Date().toISOString(),kind,...data})+'\n');
    }catch{/* monitoring must never stop the pet */}
  }
  publish(notify=false){
    const v=this.snapshot();
    if(!this.options.enabled){v.state='idle';v.activeCount=0;v.eventId='';}
    if(this.client===false||this.connection==='连接异常'){v.state='unknown';v.eventId='';}
    const signature=JSON.stringify([v.state,v.activeCount,v.eventId,v.connection,v.options,v.client]);
    if(signature===this.last)return;
    this.last=signature;v.revision=++this.revision;v.notify=!!notify;
    this.current=v;
    if(this.diagnosticPath)try{
      fs.mkdirSync(path.dirname(this.diagnosticPath),{recursive:true});
      fs.writeFileSync(this.diagnosticPath,JSON.stringify({署名:'莺空社区',source:'只读本地会话记录',...v,stats:this.stats,updated:new Date().toISOString()},null,2));
    }catch{}
    this.audit('state',{state:v.state,activeCount:v.activeCount,eventId:v.eventId,session:v.session,notify:v.notify});
    this.emit('state',v);
  }
  ingest(line,session,notify){
    const e=parseRollout(line,session);if(!e)return;
    if(this.store.accept(e)){this.stats.accepted++;this.audit('event',{state:e.state,session:digest(e.session),turn:digest(e.turn),eventId:e.id,at:e.at});this.publish(notify);}
    else this.stats.rejected++;
  }
  enqueue(file,initial=false){
    if(this.closed||!this.options.enabled||!file.endsWith('.jsonl'))return;
    this.serial=this.serial.then(()=>this.read(file,initial)).catch(()=>{this.connection='连接异常';this.publish();});
  }
  async read(file,initial){
    if(this.closed||!this.options.enabled)return;
    const resolved=path.resolve(file);
    if(!resolved.startsWith(path.resolve(this.root)+path.sep))return;
    const match=path.basename(file).match(/([0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12})\.jsonl$/i);if(!match)return;
    let stat;try{stat=await fs.promises.lstat(file);}catch{
      const old=this.files.get(file);if(old){const v=this.store.sessions.get(old.session);
        if(v&&ACTIVE.includes(v.state))this.store.sessions.set(old.session,{...v,state:'unknown'});
        this.files.delete(file);this.publish(false);}return;
    }
    if(!stat.isFile()||stat.isSymbolicLink())return;
    let f=this.files.get(file);
    const handle=await fs.promises.open(file,'r');
    try{
      let changed=false;
      if(f?.anchorHash&&stat.size>=f.offset){const a=Buffer.alloc(Math.min(64,f.offset));await handle.read(a,0,a.length,f.offset-a.length);changed=createHash('sha256').update(a).digest('hex')!==f.anchorHash;}
      if(f&&(stat.ino!==f.ino||stat.size<f.offset||changed)){this.stats.rotations++;this.store.sessions.delete(f.session);f=null;}
      if(!f||f.verify){
        const head=Buffer.alloc(Math.min(65536,stat.size));await handle.read(head,0,head.length,0);
        const first=head.toString('utf8').split('\n')[0];
        if(!sessionHeader(first)){this.stats.unsupported++;this.store.sessions.delete(match[1]);this.files.delete(file);return;}
        if(!f)f={offset:Math.max(0,stat.size-2*MAX_LINE),partial:Buffer.alloc(0),skip:stat.size>2*MAX_LINE,ino:stat.ino,session:match[1]};
        f.verify=false;
        if(this.files.size>=256)this.files.delete(this.files.keys().next().value);
        this.files.set(file,f);
      }
      // Bounded chunks, at most 8 MiB per batch; yield before continuing a large append.
      const end=Math.min(stat.size,f.offset+8*1024*1024);
      while(f.offset<end){
        const buf=Buffer.alloc(Math.min(65536,end-f.offset));const {bytesRead}=await handle.read(buf,0,buf.length,f.offset);if(!bytesRead)break;
        f.offset+=bytesRead;const data=Buffer.concat([f.partial,buf.subarray(0,bytesRead)]);let start=0,index;
        while((index=data.indexOf(10,start))!==-1){
          const line=data.subarray(start,index);start=index+1;
          if(f.skip){f.skip=false;continue;}
          if(line.length<=MAX_LINE)this.ingest(line.toString('utf8'),f.session,!initial);else this.stats.oversize++;
        }
        f.partial=data.subarray(start);
        if(f.partial.length>MAX_LINE){
          f.partial=Buffer.alloc(0);f.skip=true;this.stats.oversize++;
          const old=this.store.sessions.get(f.session);
          if(old&&ACTIVE.includes(old.state)){this.store.sessions.set(f.session,{...old,state:'unknown'});this.publish(false);}
        }
      }
      if(f.offset<stat.size)setImmediate(()=>this.enqueue(file,initial));
      const anchor=Buffer.alloc(Math.min(64,f.offset));await handle.read(anchor,0,anchor.length,f.offset-anchor.length);
      f.anchorHash=createHash('sha256').update(anchor).digest('hex');
      f.savedOffset=f.offset-f.partial.length;
      const saved=Buffer.alloc(Math.min(64,f.savedOffset));await handle.read(saved,0,saved.length,f.savedOffset-saved.length);
      f.savedHash=createHash('sha256').update(saved).digest('hex');
      if(!this.store.sessions.has(f.session))this.store.sessions.set(f.session,{session:f.session,turn:'unobserved',state:'unknown',at:0,id:digest(f.session+'unknown')});
      this.checkpoint();this.publish(false);
    }finally{await handle.close();}
  }
  async scan(){
    // Metadata-only traversal. No history content scan; file cursors read append only.
    const walk=async dir=>{const result=[];for(const e of await fs.promises.readdir(dir,{withFileTypes:true})){
      const p=path.join(dir,e.name);if(e.isDirectory()&&/^\d{2,4}$/.test(e.name))result.push(...await walk(p));
      else if(e.isFile()&&e.name.endsWith('.jsonl'))result.push(p);
    }return result;};
    const files=await walk(this.root);const stats=await Promise.all(files.map(async f=>({f,t:(await fs.promises.stat(f)).mtimeMs})));
    // Last 32 files bound startup I/O. Files changed later are discovered by watch.
    for(const {f} of stats.sort((a,b)=>b.t-a.t).slice(0,32))this.enqueue(f,true);
  }
  async start(){
    if(!this.options.enabled){this.connection='已关闭';this.publish(false);return;}
    if(this.started||this.closed||!this.options.enabled)return;
    this.started=true;
    try{
      this.watch=fs.watch(fs.realpathSync.native(path.resolve(this.root)),{recursive:true},(_event,name)=>{
        if(!name)return;const file=path.join(this.root,String(name));
        if(!file.endsWith('.jsonl')||this.pending.has(file)||this.pending.size>256)return;
        this.pending.set(file,setTimeout(()=>{this.pending.delete(file);this.enqueue(file);},120));
      });
      this.watch.on('error',()=>{this.connection='连接异常';this.watch?.close();this.watch=null;this.publish();});
      this.connection='会话记录监听中（部分支持）';await this.scan();await this.serial;
      this.publish(false);
    }catch{this.connection='连接异常';this.publish();}
    this.timer=setInterval(()=>this.recover(),15000);this.timer.unref?.();
  }
  async recover(){
    if(this.closed||!this.options.enabled)return;
    try{
      if(this.checkClient)this.client=await this.checkClient();
      // A process check is a connection signal, not a task lifecycle event.
      // publish() masks offline as unknown; keep verified task state for recovery.
      if(!this.watch){this.stop();this.closed=false;this.started=false;return this.start();}
      // Fallback checks only tracked file metadata. This does not read entire history.
      for(const file of this.files.keys())this.enqueue(file);
      this.connection=this.client===false?'Codex已关闭（状态未知）':'会话记录监听中（部分支持）';this.publish(false);
    }catch{this.connection='连接异常';this.publish();}
  }
  async configure(patch){
    this.options=settings({...this.options,...patch});
    if(this.settingsPath){fs.mkdirSync(path.dirname(this.settingsPath),{recursive:true});const tmp=this.settingsPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.options,null,2));fs.renameSync(tmp,this.settingsPath);}
    if(!this.options.enabled){this.stop();this.closed=false;this.store=new StateStore();this.connection='已关闭';this.publish(false);}
    else{await this.start();this.publish(false);}
  }
  stop(){
    this.closed=true;this.started=false;this.watch?.close();this.watch=null;clearInterval(this.timer);this.timer=null;
    for(const t of this.pending.values())clearTimeout(t);this.pending.clear();
  }
}
module.exports={CodexBridge,StateStore,parseRollout,settings,DEFAULTS,STATES,MAX_LINE};
