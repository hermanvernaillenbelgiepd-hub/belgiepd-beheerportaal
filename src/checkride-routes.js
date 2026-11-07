import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getBelgiumPdDisplayRoles,exactApiDisplayRoles} from './bpd-discord-users-display.js';
import {CHECKRIDE_TRACKS,permittedCheckrideAccess,checkrideAccessNotice,
  eligibleCheckrideSubject,checkrideInput} from './checkride-policy.js';

const ID=/^\d{15,22}$/;
const db=()=>getFirestore();
const deny=(res,status,error)=>res.status(status).json({error});
const iso=v=>v?.toDate?.()?.toISOString()||null;
function problem(res,error){
  if(error?.status)return deny(res,error.status,error.message);
  console.error('Koppelritcontrole:',error?.code||'databasefout');
  return deny(res,503,'Koppelritten tijdelijk niet beschikbaar');
}
export function installCheckrideRoutes(app,{requireUser,getSnapshot}){
  // All access to subjects and evaluations goes through server-side scope checks.
  async function authorize(req,res,next){
    try{
      const actor=req.bpd,id=actor?.discordId;
      if(!ID.test(String(id||''))||actor?.uid!=='discord:'+id)
        return deny(res,403,'Gebruik je geverifieerde Discord-account');
      const [snapshot,proof]=await Promise.all([
        getSnapshot(),db().collection('bpd_discord_auth').doc(id).get()
      ]);
      if(snapshot?.stale||!Array.isArray(snapshot?.data))
        return deny(res,503,'Personeelslijst is niet actueel');
      const access=permittedCheckrideAccess(actor,proof.data(),snapshot.data,
        process.env.DISCORD_GUILD_ID);
      req.checkride={actor,member:proof.data(),roster:snapshot.data,
        access,allowed:Object.keys(access)};
      res.set('Cache-Control','private, no-store');
      next();
    }catch(e){problem(res,e)}
  }
  function scoped(req,res){
    const track=String(req.query?.track||req.body?.track||'');
    if(!CHECKRIDE_TRACKS[track]){deny(res,400,'Onbekende koppelritcategorie');return null}
    if(!req.checkride.allowed.includes(track)){
      deny(res,403,'Geen instructeurs- of leidingrecht voor deze opleiding');return null}
    return track;
  }
  const entries=track=>db().collection('bpd_checkride_tracks').doc(track).collection('evaluations');
  app.get('/api/checkrides/context',requireUser,authorize,(req,res)=>{
    res.json({tracks:req.checkride.allowed.map(code=>({
      code,department:CHECKRIDE_TRACKS[code].dept,label:CHECKRIDE_TRACKS[code].label,
      access:req.checkride.access[code]
    })),writesEnabled:process.env.BPD_ENABLE_TRAINING_WRITES==='true',
      accessNotice:req.checkride.allowed.length?null:
        checkrideAccessNotice(req.checkride.actor,req.checkride.member,
          req.checkride.roster,process.env.DISCORD_GUILD_ID)});
  });
  app.get('/api/checkrides/subjects',requireUser,authorize,async(req,res)=>{
    const track=scoped(req,res);if(!track)return;
    try{
      const dept=CHECKRIDE_TRACKS[track].dept;
      const roster=req.checkride.roster.filter(p=>p?.dept===dept&&ID.test(String(p.personId||'')));
      const counts=new Map();
      for(const p of roster)counts.set(p.personId,(counts.get(p.personId)||0)+1);
      const unique=roster.filter(p=>counts.get(p.personId)===1&&
        p.personId!==req.checkride.actor.discordId).slice(0,250);
      const proof=await getBelgiumPdDisplayRoles();
      // Member feed is used only to identify a candidate's trainee role.
      // Mentor permissions always come from the actor's independently
      // authenticated OAuth proof above, never from this feed.
      const snaps=[];
      for(let i=0;i<unique.length;i+=50){
        const batch=unique.slice(i,i+50);
        snaps.push(...await db().getAll(...batch.map(p=>
          db().collection('bpd_discord_auth').doc(p.personId))));
      }
      const people=unique.filter((p,i)=>eligibleCheckrideSubject(track,p,
        snaps[i]?.data(),process.env.DISCORD_GUILD_ID,Date.now(),
        exactApiDisplayRoles(proof,p.personId))).map(p=>({
          discordId:p.personId,name:String(p.name||'').slice(0,120),
          call:String(p.call||'').slice(0,30)
        })).sort((a,b)=>a.call.localeCompare(b.call,'nl',{numeric:true}));
      const missing=unique.length-people.length;
      res.json({track,people,limited:roster.length>250,
        emptyReason:people.length?null:
        !unique.length?'Er zijn geen gekoppelde, unieke personeelsfiches voor deze dienst.':
        proof.status!=='ok'
          ?'De Discord-ledencontrole is tijdelijk niet beschikbaar. Alleen kandidaten met een recente Discord-aanmelding worden herkend.':
          'Geen lid met een passende IO- of stagiairrol gevonden. Controleer de juiste Discordrol en DC-ID-koppeling.',
        examined:unique.length,notEligible:missing});
    }catch(e){problem(res,e)}
  });
  app.get('/api/checkrides/evaluations',requireUser,authorize,async(req,res)=>{
    const track=scoped(req,res);if(!track)return;
    try{
      const mentor=req.checkride.access[track]==='begeleider';
      const snap=mentor?await entries(track).where('evaluatorDiscordId','==',
        req.checkride.actor.discordId).limit(200).get():
        await entries(track).orderBy('createdAt','desc').limit(100).get();
      const ordered=mentor?[...snap.docs].sort((a,b)=>
        (b.get('createdAt')?.toMillis?.()||0)-
        (a.get('createdAt')?.toMillis?.()||0)).slice(0,100):snap.docs;
      const evaluations=ordered.map(doc=>{const e=doc.data();return {
        id:doc.id,track,department:CHECKRIDE_TRACKS[track].dept,
        subjectDiscordId:e.subjectDiscordId,
        subjectName:String(e.subjectName||'').slice(0,120),
        subjectCall:String(e.subjectCall||'').slice(0,30),
        eventDate:e.eventDate,kind:e.kind,outcome:e.outcome,
        scores:e.scores,average:e.average,notes:e.notes,
        evaluatorDiscordId:e.evaluatorDiscordId,createdAt:iso(e.createdAt)
      }});
      res.json({track,evaluations,limited:snap.size===(mentor?200:100),
        view:'begeleider'===req.checkride.access[track]?'eigen':'alle'});
    }catch(e){problem(res,e)}
  });
  app.post('/api/checkrides/evaluations',requireUser,authorize,async(req,res)=>{
    if(process.env.BPD_ENABLE_TRAINING_WRITES!=='true')
      return deny(res,503,'Opleidingsevaluaties zijn nog niet ingeschakeld');
    let body;try{body=checkrideInput(req.body)}
    catch(e){return deny(res,400,e.message)}
    if(!req.checkride.allowed.includes(body.track))
      return deny(res,403,'Geen begeleiders- of instructeursrecht voor deze categorie');
    if(req.checkride.access[body.track]==='begeleider'&&body.kind==='eind')
      return deny(res,403,'Alleen instructeurs en leiding mogen een eindbeoordeling indienen');
    if(body.subjectDiscordId===req.checkride.actor.discordId)
      return deny(res,403,'Je kunt jezelf niet evalueren');
    const matches=req.checkride.roster.filter(p=>p?.dept===body.department&&
      p.personId===body.subjectDiscordId);
    if(matches.length!==1)return deny(res,matches.length?409:404,
      'Geen eenduidige kandidaat binnen de juiste dienst');
    try{
      const [membership,upstream]=await Promise.all([
        db().collection('bpd_discord_auth').doc(body.subjectDiscordId).get(),
        getBelgiumPdDisplayRoles()
      ]);
      if(!eligibleCheckrideSubject(body.track,matches[0],
        membership.data(),process.env.DISCORD_GUILD_ID,Date.now(),
        exactApiDisplayRoles(upstream,body.subjectDiscordId)))
        return deny(res,403,'Kandidaat heeft geen passende, geverifieerde opleidingsstatus');
      const record=entries(body.track).doc();
      await record.create({...body,
        subjectName:String(matches[0].name||'').slice(0,120),
        subjectCall:String(matches[0].call||'').slice(0,30),
        evaluatorDiscordId:req.checkride.actor.discordId,
        evaluatorUid:req.checkride.actor.uid,
        status:'ingediend',createdAt:FieldValue.serverTimestamp(),
        evaluatorAccess:req.checkride.access[body.track],
        // Distinct from ordinary training registration and all Discord changes.
        discordRoleUpdated:false,automaticPromotion:false
      });
      res.status(201).json({saved:true,id:record.id,
        discordRoleUpdated:false,automaticPromotion:false});
    }catch(e){problem(res,e)}
  });
}
