// Simulated RPC and auth metadata only. Never change real login or credentials.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{createHash}=require('node:crypto');
const {queryOfficial,QuotaMonitor,sanitizeSettings,normalize}=require('./codex-quota.cjs');
const sha=x=>createHash('sha256').update(x).digest('hex');
const raw=(id='account-A')=>({accountId:id,rateLimits:{limitId:'codex',primary:{usedPercent:95,windowDurationMins:300,resetsAt:Math.floor(Date.now()/1000)+1000}}});
const account=(id='account-A',email='fixture@example.invalid')=>({account:{type:'chatgpt',email},workspaceRouting:{chatgptAccountId:id,backendOrigin:'https://chatgpt.com'}});
function rpcFixture({before=account(),after=before,rates=raw(),home=os.tmpdir(),origin}={}){let reads=0;const methods=[];const r={child:{pid:12,stdin:{write(){}}},methods,call:async(method)=>{methods.push(method);if(method==='initialize')return {codexHome:home,userAgent:'codex_cli_rs/0.163.0-alpha.10.2 Windows'};if(method==='account/read')return reads++?after:before;return rates;},close:async()=>{r.exit=true;}};return r;}
const deps=rpc=>({resolveEngine:async()=>'/official/codex.exe',authStamp:()=> 'same-file-metadata',createRpc:()=>rpc});
test('无个人指纹首次启动，官方当前账号前后与额度一致才通过',async()=>{const rpc=rpcFixture(),v=await queryOfficial({codexHome:os.tmpdir()},null,null,deps(rpc));assert.equal(v.identityVerified,true);assert.equal(v.accountFingerprint,sha('account-A'));assert.equal(v.telemetry.helperExited,true);assert.deepEqual(rpc.methods,['initialize','account/read','account/rateLimits/read','account/read']);assert.ok(!JSON.stringify(v).includes('fixture@example.invalid'));});
test('额度账号不同、查询中换号、用户变化、非官方路由、未登录/API Key均拒绝',async()=>{
 for(const options of [{rates:raw('B')},{after:account('B')},{after:account('account-A','different@example.invalid')},{before:{...account(),workspaceRouting:{...account().workspaceRouting,backendOrigin:'https://thirdparty.invalid'}}},{before:{account:null}},{before:{account:{type:'apiKey'}}}]){
  const rpc=rpcFixture(options);await assert.rejects(queryOfficial({codexHome:os.tmpdir()},null,null,deps(rpc)));assert.equal(rpc.exit,true);
 }
});
test('认证元数据变化即丢弃结果，不从同进程旧身份返回额度',async()=>{const rpc=rpcFixture();let i=0;await assert.rejects(queryOfficial({codexHome:os.tmpdir()},null,null,{...deps(rpc),authStamp:()=>String(i++)}),/auth_changed/);assert.equal(rpc.exit,true);});
test('新账号清旧提醒、重新建立哈希缓存；旧个人固定字段被忽略',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 换号-')),cfg=path.join(root,'配置.json'),ledger=path.join(root,'提醒.json');fs.writeFileSync(cfg,JSON.stringify({autoRefresh:false,codexHome:root,verifiedAccountFingerprint:sha('old'),verifiedUserFingerprint:sha('old')}));let id='A';const m=new QuotaMonitor({settingsPath:cfg,ledgerPath:ledger,provider:async()=>({accountFingerprint:sha(id),userFingerprint:sha('user-'+id),identityVerified:true,data:normalize(raw(id))})});
 try{await m.start();await m.refresh();assert.equal(m.status,'connected');const keys=Object.keys(m.ledger.values);assert.ok(keys.length);id='B';m.invalidate('auth_changed');assert.equal(m.data,null);assert.equal(m.identity,null);assert.deepEqual(JSON.parse(fs.readFileSync(ledger)),{});await m.refresh();assert.equal(m.status,'connected');assert.equal(m.identity.accountFingerprint,sha('B'));assert.ok(Object.keys(m.ledger.values).every(k=>!keys.includes(k)));assert.ok(!JSON.stringify(m.cfg).includes('verifiedAccountFingerprint'));}finally{m.stop();fs.rmSync(root,{recursive:true,force:true});}
});
test('旧查询迟到不能恢复旧账号缓存；未核验provider结果拒绝',async()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 迟到-'));let finish;const m=new QuotaMonitor({provider:()=>new Promise(r=>finish=r)});try{m.started=true;const pending=m.refresh();await Promise.resolve();m.invalidate('auth_changed');finish({accountFingerprint:sha('old'),userFingerprint:sha('old'),identityVerified:true,data:normalize(raw())});await pending;assert.equal(m.data,null);m.provider=async()=>({accountFingerprint:sha('B'),userFingerprint:sha('B'),data:normalize(raw())});await m.refresh();assert.equal(m.status,'identity_unverified');}finally{m.stop();fs.rmSync(root,{recursive:true,force:true});}});
test('发布默认配置不含固定账号和本机绝对路径',()=>{const v=sanitizeSettings({verifiedAccountFingerprint:sha('personal')});assert.equal(v.verifiedAccountFingerprint,undefined);assert.equal(v.codexHome,process.env.CODEX_HOME||path.join(os.homedir(),'.codex'));});

test('真实文件监听清缓存并自动核验新身份；关闭自动刷新后不发请求',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 文件监听-')),cfg=path.join(root,'配置.json'),ledger=path.join(root,'提醒.json');
 fs.writeFileSync(cfg,JSON.stringify({autoRefresh:true,codexHome:root}));let id='A',calls=0;
 const m=new QuotaMonitor({settingsPath:cfg,ledgerPath:ledger,provider:async()=>{calls++;return {accountFingerprint:sha(id),userFingerprint:sha('user-'+id),identityVerified:true,data:normalize(raw(id))};}});
 const wait=async fn=>{const end=Date.now()+6000;while(!fn()){if(Date.now()>end)throw Error('文件监听超时');await new Promise(r=>setTimeout(r,30));}};
 try{await m.start();assert.equal(m.status,'connected');id='B';fs.writeFileSync(path.join(root,'auth.json'),'fixture metadata only');
  await wait(()=>m.status==='auth_changed');assert.equal(m.data,null);assert.equal(m.identity,null);assert.deepEqual(JSON.parse(fs.readFileSync(ledger)),{});
  await wait(()=>m.status==='connected'&&m.identity?.accountFingerprint===sha('B'));assert.equal(calls,2);
  await m.configure({autoRefresh:false});fs.appendFileSync(path.join(root,'auth.json'),' changed');await wait(()=>m.status==='auth_changed');await new Promise(r=>setTimeout(r,2200));assert.equal(calls,2);assert.equal(m.timer,null);
 }finally{m.stop();assert.equal(m.watcher,null);assert.equal(m.timer,null);fs.rmSync(root,{recursive:true,force:true});}
});

test('认证目录别名的监听使用真实长路径，不改认证上下文',()=>{
 const parent=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 认证别名-')),real=path.join(parent,'实际目录'),alias=path.join(parent,'目录别名'),cfg=path.join(parent,'设置.json');
 fs.mkdirSync(real);fs.symlinkSync(real,alias,process.platform==='win32'?'junction':'dir');fs.writeFileSync(cfg,JSON.stringify({codexHome:alias}));
 const original=fs.watch;let seen;const watcher=new (require('node:events').EventEmitter)();watcher.close=()=>{};
 fs.watch=(target)=>{seen=target;return watcher;};const m=new QuotaMonitor({settingsPath:cfg});
 try{m.watchAuth();assert.equal(seen,fs.realpathSync.native(real));assert.notEqual(seen,alias);assert.equal(m.cfg.codexHome,alias);}
 finally{m.stop();fs.watch=original;fs.rmSync(parent,{recursive:true,force:true});}
});
