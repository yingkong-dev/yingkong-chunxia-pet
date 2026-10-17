// 莺空社区 · F41 pure numeric and settings tests. Real compositor tests are separate.
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const C=require('./tongtou-core.js'),{TongtouSettings}=require('./tongtou-settings.cjs'),cfg=C.settings();
const near=(a,b)=>assert.ok(Math.abs(a-b)<.000001,`${a} != ${b}`);
test('默认关闭、800ms，两端比例与需求一致',()=>{assert.equal(cfg.enabled,false);assert.equal(new TongtouSettings(path.join(__dirname,'..','动作配置','通透模式设置.json')).cfg.enabled,false);assert.equal(cfg.cycleMs,800);assert.deepEqual(C.extrema(cfg),[{x:1.12,y:.85},{x:.94,y:1.1}]);});
test('完整800ms=压扁拉长压扁；半周期400ms且无独立正常状态',()=>{for(const [t,x,y]of [[0,1.12,.85],[400,.94,1.1],[800,1.12,.85],[1200,.94,1.1]]){const a=C.sample(t,cfg);near(a.x,x);near(a.y,y);}assert.equal(C.extrema(cfg).length,2);});
test('时间轴连续单调、无过冲/正常比例停顿、两端平滑换向',()=>{
 let prev=C.sample(0,cfg);for(let t=1;t<=400;t++){const v=C.sample(t,cfg);assert.ok(v.x<=prev.x+1e-12&&v.y>=prev.y-1e-12);assert.ok(v.x>=.94-1e-9&&v.x<=1.12+1e-9&&v.y>=.85-1e-9&&v.y<=1.1+1e-9);assert.ok(Math.abs(v.x-prev.x)+Math.abs(v.y-prev.y)>1e-8);prev=v;}
 const a=C.sample(399,cfg),b=C.sample(401,cfg);near(a.x,b.x);near(a.y,b.y);assert.ok(Math.abs(a.x-.94)<.0001);
});
test('变速保持相位，强度为统一倍率，任意合法参数保持两个极值',()=>{for(const ms of [300,500,800,1600,5000])for(const intensity of [.25,.5,1,2]){const c=C.settings({cycleMs:ms,intensity}),p=C.sample(ms*.27,c),v=C.sample(800*.27,cfg);near(p.x-1,(v.x-1)*intensity);near(p.y-1,(v.y-1)*intensity);assert.equal(C.extrema(c).length,2);}});
test('无效/旧配置安全回退，非法数值限制、未知字段不进入设置',()=>{for(const bad of [null,[],{},'bad'])assert.deepEqual(C.settings(bad),cfg);const c=C.settings({enabled:'yes',cycleMs:1,intensity:99,squashY:-1,stretchX:Infinity,command:'evil'});assert.equal(c.enabled,false);assert.equal(c.cycleMs,300);assert.equal(c.intensity,2);assert.equal(c.squashY,.65);assert.equal(c.stretchX,.94);assert.equal(c.command,undefined);});
test('固定中心边界保护，窗口/屏幕边缘幅度只减不移动',()=>{const box={x:210,y:210,width:420,height:236};near(C.fit(cfg,box,{left:0,top:0,right:841,bottom:677}),1);const i=C.fit(cfg,box,{left:200,top:200,right:650,bottom:480});assert.ok(i>=0&&i<=1);assert.equal(C.fit(cfg,{...box,x:0},{left:0,top:0,right:841,bottom:677}),0);assert.deepEqual(box,{x:210,y:210,width:420,height:236});});
test('底部中心固定，各相位底边不动，头顶只沿上方伸缩',()=>{
 const box={x:210,y:210,width:420,height:236.25},ax=box.x+box.width*C.ANCHOR.x,ay=box.y+box.height*C.ANCHOR.y;
 near(C.ANCHOR.y,1);for(let t=0;t<=800;t+=10){const s=C.sample(t,cfg),left=ax+(box.x-ax)*s.x,top=ay+(box.y-ay)*s.y;
  near(left+box.width*s.x*C.ANCHOR.x,ax);near(top+box.height*s.y*C.ANCHOR.y,ay);assert.ok(top<ay);}
 const limits={left:200,top:200,right:650,bottom:455},intensity=C.fit(cfg,box,limits);
 for(const s of C.extrema(cfg,intensity)){assert.ok(ax+(box.x-ax)*s.x>=limits.left-1e-8);assert.ok(ay+(box.y-ay)*s.y>=limits.top-1e-8);assert.ok(ay+(box.y+box.height-ay)*s.y<=limits.bottom+1e-8);}
});
test('中文路径配置持久化、快速开关最后意图、恢复默认',()=>{const root=fs.mkdtempSync(path.join(os.tmpdir(),'春夏 通透-')),p=path.join(root,'设置.json');try{let m=new TongtouSettings(p);assert.equal(m.cfg.enabled,false);for(let i=0;i<21;i++)m.configure('toggle');assert.equal(m.cfg.enabled,true);m.configure('set',{cycleMs:1200,intensity:1.5});m=new TongtouSettings(p);assert.equal(m.cfg.enabled,true);assert.equal(m.cfg.cycleMs,1200);m.configure('defaults');assert.deepEqual(m.cfg,cfg);assert.throws(()=>m.configure('set',{path:'evil'}));assert.throws(()=>m.configure('set',{enabled:1}));assert.throws(()=>m.configure('set',{cycleMs:NaN}));assert.throws(()=>m.configure('exec'));fs.writeFileSync(p,'{bad');assert.deepEqual(new TongtouSettings(p).cfg,cfg);}finally{fs.rmSync(root,{recursive:true,force:true});}});
