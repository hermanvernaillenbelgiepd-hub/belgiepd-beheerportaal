import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {
 CATALOG_BY_ID,customCatalogItem,isCustomDecorationId,publicDecorations,
 validateDecoration,canManagePoliceDecorationCatalog
} from '../src/personnel-decoration-policy.js';
import {imageUpload} from '../src/personnel-decoration-routes.js';

const customId='custom_12345678-1234-4234-8234-123456789abc';
const data={id:customId,label:'Erester BelgiumPD',kind:'medal',
 color:'gold',priority:150,imageBase64:'private bytes',createdByDiscordId:'111111111111111111'};
test('eigen geüpload ereteken heeft vaste publieke afbeeldingsroute zonder private metadata',()=>{
 assert.equal(isCustomDecorationId(customId),true);
 assert.equal(isCustomDecorationId('../outside'),false);
 const item=customCatalogItem(data);
 assert.equal(item.imageUrl,'/api/personnel-awards/catalog-image/'+customId);
 assert.equal(JSON.stringify(item).includes('private bytes'),false);
 assert.equal(JSON.stringify(item).includes('111111111111111111'),false);
 const extras=new Map([[customId,item]]);
 const now='2026-10-27';
 const award={catalogId:customId,startDate:now,endDate:'2026-11-03',public:true};
 assert.equal(publicDecorations([award],now,extras)[0].id,customId);
 assert.deepEqual(publicDecorations([award],'2026-11-04',extras),[]);
 assert.deepEqual(publicDecorations([{...award,public:false}],now,extras),[]);
 assert.equal(validateDecoration({catalogId:customId,startDate:now,endDate:null,
   public:true,reason:'Bijzondere inzet binnen de dienst'},now,
   new Map([...CATALOG_BY_ID,...extras])).catalogId,customId);
});
test('beeldvalidatie accepteert alleen kleine echte PNG/JPEG/WebP pixels',()=>{
 const jpeg=Buffer.alloc(130);jpeg[0]=255;jpeg[1]=216;jpeg[2]=255;
 const body={label:'Dienstmedaille',kind:'medal',color:'gold',
   imageDataUri:'data:image/jpeg;base64,'+jpeg.toString('base64')};
 const parsed=imageUpload(body);
 assert.equal(parsed.mime,'image/jpeg');
 assert.equal(parsed.label,'Dienstmedaille');
 assert.throws(()=>imageUpload({...body,imageDataUri:'data:image/svg+xml;base64,PHN2Zz4='}));
 assert.throws(()=>imageUpload({...body,imageDataUri:'data:image/png;base64,'+jpeg.toString('base64')}));
 assert.throws(()=>imageUpload({...body,imageDataUri:'data:image/jpeg;base64,'+
    Buffer.alloc(85000,2).toString('base64')}));
});
test('bestuur alleen of middenkader mag geen ereteken uploaden',()=>{
 const actor={uid:'discord:222222222222222222',discordId:'222222222222222222',
  role:'officierenkader',departments:['politie'],
  departmentRoles:{politie:'officierenkader'},
  dossierNativeDepartments:['politie'],dossierAllowedDepartments:['politie']};
 assert.equal(canManagePoliceDecorationCatalog(actor),true);
 assert.equal(canManagePoliceDecorationCatalog({...actor,role:'middenkader'}),false);
 assert.equal(canManagePoliceDecorationCatalog({...actor,departments:['brandweer']}),false);
 assert.equal(canManagePoliceDecorationCatalog({...actor,dossierNativeDepartments:[]}),false);
 assert.equal(canManagePoliceDecorationCatalog({...actor,uid:'google:222222222222222222'}),false);
});
test('portret toont borstgraad en zilveren naamplaat; upload is geen ongeauthenticeerde actie',()=>{
 const uniform=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 const style=readFileSync(new URL('../public/assets/organogram-police-formal.css',import.meta.url),'utf8');
 const ui=readFileSync(new URL('../public/assets/organogram-decorations.js',import.meta.url),'utf8');
 const backend=readFileSync(new URL('../src/personnel-decoration-routes.js',import.meta.url),'utf8');
 const roster=readFileSync(new URL('../src/member-dashboard-routes.js',import.meta.url),'utf8');
 assert.match(uniform,/bpd-insignia-sprite/);
 assert.match(uniform,/bpd-silver-nameplate/);
 assert.match(uniform,/container\.style\.setProperty\('--bpd-rank-top'/);
 assert.match(style,/\.bpd-photo-rank>\.bpd-insignia-sprite/);
 assert.match(style,/\.bpd-police-formal>\.bpd-silver-nameplate/);
 assert.match(ui,/catalog-upload/);
 assert.match(backend,/app\.post\('\/api\/personnel-awards\/catalog-upload',requireUser/);
 assert.match(backend,/canManagePoliceDecorationCatalog\(req\.bpd\)/);
 assert.match(roster,/publicOrganogramRoster\(snapshot\.data,byPerson,customCatalog\)/);
});
test('geen eretekens worden door rangkaart of afbeelding automatisch toegekend',()=>{
 const src=readFileSync(new URL('../public/assets/organogram-police-formal.js',import.meta.url),'utf8');
 assert.match(src,/person\.awards/);
 assert.doesNotMatch(src,/fetch\(/);
 const report=readFileSync(new URL('../src/management-routes.js',import.meta.url),'utf8');
 assert.match(report,/PERSONNEL_DECORATION_CATALOG_COLLECTION/);
});
