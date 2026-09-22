import { Pool } from 'pg';
export const db=new Pool({connectionString:process.env.DATABASE_URL,max:Number(process.env.WORKER_DB_POOL||10)});

export async function claimForSending(externalId:string){
  const q=await db.query('UPDATE "Message" SET status=\'sending\',"updatedAt"=NOW() WHERE "externalId"=$1 AND status IN (\'queued\',\'pending\') RETURNING id,"externalId",status',[externalId]);
  return q.rowCount>0;
}

export async function markSent(externalId:string,gatewayMessageId:string,report:any){
  const c=await db.connect();
  try{await c.query('BEGIN');
    const q=await c.query('UPDATE "Message" SET status=$1,"gatewayMessageId"=$2,"sentAt"=NOW(),"infozillionReport"=$3,"nextPollAt"=NOW(),"updatedAt"=NOW() WHERE "externalId"=$4 AND status=\'sending\' RETURNING "batchId"',['sent',gatewayMessageId,JSON.stringify(report),externalId]);
    if(q.rowCount&&q.rows[0].batchId){await c.query('UPDATE "Batch" SET status=\'completed\',"completedAt"=NOW(),"updatedAt"=NOW() WHERE id=$1 AND status NOT IN (\'paused\',\'cancelled\') AND NOT EXISTS (SELECT 1 FROM "Message" m WHERE m."batchId"=$1 AND m.status IN (\'queued\',\'pending\',\'sending\'))',[q.rows[0].batchId]);}
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release()}
}

export async function markFailedAndRefund(externalId:string,reason:string,report:any){
  const c=await db.connect();
  try{
    await c.query('BEGIN');
    const q=await c.query('SELECT id,"userId",cost,status,"refundReference" FROM "Message" WHERE "externalId"=$1 FOR UPDATE',[externalId]);
    if(!q.rowCount){await c.query('ROLLBACK');return;}
    const m=q.rows[0];
    if(m.status==='failed'||m.status==='delivered'){await c.query('COMMIT');return;}
    await c.query('UPDATE "Message" SET status=$1,"failedReason"=$2,"failedAt"=NOW(),"infozillionReport"=$3,"nextPollAt"=NULL,"updatedAt"=NOW() WHERE id=$4',['failed',reason,JSON.stringify(report),m.id]);
    if(Number(m.cost)>0&&!m.refundReference){
      const ref='sms-refund:'+externalId;
      const u=await c.query('SELECT balance FROM "User" WHERE id=$1 FOR UPDATE',[m.userId]);
      const before=Number(u.rows[0].balance);const after=before+Number(m.cost);
      await c.query('UPDATE "User" SET balance=$1,"updatedAt"=NOW() WHERE id=$2',[after,m.userId]);
      await c.query('INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',[m.userId,m.cost,'credit',before,after,'SMS refund '+ref]);
      await c.query('UPDATE "Message" SET "refundReference"=$1,"updatedAt"=NOW() WHERE id=$2',[ref,m.id]);
    }
    await c.query('COMMIT');
  }catch(e){await c.query('ROLLBACK');throw e}finally{c.release();}
}

export async function resetForRetry(externalId:string){ await db.query('UPDATE "Message" SET status=\'queued\',"updatedAt"=NOW() WHERE "externalId"=$1 AND status=\'sending\'',[externalId]); }
