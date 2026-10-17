// 莺空社区. Simulated fixtures are explicitly separate from live evidence.
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {CodexBridge,StateStore,parseRollout,settings,MAX_LINE}=require('./codex-bridge.cjs');
const event=(state,at=Date.now(),session='session1',turn='turn1',id=state+at+session+turn)=>({state,at,session,turn,id});
test('真实格式解析：开始/正常结束/中断，忽略正文及未知格式',()=>{
 for(const [type,state] of [['task_started','running'],['task_complete','completed'],['turn_aborted','interrupted']]){
  const input=JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type,turn_id:'turn1',reason:'interrupted',last_agent_message:'DO_NOT_KEEP'}});
  const value=parseRollout(input,'session1');assert.equal(value.state,state);assert.ok(!JSON.stringify(value).includes('DO_NOT_KEEP'));
 }
 assert.equal(parseRollout('bad','session1'),null);
 assert.equal(parseRollout(JSON.stringify({type:'response_item',payload:{type:'message',text:'secret'}}),'session1'),null);
 assert.equal(parseRollout('x'.repeat(MAX_LINE+1),'session1'),null);
 assert.equal(parseRollout('{}','../invalid'),null);
 assert.equal(parseRollout(JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type:'turn_aborted',turn_id:'turn1',reason:'future'}}),'session1').state,'unknown');
});
test('模拟：八种状态、工具与审批不从工具名猜测',()=>{
 const s=new StateStore(),now=Date.now();
 for(const [i,state] of ['running','tool_running','awaiting_approval','running','failed'].entries()){
  assert.equal(s.accept(event(state,now+i)),true);assert.equal(s.aggregate(now+i).state,state);
 }
 assert.equal(s.accept(event('invented',now+10)),false);
 const ordinary=JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type:'item_completed',turn_id:'turn1',item:{type:'tool',name:'approval'}}});
 assert.equal(parseRollout(ordinary,'session1'),null);
});
test('模拟：去重、乱序、结束后迟到工具、旧回合不能覆盖新回合',()=>{
 const s=new StateStore();assert.ok(s.accept(event('running',100)));
 assert.equal(s.accept(event('running',100)),false);
 assert.ok(s.accept(event('completed',110)));assert.equal(s.accept(event('tool_running',120)),false);
 assert.ok(s.accept(event('running',200,'session1','turn2')));
 assert.equal(s.accept(event('failed',210)),false);assert.equal(s.accept(event('interrupted',99,'session1','turn2')),false);
});
test('模拟：跟随最近开始任务，较早会话不覆盖当前任务结束',()=>{
 const s=new StateStore(),now=Date.now();
 s.accept(event('running',now-1,'a'));s.accept(event('running',now,'b'));
 s.accept(event('completed',now+1,'a'));assert.equal(s.aggregate(now+1).state,'running');
 s.accept(event('awaiting_approval',now+2,'b'));assert.equal(s.aggregate(now+2).state,'awaiting_approval');
 s.accept(event('interrupted',now+3,'b'));assert.equal(s.aggregate(now+3).state,'interrupted');
 assert.equal(s.aggregate(now+20000).state,'idle');
});
test('模拟：静默不等于成功；关闭/异常只能降为unknown',()=>{
 const s=new StateStore();s.accept(event('running',1));assert.equal(s.aggregate(Date.now()).state,'running');
 s.unknown();assert.equal(s.aggregate().state,'unknown');
});

test('旧会话残留running不阻挡新任务完成，旧会话仍不伪造成功',()=>{
 const s=new StateStore();s.accept(event('running',100,'orphan','old'));
 s.accept(event('running',200,'current','new'));s.accept(event('completed',300,'current','new'));
 let v=s.aggregate(301);assert.equal(v.state,'completed');assert.equal(v.aggregation,'latest_started_task');assert.equal(v.otherActiveCount,1);assert.equal(s.sessions.get('orphan').state,'running');
 assert.equal(s.aggregate(11000).state,'idle');
 // Late terminal from an older task must not replace the task we follow.
 s.accept(event('interrupted',12000,'orphan','old'));assert.equal(s.aggregate(12001).state,'idle');
 s.accept(event('running',13000,'orphan','next'));assert.equal(s.aggregate(13001).state,'running');assert.equal(s.aggregate(13001).turn,require('node:crypto').createHash('sha256').update('next').digest('hex').slice(0,16));
});

test('旧未知会话不阻挡最新明确结束；同回合startedAt不随状态更新漂移',()=>{
 const s=new StateStore();s.accept(event('running',100,'a'));s.unknown();s.accept(event('running',200,'b'));s.accept(event('interrupted',300,'b'));
 assert.equal(s.aggregate(301).state,'interrupted');assert.equal(s.sessions.get('b').startedAt,200);assert.equal(s.aggregate(20000).state,'idle');
});
test('设置只接受布尔白名单，不能注入命令或外部路径',()=>{
 assert.deepEqual(settings({enabled:false,bubbles:'yes',command:'evil'}),{enabled:false,bubbles:true,completionNotice:true,completionWave:false});
});
const wait=ms=>new Promise(r=>setTimeout(r,ms));
test('真实文件IO模拟：中文空格路径/增量/半行/截断/轮转/关闭释放/恢复/开关',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 Codex 测试-'));
 const file=path.join(dir,'rollout-00000000-0000-0000-0000-000000000001.jsonl');
 const header=JSON.stringify({type:'session_meta',payload:{cli_version:'0.162.0-alpha.17.2'}})+'\n';
 const record=(type,turn='t1')=>JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type,turn_id:turn}})+'\n';
 fs.writeFileSync(file,header);
 let online=true;const b=new CodexBridge({root:dir,settingsPath:path.join(dir,'设置.json'),checkClient:async()=>online});
 try{
  await b.start();assert.equal(b.connection,'会话记录监听中（部分支持）');
  const start=record('task_started');fs.appendFileSync(file,start.slice(0,-1));await b.read(file,false);assert.equal(b.stats.accepted,0);
  fs.appendFileSync(file,'\n');await wait(300);await b.serial;assert.equal(b.snapshot().state,'running');
  const offset=b.files.get(file).offset;await b.read(file,false);assert.equal(b.files.get(file).offset,offset);assert.equal(b.stats.accepted,1);
  fs.appendFileSync(file,record('task_complete'));await b.read(file,false);assert.equal(b.snapshot().state,'completed');
  await b.configure({enabled:false});assert.equal(b.watch,null);assert.equal(b.timer,null);
  await b.configure({enabled:true});assert.ok(b.watch);
  fs.writeFileSync(file,header);await b.read(file,false);assert.ok(b.stats.rotations>=1);
  fs.renameSync(file,file+'.old');fs.writeFileSync(file,header+record('task_started','t2'));await b.read(file,false);assert.equal(b.snapshot().state,'running');
  online=false;await b.recover();assert.equal(b.current.state,'unknown');
  online=true;await b.recover();assert.equal(b.current.state,'running');fs.appendFileSync(file,record('task_complete','t2'));await b.read(file,false);assert.equal(b.snapshot().state,'completed');
  b.stop();assert.equal(b.pending.size,0);assert.equal(b.watch,null);
 }finally{b.stop();await b.serial;await wait(150);fs.rmSync(dir,{recursive:true,force:true});}
});
test('环境缺失与格式版本变化不崩溃、不标成功',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chunxia-'));
 const missing=new CodexBridge({root:path.join(dir,'missing')});
 try{await missing.start();assert.equal(missing.current.state,'unknown');assert.equal(missing.connection,'连接异常');}
 finally{missing.stop();}
 const b=new CodexBridge({root:dir});
 try{
  const f=path.join(dir,'00000000-0000-0000-0000-000000000001.jsonl');fs.writeFileSync(f,JSON.stringify({type:'session_meta',payload:{cli_version:'future'}})+'\n');
  await b.read(f,false);assert.equal(b.stats.unsupported,1);assert.equal(b.store.sessions.size,0);
 }finally{b.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('重启检查点不丢长任务；停机期间结束可补读；检查点无正文',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'chunxia-cursor-'));
 const file=path.join(dir,'00000000-0000-0000-0000-000000000001.jsonl'),cp=path.join(dir,'游标.json');
 const row=type=>JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type,turn_id:'longtask'}})+'\n';
 fs.writeFileSync(file,JSON.stringify({type:'session_meta',payload:{cli_version:'0.162.0-alpha.17.2'}})+'\n'+row('task_started'));
 let b=new CodexBridge({root:dir,checkpointPath:cp});
 try{
  await b.start();assert.equal(b.snapshot().state,'running');
  fs.appendFileSync(file,(JSON.stringify({type:'response_item',payload:{message:'SENSITIVE_MARKER'+'x'.repeat(1000)}})+'\n').repeat(3100));
  await b.read(file,false);assert.equal(b.snapshot().state,'running');b.stop();
  assert.ok(!fs.readFileSync(cp,'utf8').includes('SENSITIVE_MARKER'));
  fs.appendFileSync(file,row('task_complete'));
  b=new CodexBridge({root:dir,checkpointPath:cp});await b.start();assert.equal(b.snapshot().state,'completed');
 }finally{b.stop();await b.serial;fs.rmSync(dir,{recursive:true,force:true});}
});
