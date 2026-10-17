// 莺空社区. Existing menu and unified animation scheduler only.
(()=>{
 if(window.__chunxiaAudioAddon)return;window.__chunxiaAudioAddon=true;
 const labels={active:'活跃',quiet:'安静',unavailable:'不可用',disabled:'已关闭'};
 window.__chunxiaAudioReceive=v=>{
  if(!v||!Number.isInteger(v.revision)||v.revision<(window.__chunxiaAudio?.revision||0)||!Object.hasOwn(labels,v.state)||!Array.isArray(v.choices)||v.choices.length>256)return;
  window.__chunxiaAudio=v;window.__chunxiaAudioApply?.();
 };
 const mount=window.PetShared.mountContextMenu;
 window.PetShared.mountContextMenu=options=>{
  const v=window.__chunxiaAudio,cfg=v?.options||{};
  const tree=[{label:'系统音频监听',children:[
   {label:(cfg.enabled?'✓ ':'○ ')+'启用系统音频监听',action:'audio-toggle'},
   {label:'当前音频状态：'+(v?.test?'【模拟】':'')+(labels[v?.state]||'不可用'),action:'audio-info'},
   {label:v?.notice||'音频待机：'+(v?.action?.name||'未配置'),action:'audio-info'},
   {label:'音频触发灵敏度',children:[['高',.006],['标准',.012],['低',.025]].map(([label,threshold])=>({label:(cfg.threshold===threshold?'✓ ':'')+label,action:'audio-sensitivity',threshold}))},
   {label:'选择音频待机动画',children:[{label:(!cfg.actionId?'✓ ':'')+'未配置（保持普通待机）',action:'audio-select',id:null},...(v?.choices||[]).map(a=>({label:(cfg.actionId===a.id?'✓ ':'')+a.name,action:'audio-select',id:a.id}))]},
   {label:'测试音频动画切换（模拟20秒）',action:'audio-test'},
   {label:'打开音频监听诊断',action:'audio-diagnostic'}
  ]},...options.tree];
  return mount({...options,tree,onAction:leaf=>{
   if(leaf.action==='audio-info')return;
   if(leaf.action?.startsWith('audio-')){
    if(!(leaf.action==='audio-test'&&!v?.action))for(const s of sprites)s.closeMenu();
    const payload=leaf.action==='audio-select'?{actionId:leaf.id}:leaf.action==='audio-sensitivity'?{threshold:leaf.threshold}:{};
    window.chunxiaAudio?.action(leaf.action.slice(6),payload).then(window.__chunxiaAudioReceive).catch(()=>{});return;
   }
   options.onAction(leaf);
  }});
 };
})();
