import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class TariffsService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: bigint) {
    return this.prisma.tariffPlan.findMany({ where:{active:true}, include:{rates:{include:{operator:true}}}, orderBy:{name:'asc'} });
  }
  async resolve(userId: bigint, recipient: string, parts: number) {
    const n=recipient.replace(/^\+/, '');
    const operator=await this.prisma.operator.findFirst({ where:{prefixes:{some:{prefix:{in:[n.slice(0,5),n.slice(0,4),n.slice(0,3)]}}}} });
    if(!operator) return null;
    const plan=await this.prisma.tariffPlan.findFirst({where:{active:true},orderBy:{id:'asc'},include:{rates:{where:{operatorId:operator.id}}}});
    const rate=plan?.rates[0]?.rate ?? null;
    return rate===null?null:{operatorId:operator.id,operator:operator.code,rate,cost:rate.mul(parts)};
  }
}
