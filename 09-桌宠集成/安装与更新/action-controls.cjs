// 莺空社区 · fixed local configuration, no media generation or authentication access.
const fs=require('node:fs'),path=require('node:path');
class ActionControls{
 constructor({settingsPath,catalogPath,resourceDir,diagnosticPath}){Object.assign(this,{settingsPath,catalogPath,resourceDir,diagnosticPath});this.mirrorEnabled=false;this.revision=0;this.catalog=null;try{const s=JSON.parse(fs.readFileSync(settingsPath,'utf8'));this.mirrorEnabled=s.mirrorEnabled===true;}catch{}this.load();}
 load(){
  try{if(fs.statSync(this.catalogPath).size>131072)throw Error('运行清单过大');const v=JSON.parse(fs.readFileSync(this.catalogPath,'utf8'));if(v.version!==1||!Array.isArray(v.actions)||v.actions.length>256)throw Error('动作运行清单格式错误');
   const ids=new Set(),names=new Set(),warnings=[...(Array.isArray(v.warnings)?v.warnings:[])];
   const actions=v.actions.filter(a=>{const ok=a&&/^[A-Za-z0-9_-]{1,100}$/.test(a.id)&&typeof a.name==='string'&&a.name.length<=120&&typeof a.file==='string'&&path.basename(a.file)===a.file&&a.file===a.name+'.webm'&&!ids.has(a.id)&&!names.has(a.name)&&fs.existsSync(path.join(this.resourceDir,a.file))&&['loop','mirror','interruptible'].every(k=>typeof a[k]==='boolean')&&Number.isFinite(a.duration)&&a.duration>0;
    if(!ok){warnings.push({action:String(a?.name||'未知').slice(0,120),reason:'运行条目无效、重复或资源缺失'});return false;}ids.add(a.id);names.add(a.name);return true;});
   if(!actions.some(a=>a.name===v.defaultIdle&&a.loop))throw Error('正式主待机运行清单不可用');
   const statusActions={};for(const [phase,id] of Object.entries(v.statusActions||{})){const a=actions.find(a=>a.id===id);if(!['start','working','completed'].includes(phase)||!a||a.trigger!=='菜单'||a.loop!==(phase==='working'))throw Error('状态动作映射无效');statusActions[phase]=id;}
   const idleMode=v.idleMode||'fixed',idlePool=v.idlePool||[];
   if(!['fixed','random_once'].includes(idleMode)||!Array.isArray(idlePool)||idleMode==='random_once'&&(!idlePool.length||new Set(idlePool).size!==idlePool.length||idlePool.some(id=>!actions.some(a=>a.id===id))))throw Error('随机待机池无效，禁止回退未知素材');
   this.catalog={version:1,defaultIdle:v.defaultIdle,idleMode,idlePool,actions,statusActions,warnings};this.error=null;
  }catch{this.error='动作运行清单不可用；保留内存中最后有效清单，未启用未知素材';}
  return this.view();
 }
 view(){const v={revision:++this.revision,mirrorEnabled:this.mirrorEnabled,catalog:this.catalog,error:this.error};try{fs.writeFileSync(this.diagnosticPath,JSON.stringify(v,null,2));}catch{}return v;}
 toggle(){this.mirrorEnabled=!this.mirrorEnabled;const tmp=this.settingsPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify({mirrorEnabled:this.mirrorEnabled},null,2));fs.renameSync(tmp,this.settingsPath);return this.view();}
}
module.exports={ActionControls};
