const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),app=path.join(root,'09-桌宠集成','安装与更新'),vendor=path.join(app,'官方宿主');
function run(exe,args,cwd=root){const r=cp.spawnSync(exe,args,{cwd,stdio:'inherit',windowsHide:true});if(r.status!==0)throw Error('构建命令失败');}
const npm=(args,cwd)=>run(process.platform==='win32'?'cmd.exe':'npm',process.platform==='win32'?['/d','/c','npm',...args]:args,cwd);
function main(){
 if(process.platform!=='win32')throw Error('Windows构建需要Windows runner');
 const audit=require('./audit.cjs').audit(false);if(audit.status!=='PASS')throw Error('公开文件安全检查未通过');
 npm(['ci','--ignore-scripts'],vendor);npm(['run','build'],vendor);
 const csc=path.join(process.env.SystemRoot||'C:\\Windows','Microsoft.NET','Framework64','v4.0.30319','csc.exe');run(csc,['/nologo','/optimize+','/target:exe','/out:'+path.join(app,'音频工具','SystemAudioMeter.exe'),path.join(app,'音频工具','SystemAudioMeter.cs')]);
 let electron=process.argv.includes('--runtime-dir')?process.argv[process.argv.indexOf('--runtime-dir')+1]:null;
 if(!electron){run(process.execPath,[require.resolve('electron/install.js')]);electron=path.join(root,'node_modules','electron','dist');}
 if(fs.readFileSync(path.join(electron,'version'),'utf8').trim()!=='43.8.0')throw Error('Electron版本不符');
 const out=path.join(root,'dist','yingkong-chunxia-pet-win-x64');if(fs.existsSync(out))throw Error('构建目录存在，请归档旧构建目录后重试');fs.mkdirSync(out,{recursive:true});
 // Whitelist stage: never copy local profiles, logs, root node_modules, or Git history.
 for(const n of ['scripts','LICENSES','docs'])fs.cpSync(path.join(root,n),path.join(out,n),{recursive:true});
 for(const n of ['package.json','README.md','LICENSE','NOTICE.md','assets-manifest.json','upstream.json','启动春夏桌宠.bat','停止春夏桌宠.bat'])fs.copyFileSync(path.join(root,n),path.join(out,n));
 const target=path.join(out,'09-桌宠集成');fs.cpSync(path.join(root,'09-桌宠集成','动作配置'),path.join(target,'动作配置'),{recursive:true});
 const ta=path.join(target,'安装与更新');fs.mkdirSync(ta,{recursive:true});for(const n of fs.readdirSync(app)){if(/\.(?:js|cjs|mjs|ps1|png)$/.test(n)&&!n.startsWith('test-')&&!n.startsWith('probe-'))fs.copyFileSync(path.join(app,n),path.join(ta,n));}
 fs.cpSync(path.join(app,'音频工具'),path.join(ta,'音频工具'),{recursive:true});
 const tv=path.join(ta,'官方宿主');fs.mkdirSync(tv);for(const n of ['lib','runtime','assets'])fs.cpSync(path.join(vendor,n),path.join(tv,n),{recursive:true});for(const n of ['package.json','LICENSE','README.md'])fs.copyFileSync(path.join(vendor,n),path.join(tv,n));
 const deps=path.join(root,'.build','runtime-deps');fs.mkdirSync(deps,{recursive:true});fs.copyFileSync(path.join(root,'runtime-deps.package.json'),path.join(deps,'package.json'));fs.copyFileSync(path.join(root,'runtime-deps.lock.json'),path.join(deps,'package-lock.json'));npm(['ci','--ignore-scripts','--omit=dev'],deps);fs.cpSync(path.join(deps,'node_modules'),path.join(tv,'node_modules'),{recursive:true});
 fs.mkdirSync(path.join(out,'runtime'));fs.copyFileSync(process.execPath,path.join(out,'runtime','node.exe'));fs.cpSync(electron,path.join(out,'runtime','Electron'),{recursive:true});
 const report={status:'BUILD_PASS_VALIDATION_REQUIRED',version:require('../package.json').version,node:process.version,electron:'43.8.0',signed:false,installer:'portable-directory',tested:false};fs.writeFileSync(path.join(out,'build-manifest.json'),JSON.stringify(report,null,2));console.log('构建完成：'+out+'；必须通过视频和独立运行测试才可制作发布草稿。');
}
try{main();}catch(e){console.error(e.message);process.exitCode=1;}
