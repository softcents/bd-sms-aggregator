import 'dotenv/config';
import amqp from 'amqplib';
import {parse} from 'csv-parse/sync';
import {db} from './db';

function norm(v:string){const d=String(v||'').replace(/\D/g,'');return d.startsWith('880')?d:d.startsWith('0')?'880'+d.slice(1):'880'+d}
async function runImport(importId:string){
 const c=await db.connect();
 try{
  const q=await c.query('SELECT id,"userId","groupId","sourceData","totalRows" FROM "ContactImport" WHERE "externalId"=$1 FOR UPDATE',[importId]);
  if(!q.rowCount)return;
  const job=q.rows[0]; await c.query('UPDATE "ContactImport" SET status=\'processing\' WHERE id=$1',[job.id]);
  const records=parse(String(job.sourceData||''),{columns:true,skip_empty_lines:true,relax_column_count:true,trim:true});
  let imported=0,skipped=0,errors=0;const report:any[]=[];
  for(let start=0;start<records.length;start+=1000){
   await c.query('BEGIN');
   try{
    for(let i=start;i<Math.min(start+1000,records.length);i++){
     const row:any=records[i], raw=row.phone??row.mobile??row.msisdn??row.number??'', phone=norm(raw);
     if(phone.length<11){errors++;if(report.length<100)report.push({row:i+2,error:'invalid phone'});continue}
     const ins=await c.query('INSERT INTO "Contact" ("userId",name,phone,email,metadata,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,NOW(),NOW()) ON CONFLICT ("userId","phone") DO NOTHING RETURNING id',[job.userId,String(row.name||''),phone,row.email||null,JSON.stringify({importId})]);
     if(!ins.rowCount){skipped++;continue}
     imported++;
     if(job.groupId)await c.query('INSERT INTO "ContactGroupMember" ("groupId","contactId") VALUES ($1,$2) ON CONFLICT DO NOTHING',[job.groupId,ins.rows[0].id]);
    }
    await c.query('COMMIT');
   }catch(e){await c.query('ROLLBACK');throw e}
   await c.query('UPDATE "ContactImport" SET "importedRows"=$1,"skippedRows"=$2,"errorRows"=$3,"errorReport"=$4 WHERE id=$5',[imported,skipped,errors,JSON.stringify(report),job.id]);
  }
  await c.query('UPDATE "ContactImport" SET status=\'completed\',"importedRows"=$1,"skippedRows"=$2,"errorRows"=$3,"errorReport"=$4,"sourceData"=NULL,"completedAt"=NOW() WHERE id=$5',[imported,skipped,errors,JSON.stringify(report),job.id]);
 }catch(e:any){
  await c.query('UPDATE "ContactImport" SET status=\'failed\',"errorReport"=$1,"sourceData"=NULL WHERE "externalId"=$2',[JSON.stringify([{error:String(e.message||e)}]),importId]);
  throw e;
 }finally{c.release()}
}
async function main(){
 const conn=await amqp.connect(process.env.RABBITMQ_URL||'amqp://sms:sms@localhost:5672');const ch=await conn.createChannel();
 await ch.assertExchange('sms','topic',{durable:true});await ch.assertQueue('contact.import',{durable:true});await ch.bindQueue('contact.import','sms','contact.import');ch.prefetch(Number(process.env.IMPORT_PREFETCH||1));
 await ch.consume('contact.import',async m=>{if(!m)return;try{const j=JSON.parse(m.content.toString());await runImport(String(j.importId));ch.ack(m)}catch(e){console.error('import failed',e);ch.nack(m,false,false)}});
 console.log('Contact import worker ready');
}
main().catch(e=>{console.error(e);process.exit(1)});
