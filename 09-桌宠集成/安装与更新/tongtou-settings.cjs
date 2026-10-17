// 莺空社区 · validated local configuration only. No timers or video manipulation.
'use strict';
const fs=require('node:fs'),path=require('node:path'),core=require('./tongtou-core.js');
class TongtouSettings{
 constructor(file){this.file=file;this.revision=0;try{if(fs.statSync(file).size>8192)throw Error();this.cfg=core.settings(JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,'')));}catch{this.cfg=core.settings();}}
 view(){return {options:{...this.cfg},revision:this.revision};}
 configure(action,payload={}){let next;
  if(action==='toggle')next={...this.cfg,enabled:!this.cfg.enabled};
  else if(action==='defaults')next=core.DEFAULT;
  else if(action==='set'&&payload&&typeof payload==='object'&&!Array.isArray(payload)&&Object.keys(payload).length<=7){
   if(Object.entries(payload).some(([k,v])=>!Object.hasOwn(core.DEFAULT,k)||(k==='enabled'?typeof v!=='boolean':typeof v!=='number'||!Number.isFinite(v))))throw Error('通透参数无效');next={...this.cfg,...payload};
  }else throw Error('不允许的通透操作');
  const cfg=core.settings(next);fs.mkdirSync(path.dirname(this.file),{recursive:true});fs.writeFileSync(this.file+'.tmp',JSON.stringify(cfg,null,2));fs.renameSync(this.file+'.tmp',this.file);this.cfg=cfg;this.revision++;return this.view();
 }
}
module.exports={TongtouSettings};
