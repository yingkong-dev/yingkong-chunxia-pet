// Adapt the existing trusted file response only; no new file or command endpoint.
const stats={requests:0,rangeRequests:0,partialResponses:0,invalidRanges:0};
function byteRange(value,size){
 if(!value)return null;const m=/^bytes=(\d*)-(\d*)$/.exec(value);if(!m||(!m[1]&&!m[2]))return false;
 let start=m[1]?Number(m[1]):Math.max(0,size-Number(m[2])),end=m[2]&&m[1]?Number(m[2]):size-1;
 if(!Number.isSafeInteger(start)||!Number.isSafeInteger(end)||start<0||start>=size||end<start||!m[1]&&Number(m[2])===0)return false;
 return{start,end:Math.min(end,size-1)};
}
async function videoResponse(request,response){
 let url;try{url=new URL(request.url);}catch{return response;}
 if(!url.pathname.endsWith('.webm')||!['GET','HEAD'].includes(request.method||'GET')||response.status!==200)return response;
 stats.requests++;if(request.headers.get('range'))stats.rangeRequests++;
 const data=new Uint8Array(await response.arrayBuffer()),range=byteRange(request.headers.get('range'),data.length),headers=new Headers(response.headers);
 headers.set('accept-ranges','bytes');headers.set('cache-control','no-store');
 if(range===false){stats.invalidRanges++;headers.set('content-range','bytes */'+data.length);headers.set('content-length','0');return new Response(null,{status:416,headers});}
 if(range){stats.partialResponses++;headers.set('content-range',`bytes ${range.start}-${range.end}/${data.length}`);headers.set('content-length',String(range.end-range.start+1));return new Response(request.method==='HEAD'?null:data.subarray(range.start,range.end+1),{status:206,headers});}
 headers.set('content-length',String(data.length));return new Response(request.method==='HEAD'?null:data,{status:200,headers});
}
function install(protocol){const original=protocol.handle.bind(protocol);protocol.handle=(scheme,handler)=>original(scheme,scheme==='dsh-pet-bridge'?async request=>videoResponse(request,await handler(request)):handler);}
module.exports={byteRange,videoResponse,install,stats};
