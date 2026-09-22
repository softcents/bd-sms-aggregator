import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class BillingService {
  constructor(private readonly prisma: PrismaService) {}
  async balance(userId: bigint) {
    const user = await this.prisma.user.findUnique({ where:{ id:userId }, select:{ balance:true, status:true } });
    return user;
  }
  async transactions(userId: bigint, limit=50) {
    const take = Math.min(Math.max(Number(limit)||50,1),100);
    return this.prisma.transaction.findMany({ where:{ userId }, orderBy:{ createdAt:'desc' }, take });
  }
}
