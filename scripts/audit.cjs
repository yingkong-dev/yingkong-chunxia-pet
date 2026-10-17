// Findings contain rule/path/line only, never the matching secret value.
const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process');
const ROOT=path.resolve(__dirname,'..');
const rules=[['private-key',/-----BEGIN (?:OPENSSH |RSA |EC |DSA |ENCRYPTED )?PRIVATE KEY-----/],['provider-token',/\b(?:sk-(?:proj-|svcacct-)?[A-Za-z0-9_-]{24,}|gh[pousr]_[A-Za-z0-9]{25,}|github_pat_[A-Za-z0-9_]{30,})\b/],['credential-value',/["']?(?:access_token|refresh_token|api_key|password)["']?\s*[:=]\s*["'][A-Za-z0-9_+/.=-]{24,}["']/i],['personal-path',/(?:[A-Za-z]:[\\/]Users[\\/](?!Public\b|Default\b)[^\\/\s"']+|[A-Za-z]:[\\/]桌宠|\/home\/(?!runner\b)[A-Za-z0-9_.-]+)/i]];
function scanText(buffer,file,source,findings){
 if(/\.(?:png|webm)$/.test(file)){
  const inventory=JSON.parse(fs.readFileSync(path.join(ROOT,'assets-manifest.json'),'utf8')).files;
  const asset=inventory.find(a=>file==='09-桌宠集成/动作配置/动作资源/'+a.file);
  if(file==='09-桌宠集成/安装与更新/春夏托盘.png')return;
  if(!asset||require('node:crypto').createHash('sha256').update(buffer).digest('hex')!==asset.sha256)findings.push({source,path:file,rule:'unapproved-binary'});return;
 }
 const utf16=buffer[0]===255&&buffer[1]===254;
 if(buffer.includes(0)&&!utf16){findings.push({source,path:file,rule:'unscanned-binary'});return;}
 const text=buffer.toString(utf16?'utf16le':'utf8');text.split(/\r?\n/).forEach((line,i)=>{for(const [rule,re]of rules)if(re.test(line))findings.push({source,path:file,line:i+1,rule});});
}
function safeName(file){return!/(?:^|\/)(?:auth\.json|\.env(?:\..*)?|\.ssh|独立数据|05-日志|春夏Electron缓存|node_modules)(?:\/|$)|\.(?:pem|key|p12|exe|dll|zip|jsonl|log)$/i.test(file);}
function files(dir=ROOT,prefix=''){return fs.readdirSync(dir,{withFileTypes:true}).flatMap(d=>{const f=prefix+d.name;if(d.isDirectory()){if(['.git','node_modules','dist','.build','.local','test-results','__pycache__','lib'].includes(d.name)||(prefix===''&&d.name==='runtime'))return[];return files(path.join(dir,d.name),f+'/');}if(d.name==='shared-core.js'||f==='09-桌宠集成/安装与更新/音频工具/SystemAudioMeter.exe')return[];return[f];});}
function git(args){return cp.spawnSync('git',['-C',ROOT,...args],{encoding:'buffer',maxBuffer:64*1024*1024});}
function audit(history=false){const findings=[],current=files();for(const f of current){if(!safeName(f))findings.push({source:'worktree',path:f,rule:'forbidden-path'});scanText(fs.readFileSync(path.join(ROOT,f)),f,'worktree',findings);}
 let commits=0,blobs=0;if(history){const list=git(['rev-list','--all']);if(list.status===0){const seen=new Set();for(const sha of list.stdout.toString().trim().split(/\r?\n/).filter(Boolean)){commits++;const tree=git(['ls-tree','-r','-z',sha]);for(const row of tree.stdout.toString().split('\0').filter(Boolean)){const [meta,file]=row.split('\t'),oid=meta.split(' ')[2];if(!safeName(file))findings.push({source:'history',path:file,rule:'forbidden-path'});if(seen.has(oid))continue;seen.add(oid);blobs++;scanText(git(['cat-file','blob',oid]).stdout,file,'history',findings);}}}}
 return{status:findings.length?'FAIL':'PASS',files:current.length,commits,blobs,findings};}
if(require.main===module){const report=audit(process.argv.includes('--history'));console.log(JSON.stringify(report,null,2));if(report.status!=='PASS')process.exitCode=1;}
module.exports={audit,scanText,safeName};
