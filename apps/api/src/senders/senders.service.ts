import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma.service';
@Injectable()
export class SendersService {
  constructor(private readonly prisma: PrismaService) {}
  async list(userId: bigint) {
    return this.prisma.sender.findMany({ where:{ userId }, orderBy:{ createdAt:'desc' }, select:{ id:true, sender:true, enabled:true, createdAt:true } });
  }
  async create(userId: bigint, sender: string) {
    const value = sender?.trim();
    if (!value || value.length > 20) throw new BadRequestException('Sender is required and must be 1-20 characters');
    if (!/^[A-Za-z0-9 ._-]+$/.test(value)) throw new BadRequestException('Sender contains unsupported characters');
    const existing = await this.prisma.sender.findUnique({ where:{ userId_sender:{ userId, sender:value } } });
    if (existing) throw new BadRequestException('Sender already exists');
    return this.prisma.sender.create({ data:{ userId, sender:value }, select:{ id:true, sender:true, enabled:true, createdAt:true } });
  }
  async disable(userId: bigint, id: bigint) {
    const result = await this.prisma.sender.updateMany({ where:{ id, userId }, data:{ enabled:false } });
    if (!result.count) throw new NotFoundException('Sender not found');
    return { success:true };
  }
}
