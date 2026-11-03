import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdtemp,writeFile,readFile,rm,mkdir} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';

const exec=promisify(execFile);
const OFFICE=new Set(['.pptx','.docx','.xlsx']);
const LIMIT=32*1024*1024;
let pending=0;
export const isOfficeDocument=ext=>OFFICE.has(ext);
export async function officePreviewPdf(bytes,extension){
  if(!OFFICE.has(extension))return null;
  if(!Buffer.isBuffer(bytes)||bytes.length<16||bytes.length>5*1024*1024)
    throw Error('Ongeldig Office-document');
  // Limit simultaneous conversions on the Render 512 MB instance.
  if(pending>=1)throw Object.assign(Error('Documentvoorvertoning is bezet. Probeer opnieuw.'),{status:503});
  pending++;
  let dir=null;
  try{
    dir=await mkdtemp(path.join(tmpdir(),'bpd-office-'));
    const source=path.join(dir,'document'+extension);
    const profile=path.join(dir,'profile');
    await mkdir(profile,{mode:0o700});
    await writeFile(source,bytes,{mode:0o600});
    const env={...process.env,HOME:dir};
    delete env.DISPLAY;
    delete env.SAL_USE_VCLPLUGIN;
    await exec('soffice',[
      '-env:UserInstallation=file://'+profile,
      '--headless','--convert-to','pdf','--outdir',dir,source
    ],{timeout:35000,maxBuffer:16384,env});
    const pdf=await readFile(path.join(dir,'document.pdf'));
    if(pdf.length<20||pdf.length>LIMIT||pdf.subarray(0,5).toString()!=='%PDF-')
      throw Error('Conversie leverde geen geldig PDF-bestand op');
    return pdf;
  }finally{
    pending--;
    if(dir)await rm(dir,{recursive:true,force:true}).catch(()=>{});
  }
}
