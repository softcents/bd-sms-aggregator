import {Injectable,BadRequestException,NotFoundException} from '@nestjs/common';
import crypto from 'crypto';
import Decimal from 'decimal.js';
import {PostgresService} from '../db/postgres.service';

function norm(v:string){const d=String(v).replace(/\\D/g,'');return d.startsWith('880')?d:d.startsWith('0')?'880'+d.slice(1):'880'+d}
function parts(body:string,u:boolean){const n=Array.from(body).length;return u?(n<=70?1:Math.ceil(n/67)):(n<=160?1:Math.ceil(n/153))}
@Injectable()
export class CampaignService{
 constructor(private readonly db:PostgresService,private readonly queue:any){}
 async contacts(uid:string,limit=100,offset=0){const q=await this.db.pool.query('SELECT id,name,phone,email,group_name as "groupName",metadata,"createdAt" FROM "Contact" WHERE "userId"=$1 ORDER BY id DESC LIMIT $2 OFFSET $3',[uid,Math.min(limit,500),Math.max(offset,0)]);return q.rows}
 async addContact(uid:string,b:any){const phone=norm(String(b.phone||''));if(phone.length<11)throw new BadRequestException('Invalid phone');try{const q=await this.db.pool.query('INSERT INTO "Contact" ("userId",name,phone,email,group_name,metadata,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW()) RETURNING *',[uid,String(b.name||''),phone,b.email||null,b.groupName||null,JSON.stringify(b.metadata||{})]);return q.rows[0]}catch(e:any){if(e.code==='23505')throw new BadRequestException('Contact already exists');throw e}}
 async groups(uid:string){const q=await this.db.pool.query('SELECT g.id,g.name,g.description,COUNT(gc."contactId")::int "contactCount" FROM "ContactGroup" g LEFT JOIN "ContactGroupMember" gc ON gc."groupId"=g.id WHERE g."userId"=$1 GROUP BY g.id ORDER BY g.id DESC',[uid]);return q.rows}
 async createGroup(uid:string,b:any){const q=await this.db.pool.query('INSERT INTO "ContactGroup" ("userId",name,description,"createdAt","updatedAt") VALUES ($1,$2,$3,NOW(),NOW()) RETURNING *',[uid,String(b.name||'').trim(),b.description||null]);return q.rows[0]}
 async addToGroup(uid:string,groupId:string,contactIds:string[]){const g=await this.db.pool.query('SELECT id FROM "ContactGroup" WHERE id=$1 AND "userId"=$2',[groupId,uid]);if(!g.rowCount)throw new NotFoundException('Group not found');for(const id of [...new Set(contactIds)])await this.db.pool.query('INSERT INTO "ContactGroupMember" ("groupId","contactId") SELECT $1,c.id FROM "Contact" c WHERE c.id=$2 AND c."userId"=$3 ON CONFLICT DO NOTHING',[groupId,id,uid]);return {status:'ok'}}
 async importCsv(uid:string,b:any){
   const csv=String(b.csv||'');if(!csv.trim())throw new BadRequestException('csv is required');
   const rows=csv.split(/\\r?\\n/).map(x=>x.trim()).filter(Boolean);if(!rows.length)throw new BadRequestException('CSV is empty');
   const header=rows[0].split(',').map(x=>x.trim().toLowerCase());const phoneIdx=header.findIndex(x=>['phone','mobile','msisdn','number'].includes(x));const nameIdx=header.findIndex(x=>x==='name');if(phoneIdx<0)throw new BadRequestException('CSV must contain phone/mobile/msisdn/number column');
   const ext=crypto.randomUUID();const ins=await this.db.pool.query('INSERT INTO "ContactImport" ("externalId","userId","fileName",status,"totalRows","groupId") VALUES ($1,$2,$3,\'processing\',$4,$5) RETURNING id',[ext,uid,b.fileName||null,rows.length-1,b.groupId?String(b.groupId):null]);
   let imported=0,skipped=0,errors=0;const errorReport:any[]=[];const client=await this.db.pool.connect();
   try{for(let start=1;start<rows.length;start+=1000){await client.query('BEGIN');for(let i=start;i<Math.min(start+1000,rows.length);i++){const cols=rows[i].split(',').map(x=>x.trim().replace(/^"|"$/g,''));const phone=norm(cols[phoneIdx]||'');if(phone.length<11){errors++;if(errorReport.length<100)errorReport.push({row:i+1,error:'invalid phone'});continue}try{const q=await client.query('INSERT INTO "Contact" ("userId",name,phone,email,metadata,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT ("userId","phone") DO NOTHING RETURNING id',[uid,nameIdx>=0?cols[nameIdx]||'': '',phone,null,JSON.stringify({importId:ext})]);if(q.rowCount){imported++;if(b.groupId)await client.query('INSERT INTO "ContactGroupMember" ("groupId","contactId") VALUES ($1,$2) ON CONFLICT DO NOTHING',[String(b.groupId),q.rows[0].id])}else skipped++}catch(e){errors++;if(errorReport.length<100)errorReport.push({row:i+1,error:'insert failed'})}}await client.query('COMMIT')}await this.db.pool.query('UPDATE "ContactImport" SET status=\'completed\',"importedRows"=$1,"skippedRows"=$2,"errorRows"=$3,"errorReport"=$4,"completedAt"=NOW() WHERE id=$5',[imported,skipped,errors,JSON.stringify(errorReport),ins.rows[0].id]);return {status:'completed',importId:ext,totalRows:rows.length-1,importedRows:imported,skippedRows:skipped,errorRows:errors}}catch(e){await client.query('ROLLBACK').catch(()=>{});await this.db.pool.query('UPDATE "ContactImport" SET status=\'failed\',"errorReport"=$1 WHERE id=$2',[JSON.stringify([{error:String((e as any).message||e)}]),ins.rows[0].id]);throw e}finally{client.release()}
 }
 async imports(uid:string){return (await this.db.pool.query('SELECT "externalId",status,"fileName","totalRows","importedRows","skippedRows","errorRows","createdAt","completedAt" FROM "ContactImport" WHERE "userId"=$1 ORDER BY id DESC LIMIT 50',[uid])).rows}
 async templates(uid:string){return (await this.db.pool.query('SELECT * FROM "SmsTemplate" WHERE "userId"=$1 ORDER BY id DESC',[uid])).rows}
 async createTemplate(uid:string,b:any){if(!b.name||!b.body)throw new BadRequestException('name and body required');return (await this.db.pool.query('INSERT INTO "SmsTemplate" ("userId",name,body,"createdAt","updatedAt") VALUES ($1,$2,$3,NOW(),NOW()) RETURNING *',[uid,String(b.name),String(b.body)])).rows[0]}
 async createCampaign(uid:string,b:any){
   const senderId=String(b.senderId||''),body=String(b.body||'');
   if(!senderId||!body)throw new BadRequestException('senderId and body required');
   let recipients:string[]=(Array.isArray(b.recipients)?b.recipients:[]).map(norm);
   if(Array.isArray(b.groupIds)&&b.groupIds.length){
     const q=await this.db.pool.query('SELECT DISTINCT c.phone FROM "Contact" c JOIN "ContactGroupMember" gm ON gm."contactId"=c.id JOIN "ContactGroup" g ON g.id=gm."groupId" WHERE c."userId"=$1 AND g."userId"=$1 AND g.id=ANY($2::bigint[])',[uid,b.groupIds.map(String)]);
     recipients.push(...q.rows.map(x=>x.phone));
   }
   recipients=[...new Set(recipients.filter(x=>x.length>=11))];
   if(!recipients.length)throw new BadRequestException('No recipients');
   const unicode=b.isUnicode??/[^\x00-\x7F]/.test(body), p=parts(body,unicode);
   const scheduledAt=b.scheduledAt?new Date(b.scheduledAt):new Date();
   if(Number.isNaN(scheduledAt.getTime()))throw new BadRequestException('Invalid scheduledAt');
   const sender=await this.db.pool.query('SELECT id,"senderId",type,"billMsisdn" FROM "Sender" WHERE "userId"=$1 AND "senderId"=$2 AND status=\'active\'',[uid,senderId]);
   if(!sender.rowCount)throw new BadRequestException('Sender not found');
   const batch=(await this.db.pool.query('INSERT INTO "Batch" ("externalId","userId","senderId",body,status,"totalRecipients","validCount","scheduledAt","createdAt","updatedAt") VALUES (gen_random_uuid(),$1,$2,$3,\'planning\',$4,0,$5,NOW(),NOW()) RETURNING id,"externalId"',[uid,sender.rows[0].id,body,recipients.length,scheduledAt])).rows[0];
   let total=new Decimal(0),valid=0;
   const masking=['masking','alphanumeric','numeric'].includes(String(sender.rows[0].type||'').toLowerCase());
   try{
     for(let start=0;start<recipients.length;start+=1000){
       const chunk=recipients.slice(start,start+1000);
       const q=await this.db.pool.query(`INSERT INTO "CampaignRecipient" ("batchId",phone,"operatorId",rate,cost,parts,status,"createdAt","updatedAt")
         SELECT $1,x.phone,op.id,rt.unit,rt.unit*$2,$3,'pending',NOW(),NOW()
         FROM unnest($4::text[]) x(phone)
         JOIN LATERAL (SELECT o.id FROM "OperatorPrefix" p JOIN "Operator" o ON o.id=p."operatorId" WHERE p.enabled AND o.enabled AND x.phone LIKE p.prefix||'%' ORDER BY length(p.prefix) DESC LIMIT 1) op ON true
         JOIN LATERAL (SELECT CASE WHEN $5::boolean THEN tr."maskingPrice" ELSE tr."nonMaskingPrice" END AS unit
           FROM "TariffRate" tr JOIN "TariffPlanAssignment" a ON a."tariffPlanId"=tr."tariffPlanId"
           WHERE a."userId"=$6 AND tr."operatorId"=op.id AND tr."effectiveFrom"<=NOW()
           ORDER BY a."effectiveFrom" DESC,tr."effectiveFrom" DESC LIMIT 1) rt ON true
         ON CONFLICT ("batchId",phone) DO NOTHING RETURNING cost`,[batch.id,p,p,chunk,masking,uid]);
       for(const row of q.rows){total=total.add(String(row.cost));valid++;}
     }
     if(!valid)throw new BadRequestException('No valid recipients with tariff mapping');
     const u=await this.db.pool.query('SELECT balance FROM "User" WHERE id=$1 FOR UPDATE',[uid]);
     const before=new Decimal(String(u.rows[0].balance));if(before.lt(total))throw new BadRequestException('Insufficient balance');
     const after=before.sub(total);
     await this.db.pool.query('UPDATE "User" SET balance=$1,"updatedAt"=NOW() WHERE id=$2',[after.toFixed(6),uid]);
     await this.db.pool.query('INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") VALUES ($1,$2,\'debit\',$3,$4,$5,NOW())',[uid,total.toFixed(6),before.toFixed(6),after.toFixed(6),'Campaign '+batch.externalId]);
     await this.db.pool.query('UPDATE "Batch" SET status=\'queued\',"validCount"=$1,"invalidCount"=$2,"totalRecipients"=$3,"updatedAt"=NOW() WHERE id=$4',[valid,recipients.length-valid,recipients.length,batch.id]);
     await this.queue.publishCampaign(String(batch.id));
     return {status:'accepted',campaignId:batch.externalId,batchId:batch.externalId,recipients:valid,totalCost:total.toFixed(6),chunkSize:1000};
   }catch(e){await this.db.pool.query('UPDATE "Batch" SET status=\'cancelled\',"cancelledAt"=NOW(),"updatedAt"=NOW() WHERE id=$1 AND status=\'planning\'',[batch.id]);throw e}
 }
 async control(uid:string,id:string,action:string){
   const c=await this.db.pool.connect();
   try{await c.query('BEGIN');const b=await c.query('SELECT id,status FROM "Batch" WHERE "externalId"=$1 AND "userId"=$2 FOR UPDATE',[id,uid]);if(!b.rowCount)throw new NotFoundException('Campaign not found');const batch=b.rows[0];
   if(action==='pause'){if(!['queued','processing'].includes(batch.status))throw new BadRequestException('Campaign cannot be paused');await c.query('UPDATE "Batch" SET status=\'paused\',"pausedAt"=NOW(),"updatedAt"=NOW() WHERE id=$1',[batch.id]);}
   else if(action==='resume'){if(batch.status!=='paused')throw new BadRequestException('Campaign is not paused');await c.query('UPDATE "Batch" SET status=\'processing\',"pausedAt"=NULL,"updatedAt"=NOW() WHERE id=$1',[batch.id]);}
   else if(action==='cancel'){if(['completed','cancelled'].includes(batch.status))throw new BadRequestException('Campaign already finished');const u=await c.query('SELECT balance FROM "User" WHERE id=$1 FOR UPDATE',[uid]);const q=await c.query('SELECT COALESCE(SUM(cost),0)::numeric refund FROM "Message" WHERE "batchId"=$1 AND status IN (\'queued\',\'pending\')',[batch.id]);const refund=String(q.rows[0].refund||'0');const before=String(u.rows[0].balance);const after=new Decimal(before).add(refund).toFixed(6);await c.query('UPDATE "Message" SET status=\'failed\',"failedReason"=\'campaign_cancelled\',"failedAt"=NOW(),"refundReference"=\'campaign-refund:\'||"externalId","updatedAt"=NOW() WHERE "batchId"=$1 AND status IN (\'queued\',\'pending\')',[batch.id]);if(new Decimal(refund).gt(0)){await c.query('UPDATE "User" SET balance=$1,"updatedAt"=NOW() WHERE id=$2',[after,uid]);await c.query('INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") VALUES ($1,$2,\'credit\',$3,$4,$5,NOW())',[uid,refund,before,after,'Campaign cancellation '+id]);}await c.query('UPDATE "Batch" SET status=\'cancelled\',"cancelledAt"=NOW(),"updatedAt"=NOW() WHERE id=$1',[batch.id]);}
   else throw new BadRequestException('Unknown action');await c.query('COMMIT');return {status:'ok',action,campaignId:id}}
   catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
 }
 async campaigns(uid:string){return (await this.db.pool.query('SELECT b."externalId",b.status,b.body,b."totalRecipients",b."validCount",b."invalidCount",b."createdAt",COALESCE(SUM(m.cost),0)::numeric cost FROM "Batch" b LEFT JOIN "Message" m ON m."batchId"=b.id WHERE b."userId"=$1 GROUP BY b.id ORDER BY b.id DESC LIMIT 100',[uid])).rows}
}