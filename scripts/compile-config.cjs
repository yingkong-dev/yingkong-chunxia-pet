const fs=require('node:fs'),path=require('node:path');
function compile(root){
 const folder=path.join(root,'09-桌宠集成','动作配置'),read=n=>JSON.parse(fs.readFileSync(path.join(folder,n),'utf8'));
 const m=read('动作清单.json'),s=read('桌宠设置.json'),inventory=JSON.parse(fs.readFileSync(path.join(root,'assets-manifest.json'),'utf8')).files;
 if(!Number.isInteger(s['尺寸'])||s['尺寸']<160||s['尺寸']>1000)throw Error('尺寸无效');
 const enabled=m['动作'].filter(a=>a['是否启用']===true),ids=new Set(),names=new Set(),actions=[];
 for(const a of enabled){const name=a['动作名称'],id=a['英文标识'],file=a['素材文件'];
  if(!/^[A-Za-z0-9_-]{1,100}$/.test(id)||typeof name!=='string'||/[\\/:*?"<>|]/.test(name)||name.trim()!==name||file!==name+'.webm'||ids.has(id)||names.has(name))throw Error('动作名称/标识非法');
  ids.add(id);names.add(name);const asset=inventory.find(v=>v.id===id&&v.file===file);if(!asset)throw Error('资源清单缺失');
  actions.push({id,name,category:a['动作分类'],file,trigger:a['触发方式'],loop:a['播放方式']==='循环',mirror:a['是否允许镜像'],interruptible:a['是否允许打断'],priority:a['播放优先级'],returnTo:a['结束后行为']||m['默认待机动作'],duration:asset.frames/asset.fps});
 }
 const main=actions.find(a=>a.name===m['默认待机动作']&&a.trigger==='自动'&&a.loop);if(!main)throw Error('主待机缺失，禁止回退旧素材');
 const stages=m['Codex状态动作'];for(const [phase,id] of Object.entries(stages)){const a=actions.find(v=>v.id===id);if(!['start','working','completed'].includes(phase)||!a||a.trigger!=='菜单'||a.loop!==(phase==='working'))throw Error('状态动作配置错误');}
 const pool=m['空闲播放策略']['动作池'];if(!pool.length||new Set(pool).size!==pool.length||pool.some(id=>!ids.has(id)||Object.values(stages).includes(id)))throw Error('随机池无效');
 const anim={idle:[main.name],turn:[],drag:[],clicks:actions.filter(a=>a.trigger==='点击').map(a=>a.name),moves:{default:{minDist:80,maxDist:360,margin:20,leadSec:2,tailSec:2},actions:[]},categories:[],events:{balance:[main.name]}};
 return{pack:{pets:[{id:'chunxia1',name:'春夏',size:s['尺寸'],balanceEnabled:false,whisperEnabled:false,workStatusEnabled:false,fixedEnabled:true,display:'desktop',position:s['位置']}],animations:anim,animationWeights:{idle:100,turn:0,move:0},memes:{}},catalog:{version:1,defaultIdle:main.name,idleMode:'random_once',idlePool:pool,actions,statusActions:stages,warnings:[]}};
}
module.exports={compile};
