import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { Prisma, Decimal } from '@prisma/client';
import { PrismaService } from '../prisma.service';
import { QueueService } from '../queue/queue.service';
import { TariffsService } from '../tariffs/tariffs.service';

export interface SendSmsInput {
  sender: string;
  recipients: string[];
  message: string;
  idempotencyKey?: string;
}

@Injectable()
export class SmsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly queue: QueueService,
    private readonly tariffs: TariffsService,
  ) {}

  async send(userId: bigint, input: SendSmsInput) {
    const sender = input.sender?.trim();
    const message = input.message?.trim();

    if (!sender || !message || !Array.isArray(input.recipients) || input.recipients.length === 0) {
      throw new BadRequestException('sender, recipients and message are required');
    }
    if (input.recipients.length > 1000) {
      throw new BadRequestException('Maximum 1000 recipients per request');
    }

    const senderRecord = await this.prisma.sender.findFirst({
      where: { userId, sender, enabled: true },
    });
    if (!senderRecord) throw new NotFoundException('Sender is not registered or disabled');

    const normalized = input.recipients.map((value) => this.normalizeBangladeshMsisdn(value));
    if (normalized.some((value) => value === null)) {
      throw new BadRequestException('Only valid Bangladesh mobile numbers are accepted');
    }

    const recipients = normalized as string[];
    const unicode = /[^\x00-\x7F]/.test(message);
    const singleLimit = unicode ? 70 : 160;
    const multiLimit = unicode ? 67 : 153;
    const parts = message.length <= singleLimit ? 1 : Math.ceil(message.length / multiLimit);

    const pricing = await Promise.all(
      recipients.map(async (recipient) => {
        const resolved = await this.tariffs.resolve(userId, recipient, parts);
        if (!resolved) throw new BadRequestException(`No active tariff found for recipient ${recipient}`);
        return { recipient, rate: resolved.rate, cost: resolved.cost };
      }),
    );

    const totalCost = pricing.reduce((sum, item) => sum.add(item.cost), new Decimal(0));

    let created = false;
    let result: Awaited<ReturnType<PrismaService['batch']['findFirstOrThrow']>>;

    try {
      result = await this.prisma.$transaction(async (tx: Prisma.TransactionClient) => {
        if (input.idempotencyKey) {
          const existing = await tx.batch.findFirst({
            where: { userId, idempotencyKey: input.idempotencyKey },
          });
          if (existing) return existing;
        }

        const batch = await tx.batch.create({
          data: {
            externalId: randomUUID(),
            userId,
            idempotencyKey: input.idempotencyKey,
            status: 'queued',
            total: recipients.length,
            queued: recipients.length,
            totalCost,
          },
        });

        const debit = await tx.user.updateMany({
          where: { id: userId, status: 'active', balance: { gte: totalCost } },
          data: { balance: { decrement: totalCost } },
        });

        if (debit.count !== 1) throw new BadRequestException('Insufficient balance');

        await tx.message.createMany({
          data: pricing.map((item) => ({
            externalId: randomUUID(),
            userId,
            batchId: batch.id,
            sender,
            recipient: item.recipient,
            body: message,
            status: 'queued',
            parts,
            rate: item.rate,
            cost: item.cost,
          })),
        });

        const updatedUser = await tx.user.findUniqueOrThrow({
          where: { id: userId },
          select: { balance: true },
        });

        await tx.transaction.create({
          data: {
            userId,
            direction: 'debit',
            amount: totalCost,
            reference: `sms:${batch.externalId}`,
            balance: updatedUser.balance,
            meta: { type: 'sms_debit', batchId: batch.externalId, recipients: recipients.length, parts },
          },
        });

        created = true;
        return batch;
      }, { isolationLevel: 'ReadCommitted' });
    } catch (error) {
      if (input.idempotencyKey && typeof error === 'object' && error !== null && 'code' in error && (error as { code?: string }).code === 'P2002') {
        result = await this.prisma.batch.findFirstOrThrow({
          where: { userId, idempotencyKey: input.idempotencyKey },
        });
      } else {
        throw error;
      }
    }

    const messages = await this.prisma.message.findMany({
      where: { batchId: result.id },
      select: { id: true, externalId: true, sender: true, recipient: true, body: true, parts: true },
    });

    if (created) {
      for (const item of messages) {
        await this.queue.publishInfozillion({
          messageId: item.id.toString(),
          externalId: item.externalId,
          userId: userId.toString(),
          sender: item.sender,
          recipient: item.recipient,
          body: item.body,
          parts: item.parts,
        });
      }
    }

    return {
      batchId: result.externalId,
      status: result.status,
      total: result.total,
      totalCost: result.totalCost.toString(),
      messageIds: messages.map((item: { externalId: string }) => item.externalId),
    };
  }

  private normalizeBangladeshMsisdn(value: string): string | null {
    let n = value.trim().replace(/[\s()-]/g, '');
    if (n.startsWith('+')) n = n.slice(1);
    if (n.startsWith('00880')) n = n.slice(2);
    if (n.startsWith('880')) return /^8801[3-9]\d{8}$/.test(n) ? n : null;
    if (/^01[3-9]\d{8}$/.test(n)) return '88' + n;
    return null;
  }
}
