import { Injectable, BadRequestException } from '@nestjs/common';
import { PrismaClient, Prisma } from '@prisma/client';
@Injectable()
export class BillingService {
  private db=new PrismaClient();
  async debit(userId: bigint, amount: Prisma.Decimal, description: string) {
    if (amount.lessThanOrEqualTo(0)) throw new BadRequestException('Invalid debit amount');
    return this.db.$transaction(async tx=>{
      const user=await tx.user.findUnique({where:{id:userId}});
      if(!user || user.status!=='active') throw new BadRequestException('Customer inactive');
      const before=new Prisma.Decimal(user.balance);
      if(before.lessThan(amount)) throw new BadRequestException('Insufficient balance');
      const after=before.minus(amount);
      const updated=await tx.user.update({where:{id:userId},data:{balance:after}});
      await tx.transaction.create({data:{userId,amount,direction:'debit',balanceBefore:before,balanceAfter:after,description}});
      return updated;
    },{isolationLevel:'Serializable'});
  }
}