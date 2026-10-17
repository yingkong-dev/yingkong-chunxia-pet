// Resolve the installed official Desktop engine after updates. Never read auth contents.
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {execFile}=require('node:child_process');
const VERSION=/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/;
function sessionHeader(line){
 try{const r=JSON.parse(line);return r.type==='session_meta'&&VERSION.test(r.payload?.cli_version||'');}catch{return false;}
}
function sameHome(init,home){
 return typeof init?.codexHome==='string'&&path.resolve(init.codexHome).toLowerCase()===path.resolve(home).toLowerCase()&&
   /\b[^\s/]+\/(\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?)(?:\s|$)/.test(String(init.userAgent));
}
function candidates(base){
 try{return fs.readdirSync(base,{withFileTypes:true}).filter(d=>d.isDirectory()&&!d.isSymbolicLink()&&/^[a-f0-9]{8,64}$/i.test(d.name)).map(d=>path.join(base,d.name,'codex.exe')).filter(f=>{
   try{return fs.statSync(f).isFile()&&fs.realpathSync(f).toLowerCase().startsWith(fs.realpathSync(base).toLowerCase()+path.sep);}catch{return false;}
 }).sort((a,b)=>fs.statSync(b).mtimeMs-fs.statSync(a).mtimeMs);}catch{return [];}
}
async function resolveEngine(configured,{base=path.join(process.env.LOCALAPPDATA||path.join(os.homedir(),'AppData','Local'),'OpenAI','Codex','bin'),activePaths}={}){
 if(process.platform!=='win32'&&activePaths===undefined)return fs.existsSync(configured||'')?configured:null;
 const files=candidates(base);
 if(!activePaths)activePaths=await new Promise(resolve=>execFile('powershell.exe',['-NoProfile','-NonInteractive','-Command',
   'Get-Process -Name codex -ErrorAction SilentlyContinue | Select-Object -ExpandProperty Path -Unique'],
   {windowsHide:true,timeout:4000,maxBuffer:16384},(err,out)=>resolve(err?[]:out.trim().split(/\r?\n/))));
 const active=new Set(activePaths.map(x=>path.resolve(x).toLowerCase()));
 const live=files.filter(f=>active.has(path.resolve(f).toLowerCase()));
 return live[0]||files.find(f=>path.resolve(f).toLowerCase()===path.resolve(configured||'.').toLowerCase())||files[0]||null;
}
module.exports={resolveEngine,candidates,sameHome,sessionHeader};
