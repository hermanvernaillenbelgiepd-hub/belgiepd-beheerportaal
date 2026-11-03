import {randomUUID} from 'node:crypto';
import {getFirestore,FieldValue} from 'firebase-admin/firestore';
import {getStorage} from 'firebase-admin/storage';
import {DOCUMENT_DEPARTMENTS,documentScopes,verifiedDocumentRoles,
  mayReadDocument,mayWriteDocuments,mayManageDocuments} from './document-center-policy.js';

const META='bpd_document_center',AUDIT='bpd_document_center_audit',
  VERSIONS='bpd_document_center_versions';
const MAX_BYTES=5*1024*1024;
const TYPES=Object.freeze({
  pdf:{mime:'application/pdf',ext:'.pdf'},
  docx:{mime:'application/vnd.openxmlformats-officedocument.wordprocessingml.document',ext:'.docx'},
  pptx:{mime:'application/vnd.openxmlformats-officedocument.presentationml.presentation',ext:'.pptx'},
  xlsx:{mime:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',ext:'.xlsx'},
  png:{mime:'image/png',ext:'.png'},
  jpg:{mime:'image/jpeg',ext:'.jpg'},
  jpeg:{mime:'image/jpeg',ext:'.jpg'},
  webp:{mime:'image/webp',ext:'.webp'}
});
const CATEGORIES=Object.freeze(['opleiding','procedure','lesmateriaal','formulier','evaluatie','dienstnota','overig']);
const AUDIENCES=Object.freeze(['instructeurs','leiding']);
const ID=/^[0-9a-f-]{36}$/i;
const fail=(status,message)=>Object.assign(new Error(message),{status});
const bucketName=env=>String(env.BPD_DOCUMENT_CENTER_BUCKET||
  env.BPD_UNIFORM_LIBRARY_BUCKET||env.FIREBASE_STORAGE_BUCKET||'').trim();
const storage=()=>{const name=bucketName(process.env);
  if(!name)throw fail(503,'Firebase Storage is nog niet ingesteld');
  return getStorage().bucket(name);
};
const cleanText=(value,min,max,label)=>{
  const str=typeof value==='string'?value.trim():'';
  if(str.length<min||str.length>max||/[\x00-\x08\x0b\x0c\x0e-\x1f<>]/.test(str))
    throw fail(400,label+' moet '+min+' tot '+max+' tekens bevatten');
  return str;
};
function details(body,upload=false){
  if(!body||typeof body!=='object'||Array.isArray(body)||
    Object.keys(body).some(k=>!['department','title','description','category','audience',
      ...(upload?['fileName','base64']:[])].includes(k)))throw fail(400,'Ongeldige documentgegevens');
  const department=String(body.department||'');
  if(!DOCUMENT_DEPARTMENTS.includes(department))throw fail(400,'Onbekende hulpdienst');
  const title=cleanText(body.title,3,120,'Titel');
  const description=cleanText(body.description||'',0,1000,'Omschrijving');
  const category=String(body.category||'');
  const audience=String(body.audience||'');
  if(!CATEGORIES.includes(category)||!AUDIENCES.includes(audience))
    throw fail(400,'Kies een geldige categorie en doelgroep');
  return {department,title,description,category,audience};
}
export function validateDocumentUpload(body){
  const fields=details(body,true);
  const filename=cleanText(body.fileName,5,120,'Bestandsnaam');
  if(/[\/\\]/.test(filename))throw fail(400,'Ongeldige bestandsnaam');
  const ext=filename.split('.').pop().toLowerCase();
  const type=TYPES[ext];
  if(!type)throw fail(400,'Gebruik PDF, DOCX, PPTX, XLSX, PNG, JPG of WebP');
  const b64=typeof body.base64==='string'?body.base64:'';
  if(!b64||b64.length>Math.ceil(MAX_BYTES/3)*4+8||
    !/^[A-Za-z0-9+/]+={0,2}$/.test(b64))throw fail(400,'Ongeldige of te grote upload');
  const bytes=Buffer.from(b64,'base64');
  if(bytes.length<16||bytes.length>MAX_BYTES||bytes.toString('base64')!==b64)
    throw fail(400,'Ongeldige of te grote upload');
  const zip=bytes.subarray(0,4).equals(Buffer.from([80,75,3,4]));
  const signature=ext==='pdf'?bytes.subarray(0,5).toString('ascii')==='%PDF-':
    ext==='png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):
    (ext==='jpg'||ext==='jpeg')?bytes[0]===255&&bytes[1]===216&&bytes.at(-2)===255&&bytes.at(-1)===217:
    ext==='webp'?bytes.toString('ascii',0,4)==='RIFF'&&bytes.toString('ascii',8,12)==='WEBP':
    zip&&(ext==='docx'?bytes.includes(Buffer.from('word/')):
      ext==='pptx'?bytes.includes(Buffer.from('ppt/')):
      bytes.includes(Buffer.from('xl/')));
  if(!signature)throw fail(400,'De bestandsinhoud komt niet overeen met de extensie');
  return {...fields,filename,bytes,mime:type.mime,size:bytes.length,ext:type.ext};
}
const publicRow=(id,x)=>({
  id,department:x.department,title:x.title,description:x.description,
  category:x.category,audience:x.audience,fileName:x.fileName,mime:x.mime,
  size:x.size,version:x.version||1,uploadedByName:x.uploadedByName||'',
  createdAt:x.createdAt?.toDate?.()?.toISOString?.()||null
});
const error=(res,e)=>{if(e?.status)return res.status(e.status).json({error:e.message});
  console.error('Documentencentrum:',typeof e?.code==='string'?e.code:'storage_error');
  return res.status(503).json({error:'Documentencentrum tijdelijk niet beschikbaar'});
};
export function installDocumentCenterRoutes(app,{requireUser,getSnapshot}){
  async function scope(req,res,next){
    res.set('Cache-Control','private, no-store');
    try{
      const snap=await getSnapshot();
      if(snap.stale)throw fail(503,'Personeelsbron is tijdelijk verouderd');
      const id=String(req.bpd?.discordId||'');
      const member=/^\d{15,22}$/.test(id)?
        await getFirestore().collection('bpd_discord_auth').doc(id).get():null;
      const roles=verifiedDocumentRoles(member?.data(),process.env.DISCORD_GUILD_ID);
      req.documentScopes=documentScopes(req.bpd,snap.data,roles);
      req.documentStaff=snap.data.filter(p=>p.personId===id);
      next();
    }catch(e){error(res,e);}
  }
  app.get('/api/document-center/context',requireUser,scope,(req,res)=>{
    res.json({readDepartments:req.documentScopes.read,
      writeDepartments:req.documentScopes.write,
      manageDepartments:req.documentScopes.manage,
      storageReady:Boolean(bucketName(process.env)),maxBytes:MAX_BYTES,
      categories:CATEGORIES,audiences:AUDIENCES});
  });
  app.get('/api/document-center',requireUser,scope,async(req,res)=>{
    try{
      const dept=String(req.query.department||'');
      if(!DOCUMENT_DEPARTMENTS.includes(dept)||!req.documentScopes.read.includes(dept))
        throw fail(403,'Geen toegang tot deze documenten');
      const snapshot=await getFirestore().collection(META)
        .where('department','==',dept).limit(160).get();
      const rows=snapshot.docs.filter(x=>mayReadDocument(req.documentScopes,x.data()))
        .map(x=>publicRow(x.id,x.data()))
        .sort((a,b)=>(b.createdAt||'').localeCompare(a.createdAt||''));
      res.json({documents:rows,limited:snapshot.size===160});
    }catch(e){error(res,e);}
  });
  app.post('/api/document-center',requireUser,scope,async(req,res)=>{
    let file=null;
    try{
      const item=validateDocumentUpload(req.body);
      if(!mayWriteDocuments(req.documentScopes,item.department))
        throw fail(403,'Geen uploadrechten voor deze dienst');
      const db=getFirestore(),id=randomUUID();
      const path='belgiepd/documents/'+item.department+'/'+id+item.ext;
      file=storage().file(path);
      await file.save(item.bytes,{resumable:false,validation:'crc32c',
        metadata:{contentType:item.mime,cacheControl:'private, no-store'}});
      const person=req.documentStaff.find(p=>p.dept===item.department)||
        req.documentStaff.find(p=>p.dept==='politie');
      const ref=db.collection(META).doc(id);
      const audit=db.collection(AUDIT).doc();
      const batch=db.batch();
      batch.create(ref,{department:item.department,title:item.title,
        description:item.description,category:item.category,audience:item.audience,
        fileName:item.filename,mime:item.mime,size:item.size,storagePath:path,
        version:1,status:'active',owner:'belgiepd',uploadedBy:req.bpd.uid,
        uploadedByName:String(person?.name||'Bevoegd beheer').slice(0,120),
        createdAt:FieldValue.serverTimestamp(),updatedAt:FieldValue.serverTimestamp()});
      batch.create(audit,{documentId:id,department:item.department,
        action:'upload',actorUid:req.bpd.uid,at:FieldValue.serverTimestamp(),
        fileName:item.filename});
      await batch.commit();
      res.status(201).json({saved:true,id});
    }catch(e){
      if(file)await file.delete({ignoreNotFound:true}).catch(()=>{});
      error(res,e);
    }
  });
  app.get('/api/document-center/:id/download',requireUser,scope,async(req,res)=>{
    try{
      if(!ID.test(req.params.id))throw fail(404,'Document niet gevonden');
      const ref=await getFirestore().collection(META).doc(req.params.id).get();
      if(!ref.exists||!mayReadDocument(req.documentScopes,ref.data()))
        throw fail(404,'Document niet gevonden');
      const record=ref.data();
      const prefix='belgiepd/documents/'+record.department+'/'+req.params.id;
      if(typeof record.storagePath!=='string'||
        !(record.storagePath.startsWith(prefix+'.')||record.storagePath.startsWith(prefix+'/')))
        throw fail(503,'Bestandsverwijzing ongeldig');
      const [bytes]=await storage().file(record.storagePath).download();
      await getFirestore().collection(AUDIT).doc().create({
        documentId:req.params.id,department:record.department,action:'download',
        actorUid:req.bpd.uid,at:FieldValue.serverTimestamp()
      });
      const name=encodeURIComponent(record.fileName);
      res.set('Content-Type',record.mime);
      res.set('Content-Disposition',"attachment; filename*=UTF-8''"+name);
      res.set('Content-Security-Policy',"default-src 'none'; sandbox");
      res.set('Cache-Control','private, no-store');
      res.send(bytes);
    }catch(e){error(res,e);}
  });
  app.patch('/api/document-center/:id',requireUser,scope,async(req,res)=>{
    try{
      if(!ID.test(req.params.id))throw fail(404,'Document niet gevonden');
      const db=getFirestore(),ref=db.collection(META).doc(req.params.id);
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists||snap.get('status')!=='active')throw fail(404,'Document niet gevonden');
        const old=snap.data();
        if(!mayManageDocuments(req.documentScopes,old.department))throw fail(403,'Alleen Officierenkader, Korpsleiding of bevoegde administratie kan documenten wijzigen');
        const item=details(req.body);
        if(item.department!==old.department)throw fail(400,'Dienst kan niet gewijzigd worden');
        tx.update(ref,{...item,updatedBy:req.bpd.uid,updatedAt:FieldValue.serverTimestamp()});
        tx.create(db.collection(AUDIT).doc(),{
          documentId:req.params.id,department:old.department,action:'edit',
          actorUid:req.bpd.uid,at:FieldValue.serverTimestamp(),
          old:{title:old.title,description:old.description,category:old.category,audience:old.audience}
        });
      });
      res.json({saved:true});
    }catch(e){error(res,e);}
  });

  // Replacing a published binary creates a new immutable storage object.
  // The old object and its metadata remain preserved for institutional audit.
  app.put('/api/document-center/:id/file',requireUser,scope,async(req,res)=>{
    let newFile=null;
    try{
      if(!ID.test(req.params.id))throw fail(404,'Document niet gevonden');
      const body=req.body||{};
      if(typeof body!=='object'||Array.isArray(body)||
        Object.keys(body).some(k=>!['fileName','base64','expectedVersion'].includes(k)))
        throw fail(400,'Ongeldige versie-aanvraag');
      const expectedVersion=Number(body.expectedVersion);
      if(!Number.isSafeInteger(expectedVersion)||expectedVersion<1)
        throw fail(400,'Een actuele documentversie is verplicht');
      const db=getFirestore(),ref=db.collection(META).doc(req.params.id);
      const snap=await ref.get();
      if(!snap.exists||snap.get('status')!=='active')throw fail(404,'Document niet gevonden');
      const old=snap.data();
      if(!mayManageDocuments(req.documentScopes,old.department))
        throw fail(403,'Alleen Officierenkader, Korpsleiding of bevoegde administratie mag bestanden vervangen');
      if((old.version||1)!==expectedVersion)throw fail(409,'Document is inmiddels gewijzigd. Vernieuw de lijst.');
      const input=validateDocumentUpload({
        department:old.department,title:old.title,description:old.description,
        category:old.category,audience:old.audience,fileName:body.fileName,base64:body.base64
      });
      const newPath='belgiepd/documents/'+old.department+'/'+req.params.id+
        '/v'+(expectedVersion+1)+'-'+randomUUID()+input.ext;
      newFile=storage().file(newPath);
      await newFile.save(input.bytes,{resumable:false,validation:'crc32c',
        metadata:{contentType:input.mime,cacheControl:'private, no-store'}});
      await db.runTransaction(async tx=>{
        const current=await tx.get(ref);
        if(!current.exists||current.get('status')!=='active')throw fail(404,'Document niet gevonden');
        const existing=current.data();
        if((existing.version||1)!==expectedVersion||
          existing.storagePath!==old.storagePath)
          throw fail(409,'Document is inmiddels gewijzigd. Vernieuw de lijst.');
        const stamp=FieldValue.serverTimestamp();
        tx.create(db.collection(VERSIONS).doc(),{
          documentId:req.params.id,department:old.department,
          version:expectedVersion,storagePath:old.storagePath,
          fileName:old.fileName,mime:old.mime,size:old.size,
          archivedAt:stamp,archivedBy:req.bpd.uid
        });
        tx.update(ref,{
          version:expectedVersion+1,storagePath:newPath,fileName:input.filename,
          mime:input.mime,size:input.size,updatedBy:req.bpd.uid,updatedAt:stamp
        });
        tx.create(db.collection(AUDIT).doc(),{
          documentId:req.params.id,department:old.department,action:'replace_file',
          actorUid:req.bpd.uid,at:stamp,
          previousVersion:expectedVersion,newVersion:expectedVersion+1,
          previousStoragePath:old.storagePath,newStoragePath:newPath
        });
      });
      newFile=null; // The committed version must never be deleted.
      res.json({saved:true,version:expectedVersion+1});
    }catch(e){
      if(newFile)await newFile.delete({ignoreNotFound:true}).catch(()=>{});
      error(res,e);
    }
  });

  app.delete('/api/document-center/:id',requireUser,scope,async(req,res)=>{
    try{
      if(!ID.test(req.params.id))throw fail(404,'Document niet gevonden');
      const db=getFirestore(),ref=db.collection(META).doc(req.params.id);
      await db.runTransaction(async tx=>{
        const snap=await tx.get(ref);
        if(!snap.exists||snap.get('status')!=='active')throw fail(404,'Document niet gevonden');
        const old=snap.data();
        if(!mayManageDocuments(req.documentScopes,old.department))
          throw fail(403,'Alleen Officierenkader, Korpsleiding of bevoegde administratie kan documenten archiveren');
        tx.update(ref,{status:'archived',archivedBy:req.bpd.uid,
          archivedAt:FieldValue.serverTimestamp()});
        tx.create(db.collection(AUDIT).doc(),{
          documentId:req.params.id,department:old.department,action:'archive',
          actorUid:req.bpd.uid,at:FieldValue.serverTimestamp(),fileName:old.fileName
        });
      });
      // Files are deliberately retained for audit and potential recovery.
      res.json({archived:true});
    }catch(e){error(res,e);}
  });
}
