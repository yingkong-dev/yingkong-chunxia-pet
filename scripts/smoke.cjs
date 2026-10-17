// Isolated desktop test: no account query, audio capture, or notification registration.
const fs=require('node:fs'),path=require('node:path'),net=require('node:net'),cp=require('node:child_process'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),bundle=process.env.CHUNXIA_TEST_BUNDLE||path.join(root,'dist','yingkong-chunxia-pet-win-x64'),profile=process.env.CHUNXIA_TEST_PROFILE||path.join(root,'.local','中文 空格 验证数据'),reportFile=path.join(root,'.build','smoke-report.json');
const wait=ms=>new Promise(r=>setTimeout(r,ms));let browser;
async function main(){
 const portServer=net.createServer();await new Promise(r=>portServer.listen(0,'127.0.0.1',r));const port=portServer.address().port;await new Promise(r=>portServer.close(r));
 const env={...process.env,CHUNXIA_VALIDATION:'1',CHUNXIA_DATA_ROOT:profile,CHUNXIA_TEST_CDP:String(port)};
 function launch(args=[]){const r=cp.spawnSync(path.join(bundle,'runtime','node.exe'),[path.join(bundle,'scripts','start.cjs'),...args],{env,encoding:'utf8',windowsHide:true,timeout:60000});if(r.status!==0)throw Error('隔离启动/退出失败：'+r.stderr);return r.stdout;}
 let result,helperPid;
 try{
  launch();const {chromium}=require('playwright-core');
  for(let n=0;n<60;n++){try{browser=await chromium.connectOverCDP('http://127.0.0.1:'+port);break;}catch{await wait(500);}}
  assert(browser,'isolated CDP unavailable');const pages=browser.contexts().flatMap(c=>c.pages());const page=pages.find(p=>p.url().includes('index.html'))||pages[0];assert(page);
  await page.waitForFunction(()=>{const s=window.__chunxiaSnapshot?.();return s?.ready&&s.videoWidth===640&&s.readyState>=2&&!s.paused;},{},{timeout:30000});
  const before=await page.evaluate(()=>window.__chunxiaSnapshot());assert.equal(before.videoWidth,640);assert.equal(before.videoHeight,360);assert.equal(before.renderedSprites,1);
  await wait(1500);const after=await page.evaluate(()=>window.__chunxiaSnapshot());assert(after.currentTime!==before.currentTime||after.anim!==before.anim,'video did not advance');assert(!after.paused);assert.equal(after.frontVideos,1);
  const state=JSON.parse(fs.readFileSync(path.join(profile,'运行状态.json')));assert(launch().includes('已经运行'));assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'运行状态.json'))).pid,state.pid);
  // Full cycle: allow three idle clips to end; sample continuously for a stalled front video.
  const clips=new Set([after.anim]);let switches=0,last=after,stalled=0;
  for(let i=0;i<75;i++){await wait(500);const s=await page.evaluate(()=>window.__chunxiaSnapshot());assert.equal(s.renderedSprites,1);assert.equal(s.frontVideos,1);assert(s.readyState>=2&&s.videoWidth===640);if(s.anim!==last.anim){switches++;clips.add(s.anim);}stalled=s.anim===last.anim&&s.currentTime===last.currentTime?stalled+1:0;assert(stalled<6,'video stalled >=3s');last=s;}
  assert(switches>=3,'less than three clip boundaries observed');
  const hit=page.locator('.pet-hit').first();await hit.dispatchEvent('click',{button:0});await wait(600);const clicked=await page.evaluate(()=>window.__chunxiaSnapshot());assert.equal(clicked.anim,'点击回应');
  await wait(10500);const returned=await page.evaluate(()=>window.__chunxiaSnapshot());assert(['待机01','待机02','待机03'].includes(returned.anim));
  helperPid=JSON.parse(fs.readFileSync(path.join(profile,'独立数据','桌宠运行状态.json'))).pid;
  fs.mkdirSync(path.join(root,'.build'),{recursive:true});await page.screenshot({path:path.join(root,'.build','独立运行.png'),omitBackground:true});
  result={status:'PASS',mode:'isolated-windows-desktop',framesAdvance:true,onlyOneSprite:true,onlyOneFrontVideo:true,duplicateStart:true,boundaries:switches,idleClips:[...clips],clickReturn:true,notifications:'NOT_TESTED_ISOLATED',realCodex:'NOT_TESTED_NO_MODEL_TASK',visual:'MANUAL_REQUIRED'};
 }finally{
  if(browser)await browser.close();launch(['--stop']);
 }
 const s=JSON.parse(fs.readFileSync(path.join(profile,'运行状态.json')));let gone=false;for(let n=0;n<30;n++){try{process.kill(s.pid,0);}catch(e){if(e.code==='ESRCH'){gone=true;break;}}await wait(250);}assert(gone,'host process not released');result.hostReleased=true;
 let helperGone=false;for(let n=0;n<30;n++){try{process.kill(helperPid,0);}catch(e){if(e.code==='ESRCH'){helperGone=true;break;}}await wait(250);}assert(helperGone,'Electron helper process not released');result.helperReleased=true;
 fs.writeFileSync(reportFile,JSON.stringify(result,null,2));console.log(JSON.stringify(result,null,2));
}
main().catch(e=>{fs.mkdirSync(path.dirname(reportFile),{recursive:true});fs.writeFileSync(reportFile,JSON.stringify({status:'FAIL',error:e.message},null,2));console.error(e.message);process.exitCode=1;});
