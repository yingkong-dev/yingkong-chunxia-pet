// Public bootstrap only; the accepted animation/status/quota/audio modules are reused.
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),http=require('node:http'),net=require('node:net'),crypto=require('node:crypto'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..'),SOURCE=path.join(ROOT,'09-桌宠集成','安装与更新'),vendor=path.join(SOURCE,'官方宿主');
const DATA=process.env.CHUNXIA_DATA_ROOT||path.join(process.env.LOCALAPPDATA||os.homedir(),'Yingkong','ChunxiaPet');
const app=path.join(DATA,'09-桌宠集成','安装与更新'),cfg=path.join(DATA,'09-桌宠集成','动作配置'),home=path.join(DATA,'独立数据'),state=path.join(DATA,'运行状态.json');
const atomic=(f,v)=>{fs.mkdirSync(path.dirname(f),{recursive:true});const t=f+'.tmp';fs.writeFileSync(t,JSON.stringify(v,null,2));fs.renameSync(t,f);};
const request=(port,route,method='GET')=>new Promise((resolve,reject)=>{const r=http.request({hostname:'127.0.0.1',port,path:route,method,timeout:3000},s=>{let b='';s.on('data',d=>b+=d);s.on('end',()=>{try{resolve(JSON.parse(b));}catch{reject(Error('invalid response'));}});});r.on('timeout',()=>r.destroy());r.on('error',reject);r.end();});
async function stop(){let s;try{s=JSON.parse(fs.readFileSync(state));}catch{return;}
 try{const health=await request(s.port,'/health');if(path.resolve(health.plugin?.root||'.').toLowerCase()!==vendor.toLowerCase())throw Error('服务身份不可确认');}catch{return;}
 // Same project cleanup handshake as the stable manager; no force-killing unrelated processes.
 const id=crypto.randomBytes(16).toString('hex');atomic(path.join(home,'春夏退出请求.json'),{id,at:Date.now()});
 for(let n=0;n<50;n++){try{if(JSON.parse(fs.readFileSync(path.join(home,'春夏退出确认.json'))).id===id)break;}catch{}await new Promise(r=>setTimeout(r,100));}
 await request(s.port,'/shutdown','POST').catch(()=>{});console.log('春夏已退出。');
}
async function launch(){
 if(process.platform!=='win32')throw Error('当前公开版仅支持Windows 10/11 x64');
 fs.mkdirSync(DATA,{recursive:true});
 try{const s=JSON.parse(fs.readFileSync(state));const health=await request(s.port,'/health');if(path.resolve(health.plugin?.root||'.').toLowerCase()===vendor.toLowerCase()){console.log('春夏已经运行。');return;}}catch{}
 const files=JSON.parse(fs.readFileSync(path.join(ROOT,'assets-manifest.json'))).files;
 for(const a of files){const file=path.join(ROOT,'09-桌宠集成','动作配置','动作资源',a.file);if(!fs.existsSync(file)||crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==a.sha256)throw Error('正式素材缺失或校验不符：'+a.file);}
 const electron=path.join(ROOT,'runtime','Electron','electron.exe');if(!fs.existsSync(electron)||!fs.existsSync(path.join(vendor,'lib','standalone.js')))throw Error('运行依赖未构建。请先执行安装/构建步骤。');
 fs.mkdirSync(app,{recursive:true});fs.mkdirSync(cfg,{recursive:true});fs.mkdirSync(home,{recursive:true});fs.mkdirSync(path.join(DATA,'05-日志'),{recursive:true});
 for(const file of fs.readdirSync(SOURCE)){if(/\.(?:cjs|js|mjs|ps1|png)$/.test(file)&&!file.startsWith('test-')&&!file.startsWith('probe-'))fs.copyFileSync(path.join(SOURCE,file),path.join(app,file));}
 fs.cpSync(path.join(SOURCE,'音频工具'),path.join(app,'音频工具'),{recursive:true});
 for(const file of fs.readdirSync(path.join(ROOT,'09-桌宠集成','动作配置'))){if(file.endsWith('.json')&&!fs.existsSync(path.join(cfg,file)))fs.copyFileSync(path.join(ROOT,'09-桌宠集成','动作配置',file),path.join(cfg,file));}
 // Always load the currently shipped manifest; per-user settings survive upgrades.
 fs.copyFileSync(path.join(ROOT,'09-桌宠集成','动作配置','动作清单.json'),path.join(cfg,'动作清单.json'));
 const {compile,validateSettings}=require('./compile-config.cjs'),compiled=compile(ROOT);let settings;try{settings=JSON.parse(fs.readFileSync(path.join(cfg,'桌宠设置.json'),'utf8').replace(/^\uFEFF/,''));}catch{throw Error('用户桌宠设置.json损坏，原文件已保留；请修正配置后启动');}validateSettings(settings);compiled.pack.pets[0].size=settings['尺寸'];compiled.pack.pets[0].position=settings['位置'];
 if(process.env.CHUNXIA_VALIDATION==='1')for(const f of ['Codex监听设置.json','Codex额度设置.json','系统音频监听设置.json']){const v=JSON.parse(fs.readFileSync(path.join(cfg,f)));v.enabled=false;atomic(path.join(cfg,f),v);}
 const pet=path.join(home,'dsh-pet','pet');fs.mkdirSync(pet,{recursive:true});fs.cpSync(path.join(ROOT,'09-桌宠集成','动作配置','动作资源'),path.join(pet,'chunxia-animation'),{recursive:true});atomic(path.join(pet,'chunxia-config.json'),compiled.pack);atomic(path.join(home,'动作运行清单.json'),compiled.catalog);
 atomic(path.join(home,'dsh-pet','main-config.jsonc'),{pets:[{...compiled.pack.pets[0],id:'chunxia-hidden-main',display:'none'}],notificationsEnabled:false,whisperImageEnabled:false,chatImageEnabled:false});
 const server=net.createServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));const port=server.address().port;await new Promise(r=>server.close(r));
 const env={...process.env,DSH_HOME:home,DSH_PET_ELECTRON_PATH:electron,DSH_PET_ELECTRON_VERSION:'43.8.0',DSH_PET_FORCE_DSF:'0',CHUNXIA_UPSTREAM_ROOT:vendor,CHUNXIA_LAUNCH_ROOT:ROOT,CHUNXIA_EVENT_LOG:path.join(DATA,'05-日志','桌宠事件.log')};delete env.ELECTRON_RUN_AS_NODE;delete env.NODE_OPTIONS;
 const log=fs.openSync(path.join(DATA,'05-日志','宿主.log'),'a');const child=cp.spawn(process.execPath,['--import',require('node:url').pathToFileURL(path.join(app,'host-loader.mjs')).href,path.join(vendor,'lib','standalone.js'),'--port',String(port)],{cwd:app,env,windowsHide:true,detached:true,stdio:['ignore',log,log]});child.unref();fs.closeSync(log);atomic(state,{pid:child.pid,port});
 for(let n=0;n<150;n++){try{const h=await request(port,'/health');if(path.resolve(h.plugin?.root||'.').toLowerCase()===vendor.toLowerCase()){console.log('春夏宿主已启动；窗口播放仍需独立运行验证。');return;}}catch{}await new Promise(r=>setTimeout(r,200));}
 throw Error('启动等待超时，请查看用户数据目录中的宿主日志。');
}
async function start(){
 fs.mkdirSync(DATA,{recursive:true});const lock=path.join(DATA,'启动锁.json');
 try{const fd=fs.openSync(lock,'wx');fs.writeFileSync(fd,JSON.stringify({pid:process.pid}));fs.closeSync(fd);}catch(e){
  if(e.code!=='EEXIST')throw e;let owner;try{owner=JSON.parse(fs.readFileSync(lock)).pid;}catch{throw Error('启动锁无效，请确认程序退出后移除该锁文件');}
  try{process.kill(owner,0);throw Error('春夏正在启动，请稍候');}catch(err){if(err.code!=='ESRCH')throw err;}
  fs.unlinkSync(lock);return start();
 }
 try{return await launch();}finally{try{if(JSON.parse(fs.readFileSync(lock)).pid===process.pid)fs.unlinkSync(lock);}catch{}}
}
(process.argv.includes('--stop')?stop():start()).catch(e=>{console.error(e.message);process.exitCode=1;});
