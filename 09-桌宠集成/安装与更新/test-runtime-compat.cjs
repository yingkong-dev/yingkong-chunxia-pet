'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {resolveEngine,sessionHeader,sameHome}=require('./codex-runtime.cjs');
const {CodexBridge,StateStore}=require('./codex-bridge.cjs');
test('升级后发现当前运行的官方引擎，忽略失效旧路径及目录外文件',async()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 升级-'));
 try{for(const n of ['aaaaaaaa','bbbbbbbb','untrusted']){fs.mkdirSync(path.join(dir,n));fs.writeFileSync(path.join(dir,n,'codex.exe'),'fixture');}
  const live=path.join(dir,'bbbbbbbb/codex.exe');assert.equal(await resolveEngine(path.join(dir,'deleted/codex.exe'),{base:dir,activePaths:[live]}),live);
  assert.notEqual(await resolveEngine('',{base:dir,activePaths:[path.join(dir,'untrusted/codex.exe')]}),path.join(dir,'untrusted/codex.exe'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('版本变化按真实协议字段验证，错误头与不同认证目录拒绝',()=>{
 for(const v of ['0.162.0-alpha.17.2','0.163.0-alpha.10.2'])assert.ok(sessionHeader(JSON.stringify({type:'session_meta',payload:{cli_version:v}})));
 assert.equal(sessionHeader('{"type":"session_meta","payload":{"cli_version":"future"}}'),false);
 assert.equal(sessionHeader('{"type":"message","payload":{"cli_version":"0.163.0"}}'),false);
 assert.ok(sameHome({codexHome:os.tmpdir(),userAgent:'codex_cli_rs/0.163.0-alpha.10.2 Windows'},os.tmpdir()));
 assert.equal(sameHome({codexHome:'/other',userAgent:'codex_cli_rs/0.163.0 Windows'},os.tmpdir()),false);
});
test('未观察到生命周期的历史会话不阻挡真实完成，也不凭空称为空闲',()=>{
 const s=new StateStore(),now=Date.now();
 s.sessions.set('old',{session:'old',turn:'unobserved',state:'unknown',at:0,id:'unobserved'});
 assert.equal(s.aggregate(now).state,'unknown');assert.equal(s.aggregate(now).activeCount,0);
 s.accept({session:'real',turn:'t',state:'running',at:now,id:'start'});
 s.accept({session:'real',turn:'t',state:'completed',at:now+1,id:'end'});
 assert.equal(s.aggregate(now+1).state,'completed');
});
test('新版会话真实文件增量开始完成/检查点恢复，不保存正文',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 新版本-')),f=path.join(root,'00000000-0000-0000-0000-000000000001.jsonl'),cp=path.join(root,'游标.json');
 const row=type=>JSON.stringify({timestamp:new Date().toISOString(),type:'event_msg',payload:{type,turn_id:'t1'}})+'\n';
 let b=new CodexBridge({root,checkpointPath:cp});
 try{fs.writeFileSync(f,JSON.stringify({type:'session_meta',payload:{cli_version:'0.163.0-alpha.10.2'}})+'\n'+row('task_started'));await b.start();assert.equal(b.snapshot().state,'running');b.stop();await b.serial;
  fs.appendFileSync(f,row('task_complete'));b=new CodexBridge({root,checkpointPath:cp});await b.start();assert.equal(b.snapshot().state,'completed');assert.equal(b.stats.unsupported,0);
 }finally{b.stop();await b.serial;fs.rmSync(root,{recursive:true,force:true});}
});
