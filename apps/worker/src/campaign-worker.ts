import 'dotenv/config';
import amqp from 'amqplib';
import {db} from './db';
import crypto from 'crypto';

async function plan(batchId:string){
  const c=await db.connect();
  try{
    await c.query('BEGIN');
    const b=(await c.query('SELECT b.id,b."externalId",b."userId",b."senderId",b.body,b."scheduledAt",s."senderId" as "senderLabel",s.type,s."billMsisdn" FROM "Batch" b JOIN "Sender" s ON s.id=b."senderId" WHERE b.id=$1 AND b.status NOT IN (\'paused\',\'cancelled\') FOR UPDATE',[batchId])).rows[0];
    if(!b){await c.query('ROLLBACK');return false}
    const rows=(await c.query(`SELECT id,phone,parts,rate,cost FROM "CampaignRecipient" WHERE "batchId"=$1 AND status='pending' ORDER BY id LIMIT $2 FOR UPDATE SKIP LOCKED`,[batchId,Number(process.env.CAMPAIGN_CHUNK_SIZE||1000)])).rows;
    if(!rows.length){
      await c.query('UPDATE "Batch" SET status=CASE WHEN status=\'queued\' THEN \'completed\' ELSE status END,"startedAt"=COALESCE("startedAt",NOW()),"completedAt"=CASE WHEN status=\'queued\' THEN NOW() ELSE "completedAt" END,"updatedAt"=NOW() WHERE id=$1',[batchId]);
      await c.query('COMMIT');return false;
    }
    await c.query('UPDATE "Batch" SET status=\'processing\',"startedAt"=COALESCE("startedAt",NOW()),"updatedAt"=NOW() WHERE id=$1 AND status=\'queued\'',[batchId]);
    for(const r of rows){
      const mid=crypto.randomUUID();
      await c.query('INSERT INTO "Message" ("externalId","userId","batchId","senderId",to,body,status,source,"isUnicode",parts,rate,cost,"createdAt","updatedAt") VALUES ($1,$2,$3,$4,$5,$6,\'queued\',\'campaign\',$7,$8,$9,$10,NOW(),NOW())',[mid,b.userId,b.id,b.senderId,r.phone,b.body,/[^\x00-\x7F]/.test(b.body),r.parts,r.rate,r.cost]);
      const payload={id:crypto.randomUUID(),messageId:mid,batchId:String(b.id),provider:'InfoZillion',senderId:b.senderLabel,senderType:b.type,billMsisdn:b.billMsisdn||null,to:[r.phone],body:b.body,isUnicode:/[^\x00-\x7F]/.test(b.body),isLongSMS:Number(r.parts)>1};
      await c.query('INSERT INTO "OutboxEvent" ("aggregateType","aggregateId","eventType",payload,"availableAt","createdAt") VALUES (\'message\',$1,\'sms.infozillion\',$2,$3,NOW())',[mid,JSON.stringify(payload),b.scheduledAt||new Date()]);
      await c.query('UPDATE "CampaignRecipient" SET status=\'planned\',"messageId"=$1,"updatedAt"=NOW() WHERE id=$2',[mid,r.id]);
    }
    await c.query('COMMIT');return true;
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}
async function main(){
 const conn=await amqp.connect(process.env.RABBITMQ_URL||'amqp://sms:sms@localhost:5672');
 const ch=await conn.createChannel();await ch.assertExchange('sms','topic',{durable:true});await ch.assertQueue('campaign.plan',{durable:true});await ch.bindQueue('campaign.plan','sms','campaign.plan');ch.prefetch(Number(process.env.CAMPAIGN_PREFETCH||2));
 await ch.consume('campaign.plan',async m=>{if(!m)return;try{const job=JSON.parse(m.content.toString());const more=await plan(String(job.batchId));ch.ack(m);if(more)ch.publish('sms','campaign.plan',Buffer.from(JSON.stringify(job)),{persistent:true,contentType:'application/json'});}catch(e){console.error('campaign planner failed',e);ch.nack(m,false,true)}});
 console.log('Campaign planner ready');
}
main().catch(e=>{console.error(e);process.exit(1)});
