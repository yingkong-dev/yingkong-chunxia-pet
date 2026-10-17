// 莺空社区 · use the host's existing size field and helper reload mechanism.
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const PRESETS=Object.freeze([{size:320,label:'小号（320）'},{size:420,label:'标准（420）'},{size:560,label:'大号（560）'}]);
const read=p=>JSON.parse(fs.readFileSync(p,'utf8').replace(/^\uFEFF/,''));
function atomic(p,data){const tmp=p+'.tmp-'+crypto.randomUUID();try{fs.writeFileSync(tmp,JSON.stringify(data,null,2),'utf8');fs.renameSync(tmp,p);}finally{if(fs.existsSync(tmp))fs.unlinkSync(tmp);}}
class SizeSettings{
 constructor(settingsPath,runtimePath,backupDir){Object.assign(this,{settingsPath,runtimePath,backupDir});}
 view(){return{size:read(this.settingsPath)['尺寸'],presets:PRESETS};}
 set(size){
  if(!Number.isInteger(size)||!PRESETS.some(p=>p.size===size))throw Error('桌宠尺寸无效');
  const settings=read(this.settingsPath),runtime=read(this.runtimePath),pet=runtime.pets?.find(p=>p.id===settings['实例ID']);
  if(!pet||!Number.isInteger(settings['尺寸']))throw Error('春夏尺寸配置不完整，请先使用管理工具检查');
  if(settings['尺寸']===size&&pet.size===size)return{...this.view(),changed:false};
  const previousSettings=structuredClone(settings),previousRuntime=structuredClone(runtime);
  fs.mkdirSync(this.backupDir,{recursive:true});
  atomic(path.join(this.backupDir,'菜单尺寸修改前-'+Date.now()+'-'+crypto.randomUUID()+'.json'),{settings:previousSettings,runtime:previousRuntime});
  settings['尺寸']=size;pet.size=size;
  atomic(this.runtimePath,runtime);
  try{atomic(this.settingsPath,settings);}catch(e){atomic(this.runtimePath,previousRuntime);throw e;}
  return{...this.view(),changed:true};
 }
}
module.exports={SizeSettings,PRESETS};
