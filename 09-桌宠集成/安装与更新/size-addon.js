// 莺空社区 · preserve official hit geometry/DPI by rebuilding through /reload.
(()=>{
 if(window.__chunxiaSizeAddon)return;window.__chunxiaSizeAddon=true;
 let value=null,busy=false;
 window.chunxiaSize.action('view').then(v=>value=v).catch(()=>{});
 const mount=PetShared.mountContextMenu;
 PetShared.mountContextMenu=options=>mount({...options,tree:[{label:'桌宠尺寸',children:[
  {label:'当前尺寸：'+(value?.size||sprites[0]?.size||'未知'),action:'size-info'},
  ...(value?.presets||[]).map(p=>({label:(p.size===value.size?'✓ ':'')+p.label,action:'size-set',size:p.size})),
  {label:'自动保存，调整时短暂重载桌宠',action:'size-info'}
 ]},...options.tree],onAction:leaf=>{
  if(leaf.action==='size-info')return;
  if(leaf.action!=='size-set')return options.onAction(leaf);
  if(busy)return;busy=true;for(const s of sprites)s.closeMenu();
  window.chunxiaSize.action('set',leaf.size).then(v=>{value=v;if(v.changed)sprites[0]?.reloadDesktop();})
   .catch(e=>{console.warn('[春夏尺寸] '+e.message);const s=sprites[0];if(s){s.workText='尺寸调整失败，请使用管理工具检查配置。';s.workOn=true;s.renderBubble();setTimeout(()=>{s.workOn=false;s.renderBubble();},6000);}}).finally(()=>busy=false);
 }});
})();
