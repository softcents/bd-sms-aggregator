import { Pool } from 'pg';
export const db=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.WORKER_DB_POOL||10)});

export async function claimForSending(externalId:string){
  const q=await db.query('UPDATE "Message" SET status=\'sending\',"updatedAt"=NOW() WHERE "externalId"=$1 AND status IN (\'queued\',\'pending\') RETURNING id,"externalId",status',[externalId]);
  return q.rowCount>0;
}

export async function markSent(externalId:string,gatewayMessageId:string,report:any){
  const c=await db.connect();
  try{await c.query('BEGIN');
    const q=await c.query('UPDATE "Message" SET status=\'sent\',"gatewayMessageId"=$1,"sentAt"=NOW(),"infozillionReport"=$2,"nextPollAt"=NOW(),"dlrClaimedAt"=NULL,"updatedAt"=NOW() WHERE "externalId"=$3 AND status=\'sending\' RETURNING "batchId"',[gatewayMessageId,JSON.stringify(report),externalId]);
    if(q.rowCount&&q.rows[0].batchId) await completeBatchIfDone(c,q.rows[0].batchId);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function markDelivered(externalId:string,report:any){
  const c=await db.connect();
  try{await c.query('BEGIN');
    const q=await c.query('UPDATE "Message" SET status=\'delivered\',"deliveredAt"=NOW(),"infozillionReport"=$1,"nextPollAt"=NULL,"dlrClaimedAt"=NULL,"updatedAt"=NOW() WHERE "externalId"=$2 AND status NOT IN (\'failed\',\'delivered\') RETURNING "batchId"',[JSON.stringify(report),externalId]);
    if(q.rowCount&&q.rows[0].batchId) await completeBatchIfDone(c,q.rows[0].batchId);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function markFailedAndRefund(externalId:string,reason:string,report:any){
  const c=await db.connect();
  try{
    await c.query('BEGIN');
    const q=await c.query('SELECT id,"userId",cost,status,"refundReference","batchId" FROM "Message" WHERE "externalId"=$1 FOR UPDATE',[externalId]);
    if(!q.rowCount){await c.query('ROLLBACK');return}
    const m=q.rows[0];
    if(m.status==='failed'||m.status==='delivered'){await c.query('COMMIT');return}
    await c.query('UPDATE "Message" SET status=\'failed\',"failedReason"=$1,"failedAt"=NOW(),"infozillionReport"=$2,"nextPollAt"=NULL,"updatedAt"=NOW() WHERE id=$3',[reason,JSON.stringify(report),m.id]);
    if(m.cost && !m.refundReference){
      const u=await c.query('SELECT balance FROM "User" WHERE id=$1 FOR UPDATE',[m.userId]);
      if(u.rowCount){
        await c.query('UPDATE "User" SET balance=balance+$1,"updatedAt"=NOW() WHERE id=$2',[m.cost,m.userId]);
        await c.query('INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") SELECT $1,$2,\'credit\',balance-$2,balance,\'SMS refund \'+$3,NOW() FROM "User" WHERE id=$1',[m.userId,m.cost,'sms-refund:'+externalId]);
        await c.query('UPDATE "Message" SET "refundReference"=$1,"updatedAt"=NOW() WHERE id=$2',['sms-refund:'+externalId,m.id]);
      }
    }
    if(m.batchId) await completeBatchIfDone(c,m.batchId);
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

async function completeBatchIfDone(c:any,batchId:string){
  await c.query('UPDATE "Batch" SET status=\'completed\',"completedAt"=COALESCE("completedAt",NOW()),"updatedAt"=NOW() WHERE id=$1 AND status NOT IN (\'paused\',\'cancelled\',\'completed\') AND NOT EXISTS (SELECT 1 FROM "Message" m WHERE m."batchId"=$1 AND m.status IN (\'queued\',\'pending\',\'sending\'))',[batchId]);
}
export async function resetForRetry(externalId:string){await db.query('UPDATE "Message" SET status=\'queued\',"updatedAt"=NOW() WHERE "externalId"=$1 AND status=\'sending\'',[externalId]);}
