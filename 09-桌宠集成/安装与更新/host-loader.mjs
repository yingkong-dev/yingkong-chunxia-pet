// 莺空社区: compatibility adapter only. Official dsh-pet files remain unmodified.
import cp from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const dir=path.dirname(fileURLToPath(import.meta.url));
const official=path.join(process.env.CHUNXIA_UPSTREAM_ROOT||path.join(dir,'官方宿主'),'runtime','electron-helper','main.js');
const entry=path.join(dir,'helper-entry.cjs');
const original=cp.spawn;
cp.spawn=function(command,args,options){
  if (args?.[0] && path.resolve(args[0]).toLowerCase()===official.toLowerCase()) {
    return original.call(this,command,[entry,...args.slice(1)],{
      ...options, env:{...options?.env,CHUNXIA_OFFICIAL_MAIN:official},windowsHide:true
    });
  }
  return original.call(this,command,args,options);
};
syncBuiltinESMExports();
