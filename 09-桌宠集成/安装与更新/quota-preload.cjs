// 莺空社区 · narrow read-only UI IPC. No arbitrary method/path/command argument.
const {contextBridge,ipcRenderer}=require('electron');
contextBridge.exposeInMainWorld('chunxiaQuota',Object.freeze({
 read:()=>ipcRenderer.invoke('chunxia:quota','read'),
 toggleEnabled:()=>ipcRenderer.invoke('chunxia:quota','toggleEnabled'),
 toggleAuto:()=>ipcRenderer.invoke('chunxia:quota','toggleAuto'),
 toggleAlerts:()=>ipcRenderer.invoke('chunxia:quota','toggleAlerts')
}));

contextBridge.exposeInMainWorld('chunxiaPresentation',Object.freeze({action:name=>ipcRenderer.invoke('chunxia:presentation',name)}));

contextBridge.exposeInMainWorld('chunxiaActions',Object.freeze({action:name=>ipcRenderer.invoke('chunxia:actions',name)}));
contextBridge.exposeInMainWorld('chunxiaAudio',Object.freeze({action:(name,payload={})=>ipcRenderer.invoke('chunxia:audio',name,payload)}));
contextBridge.exposeInMainWorld('chunxiaTongtou',Object.freeze({action:(name,payload={})=>ipcRenderer.invoke('chunxia:tongtou',name,payload)}));
contextBridge.exposeInMainWorld('chunxiaSize',Object.freeze({action:(name,size)=>ipcRenderer.invoke('chunxia:size',name,size)}));
contextBridge.exposeInMainWorld('chunxiaPlaybackRecovery',Object.freeze({restart:()=>ipcRenderer.invoke('chunxia:playback-restart')}));
