import { Injectable, NotFoundException } from '@nestjs/common';
import { PostgresService } from '../db/postgres.service';

@Injectable()
export class ReportsService {
  constructor(private readonly db:PostgresService){}
  async summary(userId:string){
    const q=await this.db.pool.query('SELECT COUNT(*)::int total, COUNT(*) FILTER (WHERE status=\'queued\')::int queued, COUNT(*) FILTER (WHERE status=\'sent\')::int sent, COUNT(*) FILTER (WHERE status=\'delivered\')::int delivered, COUNT(*) FILTER (WHERE status=\'failed\')::int failed, COALESCE(SUM(cost),0)::numeric total_cost FROM "Message" WHERE "userId"=$1',[userId]);
    const b=await this.db.pool.query('SELECT username,balance FROM "User" WHERE id=$1',[userId]);
    if(!b.rowCount)throw new NotFoundException('User not found');
    return {...q.rows[0],username:b.rows[0].username,balance:b.rows[0].balance};
  }
  async batch(userId:string,id:string){
    const q=await this.db.pool.query('SELECT b.id,b."externalId",b.status,b."totalRecipients",b."validCount",b."invalidCount",COUNT(m.id)::int messages,COUNT(m.id) FILTER (WHERE m.status=\'queued\')::int queued,COUNT(m.id) FILTER (WHERE m.status=\'sent\')::int sent,COUNT(m.id) FILTER (WHERE m.status=\'delivered\')::int delivered,COUNT(m.id) FILTER (WHERE m.status=\'failed\')::int failed,COALESCE(SUM(m.cost),0)::numeric cost FROM "Batch" b LEFT JOIN "Message" m ON m."batchId"=b.id WHERE b."userId"=$1 AND (b.id=$2 OR b."externalId"=$2) GROUP BY b.id',[userId,id]);
    if(!q.rowCount)throw new NotFoundException('Batch not found');
    return q.rows[0];
  }
  async messages(userId:string,limit=50,offset=0,status?:string){
    const lim=Math.min(Math.max(limit,1),500), off=Math.max(offset,0);
    const params:any[]=[userId]; let where='WHERE "userId"=$1';
    if(status){params.push(status);where+=' AND status=
}+params.length;}
    params.push(lim,off);
    const q=await this.db.pool.query('SELECT "externalId",to,status,cost,parts,"gatewayMessageId","sentAt","deliveredAt","failedReason","createdAt" FROM "Message" '+where+' ORDER BY "createdAt" DESC LIMIT 
}+(params.length-1)+' OFFSET 
}+params.length,params);
    return {data:q.rows,limit:lim,offset:off,count:q.rowCount};
  }
}