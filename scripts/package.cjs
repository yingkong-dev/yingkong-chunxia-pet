const fs=require('node:fs'),path=require('node:path'),cp=require('node:child_process'),crypto=require('node:crypto');
const root=path.resolve(__dirname,'..'),v=require('./release-check.cjs').check(),dir=path.join(root,'dist','yingkong-chunxia-pet-win-x64'),out=path.join(root,'dist','yingkong-chunxia-pet-'+v+'-win-x64.zip');
if(fs.existsSync(out))throw Error('拒绝覆盖旧安装包');
// Keep public validation summaries without private desktop paths or raw logs.
const reports=path.join(dir,'验证结果');fs.mkdirSync(reports,{recursive:true});for(const n of ['test','media','smoke'])fs.copyFileSync(path.join(root,'.build',n+'-report.json'),path.join(reports,n+'-report.json'));
const m=JSON.parse(fs.readFileSync(path.join(dir,'build-manifest.json')));m.tested=true;m.status='LOCAL_WINDOWS_TECHNICAL_PASS_MANUAL_REQUIRED';fs.writeFileSync(path.join(dir,'build-manifest.json'),JSON.stringify(m,null,2));
// Fixed arguments; archiving only the whitelisted portable staging directory.
const script='param($Source,$Target) Add-Type -AssemblyName System.IO.Compression.FileSystem; [IO.Compression.ZipFile]::CreateFromDirectory($Source,$Target)';
const ps=path.join(root,'.build','archive.ps1');fs.writeFileSync(ps,script);const p=cp.spawnSync('powershell.exe',['-NoProfile','-File',ps,dir,out],{stdio:'inherit',windowsHide:true});if(p.status)throw Error('压缩失败');
const hash=crypto.createHash('sha256').update(fs.readFileSync(out)).digest('hex');fs.writeFileSync(out+'.sha256',hash+'  '+path.basename(out)+'\n');console.log(path.basename(out)+' SHA256 '+hash);
