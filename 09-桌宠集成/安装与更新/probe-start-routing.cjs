// Exercise the actual statusReceive function, with only video admission stubbed.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const {test,after}=require('node:test');
const source=fs.readFileSync(path.join(__dirname,'action-addon.js'),'utf8');
const actual=source.slice(source.indexOf('function statusReceive('),source.indexOf(' const baseCodexReceive'));
const driver=vm.runInNewContext(`(()=>{
 let statusPhase='idle',statusState='unknown',statusRevision=-1,statusKey='',statusEnabled=false;
 const seenStatusTasks=new Set(),sprites=[{__actionPolicy:{current:null,release(){}}}],config={catalog:{statusActions:{start:'question',working:'battle',completed:'celebrate'}}};
 const ensure=()=>true,waitBoundary=()=>false,stage=p=>config.catalog.statusActions[p],resumeStatus=()=>true;
 ${actual}
 return {send:statusReceive,phase:()=>statusPhase,settle:()=>statusPhase='working'};
})()`);
let revision=0;const send=(session,turn,notify=true)=>driver.send({state:'running',revision:++revision,eventId:'event'+revision,session,turn,notify,options:{enabled:true}});
const rows=[];const check=(name,fn)=>test(name,()=>{try{fn();rows.push({name,status:'PASS'});}catch(e){rows.push({name,status:'FAIL',error:e.message});throw e;}});
check('真实任务恢复只进工作循环，不伪造新任务开始',()=>{send('a','one',false);if(driver.phase()!=='working')throw Error(driver.phase());});
check('running到不同真实新任务，必须先进入问号开始阶段',()=>{send('b','two');if(driver.phase()!=='start')throw Error('actual phase='+driver.phase());});
check('重复任务状态不重复开始',()=>{driver.settle();send('b','two');if(driver.phase()!=='working')throw Error(driver.phase());});
check('多会话聚合回已知任务不重播开始',()=>{send('a','one');if(driver.phase()!=='working')throw Error(driver.phase());});
after(()=>{if(process.argv[2])fs.writeFileSync(process.argv[2],JSON.stringify({source:'实际状态函数单元验证，视频请求为桩；不是实机会话',rows},null,2));});
