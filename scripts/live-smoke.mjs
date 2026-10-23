// Run against the public Render endpoints from GitHub Actions.
// Never use user credentials, secret tokens, or test writes to real records.
const base=(process.env.BPD_LIVE_URL||'').replace(/\/$/,'');
const expectedSha=process.env.BPD_EXPECTED_SHA||'';
const expectedBranch=process.env.BPD_EXPECTED_BRANCH||'';
if(!/^https:\/\/[a-z0-9.-]+\.onrender\.com$/.test(base)||
   !/^[a-f0-9]{40}$/.test(expectedSha)||
   !/^(main|feature\/verlofmodule-test)$/.test(expectedBranch))
  throw Error('Veilige Render-URL, Git SHA en toegestane branch zijn vereist');

const sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function request(path,method='GET',data){
  const response=await fetch(base+path,{
    method,redirect:'error',signal:AbortSignal.timeout(25000),
    headers:{Accept:'application/json',...(data?{'Content-Type':'application/json'}:{})},
    ...(data?{body:JSON.stringify(data)}:{})
  });
  const contentType=response.headers.get('content-type')||'';
  const body=contentType.includes('application/json')?
    await response.json():await response.text();
  return {status:response.status,body};
}
async function untilDeployed(){
  let last='Geen antwoord';
  // Both Render services auto-deploy on git push; allow for cold starts.
  for(let attempt=1;attempt<=26;attempt++){
    try{
      const {status,body}=await request('/api/health');
      if(status===200&&body?.status==='ok'&&
         body.deployment?.commit===expectedSha&&
         body.deployment?.branch===expectedBranch){
        console.log('Deployment bevestigd:',expectedBranch,expectedSha.slice(0,10));
        return;
      }
      last='HTTP '+status+'; revision '+String(body?.deployment?.commit||'niet beschikbaar').slice(0,12)+
        '; branch '+String(body?.deployment?.branch||'onbekend');
    }catch(e){last=String(e.message||e).slice(0,150)}
    console.log('Render deploymentcontrole '+attempt+'/26: '+last);
    if(attempt<26)await sleep(12000);
  }
  throw Error('Gevraagde Render-commit is niet bevestigd: '+last);
}
async function check(path,expectedStatus=200,assertBody=()=>true){
  let failure='';
  for(let attempt=1;attempt<=3;attempt++){
    try{
      const r=await request(path);
      if(r.status!==expectedStatus||!assertBody(r.body))
        throw Error('Onverwachte respons ('+r.status+')');
      console.log('OK',path,'HTTP',r.status);
      return;
    }catch(e){failure=String(e.message||e);if(attempt<3)await sleep(1800)}
  }
  throw Error(path+': '+failure);
}
await untilDeployed();
// These endpoints must not disclose any private data.
await check('/api/citizens/status',410,d=>typeof d?.error==='string');
await check('/api/dossiercentrum/status',200,d=>d?.enabled===true&&d?.readOnly===true);
await check('/api/client-config',200,d=>
  d?.enabled===true &&
  (expectedBranch==='main'?
    d.firebaseConfig?.projectId!=='belgiepd-test':
    d.firebaseConfig?.projectId==='belgiepd-test'));
await check('/burgerdossier.html',410,d=>typeof d==='string');
await check('/dossiercentrum.html',200,d=>typeof d==='string'&&
  d.includes(expectedBranch==='main'?'Centraal dossieroverzicht':'Personeelslijst en dienstgebonden dossiers')&&
  d.includes('api/dossiercentrum'));
if(expectedBranch!=='main')
  await check('/api/burger-dossiers/123456789012345678',401,d=>typeof d?.error==='string');
// Retired citizen endpoints return 410 Gone even without authentication.
// They must not silently revert to an active 401-protected route.
await check('/api/citizens/me',410,d=>typeof d?.error==='string');
await check('/api/dossiercentrum/overview',401,d=>typeof d?.error==='string');
await check('/api/dossiercentrum/politie/123456789012345678',401,
  d=>typeof d?.error==='string');
await check('/api/personnel/overview',401,d=>typeof d?.error==='string');
await check('/api/staff-dossiers/status',200,d=>d?.enabled===true);
console.log('Publieke module- en toegangscontroles geslaagd voor '+expectedBranch);
