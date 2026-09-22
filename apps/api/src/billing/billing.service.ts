import { Injectable, BadRequestException } from '@nestjs/common';
import Decimal from 'decimal.js';
import { PostgresService } from '../db/postgres.service';

@Injectable()
export class BillingService {
  constructor(private readonly db:PostgresService){}

  async calculateAndDebit(userId:bigint, rate:Decimal, parts:number, description:string){
    const amount=rate.mul(parts);
    if(amount.lte(0))throw new BadRequestException('Invalid SMS cost');
    return this.db.tx(async c=>{
      const u=await c.query('SELECT id,status,balance FROM "User" WHERE id=$1 FOR UPDATE',[userId.toString()]);
      if(!u.rowCount||u.rows[0].status!=='active')throw new BadRequestException('Customer inactive');
      const before=new Decimal(String(u.rows[0].balance));
      if(before.lt(amount))throw new BadRequestException('Insufficient balance');
      const after=before.minus(amount);
      await c.query('UPDATE "User" SET balance=$1,"updatedAt"=NOW() WHERE id=$2',[after.toFixed(6),userId.toString()]);
      await c.query('INSERT INTO "Transaction" ("userId",amount,direction,"balanceBefore","balanceAfter",description,"createdAt") VALUES ($1,$2,$3,$4,$5,$6,NOW())',[userId.toString(),amount.toFixed(6),'debit',before.toFixed(6),after.toFixed(6),description]);
      return {amount,before,after};
    });
  }
}