// 莺空社区 · presentation only. No task, authentication or quota provider changes.
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const DEFAULT_TEXTS={
 start:['开工啦！小白龙也要认真监督哦～','又有新任务了吗？交给我们吧！','嘿嘿，看看这次是什么难题～','小白龙，准备陪我一起工作！','收到任务！让我先研究一下～'],
 running:['正在努力思考中……','嗯……让我再想想。','小白龙说，这个问题值得研究！','别着急，好东西需要一点时间～','正在认真处理，请稍等一下哦。'],
 completed:['完成啦！快来看看成果～','嘿嘿，这次也顺利完成了！','任务结束！小白龙申请休息！','搞定！要不要夸夸我们？','好啦，接下来就交给你验收咯～'],
 interrupted:['咦？任务好像停下来了。','工作暂停啦，要继续吗？','小白龙发现任务中断了！','没关系，我们可以重新开始～'],
 failed:['呜……好像遇到一点问题。','这次不太顺利，要检查一下吗？','小白龙发现了异常情况！','出现错误啦，我们一起看看原因。'],
 awaiting_approval:['有个操作需要你确认一下哦～','春夏正在等你的决定！','小白龙提醒：有待确认的操作！'],
 low:['额度开始有点紧张啦，要留意一下哦～','小白龙提醒：最近要稍微节省额度啦！'],
 critical:['警报！额度快见底啦！','呜哇，剩下的额度不多了！','小白龙正在努力守护最后一点额度！'],
 empty:['额度已经用完啦，等恢复后再继续吧。','先让 Codex 休息一下吧～']
};
const DEFAULT_SETTINGS={randomTexts:true,systemNotifications:true,completed:true,interruptedErrors:true,approval:true,quota:true,policy:'always'};
function settings(v={}){const out={...DEFAULT_SETTINGS};for(const k of Object.keys(out))if(typeof out[k]==='boolean'&&typeof v?.[k]==='boolean')out[k]=v[k];if(['always','unfocused'].includes(v?.policy))out.policy=v.policy;return out;}
function validText(t){return typeof t==='string'&&t.trim().length>0&&t.length<=180&&!/[\x00-\x1f<>]|(?:[A-Za-z]:\\|https?:\/\/|sk-[a-zA-Z0-9]|bearer\s|token\s*[=:])/i.test(t);}
function pools(v={}){const out={};for(const k of Object.keys(DEFAULT_TEXTS)){const a=Array.isArray(v?.[k])? [...new Set(v[k].slice(0,40).filter(validText).map(t=>t.trim()))]:[];out[k]=a.length?a:[...DEFAULT_TEXTS[k]];}return out;}
function read(file,fallback){try{if(fs.statSync(file).size>65536)return fallback;return JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));}catch{return fallback;}}
class TextPicker{
 constructor(values={},rng=Math.random){this.values=pools(values);this.last=new Map();this.rng=rng;}
 pick(kind,scope='global',enabled=true){const a=this.values[kind];if(!a)return null;if(!enabled)return null;const key=scope+'|'+kind,previous=this.last.get(key);const choices=a.length>1?a.filter(t=>t!==previous):a;const n=Math.min(choices.length-1,Math.max(0,Math.floor(this.rng()*choices.length)));const t=choices[n];this.last.delete(key);this.last.set(key,t);if(this.last.size>512)this.last.delete(this.last.keys().next().value);return t;}
}
const NOTICES={completed:['Codex 任务完成','春夏提醒你，刚才的任务已经完成啦～'],interrupted:['Codex 任务中断','春夏提醒你，刚才的任务已经中断。'],failed:['Codex 任务异常','春夏提醒你，任务遇到了问题，请检查 Codex。'],awaiting_approval:['Codex 等待确认','有个操作需要你在 Codex 中确认哦～'],critical:['Codex 额度不足','当前额度已低于紧张阈值，记得合理安排任务哦～'],empty:['Codex 额度已耗尽','当前额度已经用完，请等待恢复后再继续。']};
class Presentation{
 constructor({settingsPath,textPath,ledgerPath,auditPath,notify,isFocused=()=>false}={}){
  Object.assign(this,{settingsPath,textPath,ledgerPath,auditPath,notify,isFocused});this.cfg=settings(read(settingsPath,{}));this.picker=new TextPicker(read(textPath,{}));this.closed=false;this.revision=0;this.recent=new Map();this.sessionState=new Map();this.status='尚未发送；Windows横幅可见性需人工确认';
  const saved=read(ledgerPath,[]);this.seen=new Set(Array.isArray(saved)?saved.filter(x=>typeof x==='string'&&/^[a-f0-9]{64}$/.test(x)).slice(-2048):[]);
 }
 audit(kind,data={}){try{if(fs.existsSync(this.auditPath)&&fs.statSync(this.auditPath).size>524288)fs.renameSync(this.auditPath,this.auditPath+'.previous');fs.appendFileSync(this.auditPath,JSON.stringify({at:new Date().toISOString(),kind,...data})+'\n');}catch{}}
 view(){return {options:{...this.cfg},status:this.status,revision:++this.revision};}
 configure(key){if(!Object.hasOwn(DEFAULT_SETTINGS,key))return this.view();this.cfg=settings({...this.cfg,[key]:key==='policy'?(this.cfg.policy==='always'?'unfocused':'always'):!this.cfg[key]});this.recent.clear();const tmp=this.settingsPath+'.tmp';fs.writeFileSync(tmp,JSON.stringify(this.cfg,null,2));fs.renameSync(tmp,this.settingsPath);return this.view();}
 reload(){this.recent.clear();this.picker=new TextPicker(read(this.textPath,{}));this.status='文案配置已重新加载；无效项目使用默认文案';return this.view();}
 decorate(v){
  if(!v||!v.eventId)return v;const scope=String(v.session||'global').slice(0,128),key=scope+'|'+String(v.turn||'')+'|'+v.eventId+'|'+v.state;
  if(this.recent.has(key))return {...v,presentationText:this.recent.get(key)};
  const previous=this.sessionState.get(scope);let kind=v.state;
  if(v.state==='running')kind=previous?.turn!==v.turn||previous?.state!=='running'?'start':'running';
  this.sessionState.delete(scope);this.sessionState.set(scope,{turn:v.turn,state:v.state});if(this.sessionState.size>256)this.sessionState.delete(this.sessionState.keys().next().value);
  // Start sentences avoid repeating across consecutive tasks; session-specific states stay isolated.
  const text=this.picker.pick(kind,kind==='start'?'starts':scope,this.cfg.randomTexts);
  this.recent.set(key,text);if(this.recent.size>1024)this.recent.delete(this.recent.keys().next().value);
  return {...v,presentationText:text};
 }
 quotaText(v){return {...v,alert:v.alert?{...v.alert,presentationText:this.picker.pick(v.alert.level,'quota',this.cfg.randomTexts)}:undefined};}
 state(v){
  if(!v?.notify||v.options?.enabled!==true||!v.eventId||!v.capabilities?.includes(v.state))return false;
  return this.send(v.state,[v.session,v.turn,v.eventId].join('|'));
 }
 quota(v){if(!v?.alert||v.status!=='connected'||v.options?.enabled!==true||v.options?.alerts!==true)return false;
  // Called only on provider's already de-duplicated alert event. No threshold calculation or query here.
  const context=(v.data?.buckets||[]).map(b=>[b.id,(b.windows||[]).map(w=>[w.slot,w.resetsAt,w.windowDurationMins])]);
  return this.send(v.alert.level,JSON.stringify([context,v.alert.bucket,v.alert.window,v.alert.level,v.lastUpdated]));
 }
 send(kind,key,{test=false}={}){
  if(this.closed||!NOTICES[kind])return false;
  const c=this.cfg;if(!c.systemNotifications||kind==='completed'&&!c.completed||['interrupted','failed'].includes(kind)&&!c.interruptedErrors||kind==='awaiting_approval'&&!c.approval||['critical','empty'].includes(kind)&&!c.quota)return false;
  if(!test&&c.policy==='unfocused'&&this.isFocused())return false;
  const id=crypto.createHash('sha256').update(kind+'|'+key).digest('hex');if(this.seen.has(id))return false;
  this.seen.add(id);if(this.seen.size>2048)this.seen.delete(this.seen.values().next().value);
  if(!test)try{fs.writeFileSync(this.ledgerPath,JSON.stringify([...this.seen]));}catch{}
  const [title,body]=NOTICES[kind];try{this.notify({title:(test?'【测试】':'')+title,body,kind,test,id});this.audit('submitted',{kind,test,id});return true;}catch{this.status='通知发送失败；请检查 Windows 通知设置或通知身份';this.audit('failed',{kind,test,id});return false;}
 }
 stop(){this.closed=true;this.recent.clear();this.sessionState.clear();}
}
module.exports={DEFAULT_TEXTS,DEFAULT_SETTINGS,settings,pools,validText,TextPicker,Presentation,NOTICES};
