// 莺空社区 · simulated quota tests, separate from real account evidence.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {normalize,windowName,resetText,rowsFor,sanitizeSettings,classifyError,AlertLedger,QuotaMonitor,ReadonlyRpc}=require('./codex-quota.cjs');
const fp='a'.repeat(64),now=1792017000000;
const make=(used=35,mins=300)=>({rateLimits:{limitId:'codex',primary:{usedPercent:used,windowDurationMins:mins,resetsAt:Math.floor(now/1000)+7200},secondary:{usedPercent:60,windowDurationMins:10080,resetsAt:Math.floor(now/1000)+86400}}});
test('正常usedPercent转换与边界',()=>{
 for(const [used,left] of [[0,100],[35,65],[99.5,.5],[100,0]])assert.equal(normalize(make(used),now).buckets[0].windows[0].remainingPercent,left);
});
test('非法百分比不被伪装成0%或100%',()=>{
 for(const x of [undefined,null,'35',true,NaN,Infinity,-1,101]){const r=make();r.rateLimits.primary.usedPercent=x;assert.equal(normalize(r,now).buckets[0].windows[0].remainingPercent,null);}
});
test('窗口按服务端时长命名，不硬编码primary为5小时',()=>{
 assert.equal(windowName(normalize(make(20,15),now).buckets[0].windows[0]),'15分钟窗口');
 assert.equal(windowName(normalize(make(),now).buckets[0].windows[1]),'7天窗口');
 assert.match(windowName(normalize(make(20,null),now).buckets[0].windows[0]),/时长未知/);
});
test('多额度桶独立，优先codex，不相加',()=>{
 const d=normalize({rateLimits:make(90).rateLimits,rateLimitsByLimitId:{other:{primary:{usedPercent:80,windowDurationMins:60}},codex:make(20).rateLimits}},now);
 assert.equal(d.mainBucketId,'codex');assert.equal(d.buckets.find(b=>b.id==='codex').windows[0].remainingPercent,80);
 assert.equal(d.buckets.find(b=>b.id==='other').windows[0].remainingPercent,20);
});
test('秒级重置、当地时区、过去时间、不把毫秒当秒',()=>{
 const w=normalize(make(),now).buckets[0].windows[0];assert.match(resetText(w,now,'Asia/Shanghai'),/约2小时/);
 assert.match(resetText({...w,resetsAt:null},now),/未知/);
 assert.match(resetText({...w,resetsAt:Math.floor(now/1000)-5},now),/待服务端/);
 const raw=make();raw.rateLimits.primary.resetsAt=now;assert.equal(normalize(raw,now).buckets[0].windows[0].resetsAt,null);
});
test('缺失字段与附加重置次数，不显示未确定单位的credit余额',()=>{
 assert.throws(()=>normalize({}),/unsupported/);
 const d=normalize({rateLimits:{limitId:'codex'},rateLimitResetCredits:{availableCount:2}},now);assert.equal(d.resetAvailableCount,2);assert.equal(d.buckets[0].windows.length,0);
 assert.ok(!JSON.stringify(d).includes('balance'));
});
test('错误分类：服务端/认证/网络超时/不支持',()=>{
 assert.equal(classifyError(Error('401 Unauthorized')),'auth_expired');
 assert.equal(classifyError(Error('network timeout')),'network_error');
 assert.equal(classifyError(Error('method not found')),'unsupported');
 assert.equal(classifyError(Error('500 backend error')),'unavailable');
});
test('阈值普通/紧张/耗尽各一次，恢复后再下降可提醒',()=>{
 const l=new AlertLedger(),cfg=sanitizeSettings();
 const d=used=>normalize(make(used),now);
 assert.equal(l.check(fp,d(71),cfg).level,'low');assert.equal(l.check(fp,d(72),cfg),null);
 assert.equal(l.check(fp,d(91),cfg).level,'critical');assert.equal(l.check(fp,d(92),cfg),null);
 assert.equal(l.check(fp,d(100),cfg).level,'empty');assert.equal(l.check(fp,d(100),cfg),null);
 l.check(fp,d(20),cfg);assert.equal(l.check(fp,d(71),cfg).level,'low');
});
test('提醒按账号/窗口/重置时间隔离且不对异常百分比提醒',()=>{
 const l=new AlertLedger(),cfg=sanitizeSettings(),d=normalize(make(95),now);l.check(fp,d,cfg);
 assert.equal(l.check('b'.repeat(64),d,cfg).level,'critical');
 const next=normalize(make(95),now);next.buckets[0].windows[0].resetsAt+=300;
 assert.equal(l.check(fp,next,cfg).level,'critical');
 assert.equal(new AlertLedger().check(fp,normalize(make('bad'),now),cfg),null);
});
function setup(provider,options={}){
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 额度-')),settingsPath=path.join(dir,'配置.json');
 fs.writeFileSync(settingsPath,JSON.stringify({enabled:true,autoRefresh:false,verifiedAccountFingerprint:fp,codexHome:dir,refreshSeconds:600,...options}));
 const monitor=new QuotaMonitor({settingsPath,provider,now:()=>now,mono:()=>1});return {dir,monitor};
}
const good=()=>Promise.resolve({accountFingerprint:fp,userFingerprint:'c'.repeat(64),identityVerified:true,data:normalize(make(),now),telemetry:{createdTasks:0}});
test('自动/手动请求合并，只运行一个查询',async()=>{
 let done,calls=0;const {dir,monitor:m}=setup(()=>{calls++;return new Promise(r=>done=r);});
 try{await m.start();const a=m.refresh(),b=m.refresh({manual:true});assert.equal(a,b);await Promise.resolve();assert.equal(calls,1);done(await good());await a;assert.equal(m.view().status,'connected');}
 finally{m.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('切换账号、旧缓存立即失效、核验新账号后自动显示额度',async()=>{
 let mismatch=false;const {dir,monitor:m}=setup(async()=>({...await good(),accountFingerprint:mismatch?'b'.repeat(64):fp}));
 try{await m.start();await m.refresh();assert.ok(m.view().data);mismatch=true;m.invalidate('auth_changed');assert.equal(m.view().data,null);
  await m.refresh();assert.equal(m.view().status,'connected');assert.ok(m.view().data);assert.equal(m.identity.accountFingerprint,'b'.repeat(64));
 }finally{m.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('网络/认证失败不能保留旧数据为当前值',async()=>{
 let broken=false;const {dir,monitor:m}=setup(async()=>{if(broken)throw Error('401 Unauthorized');return good();});
 try{await m.start();await m.refresh();broken=true;await m.refresh();assert.equal(m.view().status,'auth_expired');assert.equal(m.view().data,null);}
 finally{m.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('关闭功能清计时器、watcher，取消在途结果且不轮询',async()=>{
 let done;const {dir,monitor:m}=setup(()=>new Promise(r=>done=r));
 try{await m.start();const p=m.refresh();await m.configure({enabled:false});done(await good());await p;
  assert.equal(m.view().status,'disabled');assert.equal(m.timer,null);assert.equal(m.watcher,null);assert.equal(m.data,null);
 }finally{m.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('自动刷新开关与失败退避',async()=>{
 const {dir,monitor:m}=setup(async()=>{throw Error('network timeout');},{autoRefresh:true});
 try{await m.start();assert.equal(m.view().status,'network_error');assert.ok(m.timer);assert.equal(m.timer._idleTimeout,600000);
  await m.refresh();assert.equal(m.timer._idleTimeout,1200000);await m.configure({autoRefresh:false});assert.equal(m.timer,null);
 }finally{m.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('缓存超时和本机时钟跳变不显示新鲜额度',async()=>{
 const {dir,monitor:m}=setup(good);
 try{await m.start();await m.refresh();m.now=()=>now+1000000;assert.equal(m.view().status,'stale');
  m.now=()=>now+2000000;await m.refresh();assert.equal(m.view().status,'clock_skew');assert.equal(m.view().data,null);
 }finally{m.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
test('不启动登录/任务/重置/任意RPC方法',async()=>{
 for(const method of ['turn/start','thread/start','account/login/start','account/rateLimitResetCredit/consume','command/exec']){
  await assert.rejects(ReadonlyRpc.prototype.call.call({},method,{}),/unsupported/);
 }
});
test('配置边界/气泡错误文案/不显示人民币或Token推算',()=>{
 const s=sanitizeSettings({refreshSeconds:1,criticalThreshold:99,enabled:'true'});assert.equal(s.refreshSeconds,600);assert.equal(s.criticalThreshold,10);
 const rows=rowsFor({status:'api_key_mode'},now);assert.match(rows[1].text,/API Key/);
 assert.ok(!JSON.stringify(rowsFor({status:'connected',data:normalize(make(),now)},now)).includes('人民币'));
});
test('重新启用立即恢复查询；同步异常也不能卡住inflight',async()=>{
 const {dir,monitor:m}=setup(good,{autoRefresh:true});
 try{await m.start();await m.configure({enabled:false});const v=await m.configure({enabled:true});assert.equal(v.status,'connected');
  m.provider=()=>{throw Error('network timeout');};await m.refresh();assert.equal(m.inflight,null);await m.refresh();assert.equal(m.status,'network_error');
 }finally{m.stop();fs.rmSync(dir,{recursive:true,force:true});}
});
