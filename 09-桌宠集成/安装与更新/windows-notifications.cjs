// 莺空社区 · native Electron toast adapter; app-owned HKCU identity, no OS preference changes.
'use strict';
const fs=require('node:fs'),path=require('node:path');
const APP_ID='Yingkong.Chunxia.DesktopPet';
function initialize({app,shell,Notification,nativeImage,root,icon,report}){
 if(process.env.CHUNXIA_VALIDATION==='1')return{diagnostic:{identity:false,validation:true},send(){throw Error('独立验证模式不注册通知身份');},save(){},stop(){}};
 app.setAppUserModelId(APP_ID);
 const active=new Set();let closed=false;
 const diagnostic={appId:APP_ID,source:'春夏桌宠 · 莺空社区',packaged:app.isPackaged,platform:process.platform,electron:process.versions.electron,supported:false,identity:false,permission:'未获Windows显示确认；请检查设置→系统→通知及勿扰模式'};
 try{
  app.setAppUserModelId(APP_ID);
  const link=path.join(app.getPath('appData'),'Microsoft','Windows','Start Menu','Programs','春夏桌宠 · 莺空社区.lnk');
  // Shortcut launches the existing project BAT via a hidden script, never raw Electron without its host.
  const launcher=path.join(__dirname,'春夏通知启动.vbs');
  const bat=path.join(root,'启动春夏桌宠.bat').replace(/"/g,'""');
  fs.writeFileSync(launcher,Buffer.concat([Buffer.from([255,254]),Buffer.from('Set sh = CreateObject("WScript.Shell")\r\nsh.Run """'+bat+'""", 0, False\r\n','utf16le')]));
  const properties={target:path.join(process.env.SystemRoot||'C:\\Windows','System32','wscript.exe'),args:'"'+launcher+'"',cwd:root,description:'春夏桌宠 · 莺空社区',appUserModelId:APP_ID};
  diagnostic.identity=shell.writeShortcutLink(link,'create',properties);
  if(diagnostic.identity)diagnostic.identity=shell.readShortcutLink(link).appUserModelId===APP_ID;
  diagnostic.shortcut=link;
  // Use an encoded command like our other read-only probes; do not alter execution policy.
  const script="$IconPath=[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('"+Buffer.from(icon,'utf8').toString('base64')+"'));\n"+fs.readFileSync(path.join(__dirname,'register-notification-identity.ps1'),'utf8').split('\n').slice(1).join('\n');
  const result=require('node:child_process').execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-EncodedCommand',Buffer.from(script,'utf16le').toString('base64')],{windowsHide:true,timeout:8000,maxBuffer:4096,encoding:'utf8'});
  diagnostic.nativeIdentity=JSON.parse(result.trim());
  diagnostic.identity=diagnostic.identity&&diagnostic.nativeIdentity.registered===true;
  diagnostic.blocked=Number.isInteger(diagnostic.nativeIdentity.settingValue)&&diagnostic.nativeIdentity.settingValue!==0;
  diagnostic.permission='Windows ToastNotifier.Setting: '+diagnostic.nativeIdentity.setting;
  diagnostic.supported=Notification.isSupported();
 }catch{diagnostic.identity=false;diagnostic.error='当前用户应用通知身份注册或Windows权限读取失败，通知不可用';}
 function save(){try{fs.writeFileSync(report,JSON.stringify({...diagnostic,active:active.size,closed,updated:new Date().toISOString()},null,2));}catch{}}
 save();
 // Read only the two documented Windows notification switches; absent keys mean unknown.
 require('node:child_process').execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',
  "$g=(Get-ItemProperty -LiteralPath 'HKCU:/Software/Microsoft/Windows/CurrentVersion/PushNotifications' -Name ToastEnabled -ErrorAction SilentlyContinue).ToastEnabled; $a=(Get-ItemProperty -LiteralPath 'HKCU:/Software/Microsoft/Windows/CurrentVersion/Notifications/Settings/Yingkong.Chunxia.DesktopPet' -Name Enabled -ErrorAction SilentlyContinue).Enabled; @{global=$g;app=$a}|ConvertTo-Json -Compress"],
  {windowsHide:true,timeout:4000,maxBuffer:1024},(err,out)=>{if(closed)return;try{if(err)throw err;const v=JSON.parse(out);diagnostic.preferenceCheck=v.global===0?'Windows全局通知已关闭':v.app===0?'Windows已关闭春夏应用通知':'未检测到注册表禁用；勿扰模式及横幅显示仍需人工确认';diagnostic.blocked=diagnostic.blocked||v.global===0||v.app===0;}catch{diagnostic.preferenceCheck='无法读取Windows通知开关；请在系统设置中检查';}save();});
 return {diagnostic,send({title,body,kind,test,id}){
  if(closed||!diagnostic.supported||!diagnostic.identity||diagnostic.blocked)throw Error('通知不可用');
  const n=new Notification({title,body,icon:nativeImage.createFromPath(icon),silent:false,timeoutType:'default'});active.add(n);
  const timer=setTimeout(()=>{active.delete(n);n.close();save();},120000);timer.unref();
  const release=()=>{clearTimeout(timer);active.delete(n);save();};
  n.on('show',()=>{diagnostic.last={kind,test,id,result:'Electron show事件已收到；横幅是否可见仍需人工确认',at:new Date().toISOString()};save();
   if(typeof Notification.getHistory==='function')setTimeout(async()=>{if(closed)return;try{const entries=await Notification.getHistory();if(diagnostic.last?.id===id){diagnostic.last.inWindowsHistory=entries.some(x=>x.id===n.id);diagnostic.last.historyCheck='仅查询春夏AppID，不读取其他应用通知';save();}}catch{if(diagnostic.last?.id===id){diagnostic.last.historyCheck='Windows通知记录查询不可用';save();}}},300).unref();
  });
  n.on('failed',()=>{diagnostic.last={kind,test,id,result:'Windows通知失败，请检查应用通知权限、通知身份及勿扰模式',at:new Date().toISOString()};release();});
  n.on('close',release);n.on('click',()=>{release();});n.show();save();
 },stop(){closed=true;for(const n of active)n.close();active.clear();save();},save};
}
module.exports={initialize,APP_ID};
