const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');const root=path.resolve(__dirname,'..');
function check(){
 const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
 const v=read('package.json').version;assert(/^\d+\.\d+\.\d+(?:-rc\.\d+)?$/.test(v));
 assert.equal(require('./audit.cjs').audit(true).status,'PASS');
 assert.equal(read('.build/test-report.json').status,'PASS');assert.equal(read('.build/media-report.json').status,'PASS');assert.equal(read('.build/smoke-report.json').status,'PASS');
 const media=read('.build/media-report.json');assert.equal(media.files.length,read('assets-manifest.json').files.length);
 assert(fs.existsSync(path.join(root,'LICENSES','春夏素材授权.md')));console.log('技术发布检查 PASS；正式公开发布仍需维护者明确批准。');return v;
}
if(require.main===module)try{check();}catch(e){console.error('发布检查 FAIL: '+e.message);process.exitCode=1;}
module.exports={check};
