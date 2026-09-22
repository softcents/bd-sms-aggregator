import 'dotenv/config';
import amqp, { ChannelWrapper } from 'amqp-connection-manager';
import type { ConfirmChannel, ConsumeMessage } from 'amqplib';
import { PrismaClient } from '@bd-sms/db';

type SmsJob = {
  messageId: string;
  externalId: string;
  userId: string;
  sender: string;
  recipient: string;
  body: string;
  parts: number;
};

const prisma = new PrismaClient();
const connection = amqp.connect([
  process.env.RABBITMQ_URL || 'amqp://sms:sms@rabbitmq:5672',
]);

const channel: ChannelWrapper = connection.createChannel({
  setup: async (ch: ConfirmChannel) => {
    await ch.assertExchange('sms', 'topic', { durable: true });
    await ch.assertQueue('sms.infozillion', {
      durable: true,
      arguments: { 'x-queue-type': 'quorum' },
    });
    await ch.bindQueue('sms.infozillion', 'sms', 'send.infozillion');
    await ch.prefetch(Number(process.env.WORKER_PREFETCH || 20));
  },
});

async function sendToInfozillion(job: SmsJob) {
  const baseUrl = (process.env.INFOZILLION_BASE_URL || 'https://api.mnpspbd.com').replace(/\/+$/, '');
  const apiType = (process.env.INFOZILLION_API_TYPE || 'iptsp').toLowerCase();
  const endpoint = apiType === 'iptsp'
    ? '/a2p-sms-iptsp/api/v1/send-sms'
    : '/a2p-sms/api/v1/send-sms';

  const cli = job.sender.trim();
  const digits = cli.replace(/\D+/g, '');
  const numericCli = cli !== '' && digits !== '' && !/[a-zA-Z]/.test(cli);
  let normalizedCli = cli;
  let billMsisdn = (process.env.INFOZILLION_BILL_MSISDN || '').trim();

  if (numericCli) {
    normalizedCli = digits.startsWith('0')
      ? '880' + digits.slice(1)
      : digits.startsWith('880') ? digits : '880' + digits;
    billMsisdn = normalizedCli;
  }

  const unicode = /[^\x00-\x7F]/.test(job.body);
  const payload: Record<string, unknown> = {
    username: process.env.INFOZILLION_USERNAME || '',
    password: process.env.INFOZILLION_PASSWORD || '',
    billMsisdn,
    apiKey: process.env.INFOZILLION_API_KEY || '',
    cli: normalizedCli,
    msisdnList: [job.recipient.replace(/^\+/, '')],
    transactionType: 'T',
    messageType: unicode ? '3' : (process.env.INFOZILLION_MESSAGE_TYPE || '1'),
    isLongSMS: job.parts > 1,
    message: job.body,
  };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), Number(process.env.INFOZILLION_TIMEOUT_MS || 10000));

  try {
    const response = await fetch(baseUrl + endpoint, {
      method: 'POST',
      headers: { 'content-type': 'application/json', accept: 'application/json' },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const data = await response.json().catch(() => ({})) as Record<string, unknown>;
    const success = response.ok && String(data.serverResponseCode ?? '') === '9000';

    if (!success) {
      throw new Error(String(data.serverResponseMessage || ('HTTP ' + response.status)));
    }

    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function processMessage(message: ConsumeMessage): Promise<void> {
  const job = JSON.parse(message.content.toString()) as SmsJob;
  const id = BigInt(job.messageId);

  await prisma.message.update({ where: { id }, data: { status: 'sending' } });

  try {
    const report = await sendToInfozillion(job);
    const gatewayMessageId = String(report.serverTxnId || '');
    const stored = await prisma.message.findUnique({ where: { id }, select: { batchId: true } });

    await prisma.message.update({
      where: { id },
      data: {
        status: 'sent',
        gatewayMessageId: gatewayMessageId || null,
        sentAt: new Date(),
        infozillionReport: report as object,
      },
    });

    if (stored?.batchId) {
      await prisma.batch.update({
        where: { id: stored.batchId },
        data: { sent: { increment: 1 }, queued: { decrement: 1 } },
      });
    }

    channel.ack(message);
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    const stored = await prisma.message.findUnique({ where: { id }, select: { batchId: true } });

    await prisma.message.update({
      where: { id },
      data: { status: 'failed', failedReason: reason, failedAt: new Date() },
    });

    if (stored?.batchId) {
      await prisma.batch.update({
        where: { id: stored.batchId },
        data: { failed: { increment: 1 }, queued: { decrement: 1 } },
      });
    }

    channel.ack(message);
  }
}


async function pollDeliveryReports(): Promise<void> {
  const due = await prisma.message.findMany({
    where: {
      status: 'sent',
      gatewayMessageId: { not: null },
      OR: [{ nextPollAt: null }, { nextPollAt: { lte: new Date() } }],
    },
    orderBy: { createdAt: 'asc' },
    take: Number(process.env.DLR_BATCH_SIZE || 50),
    select: {
      id: true,
      batchId: true,
      gatewayMessageId: true,
      recipient: true,
      pollAttempts: true,
    },
  });

  for (const item of due) {
    if (!item.gatewayMessageId) continue;

    const baseUrl = (process.env.INFOZILLION_BASE_URL || 'https://api.mnpspbd.com').replace(/\/+$/, '');
    const apiType = (process.env.INFOZILLION_API_TYPE || 'iptsp').toLowerCase();
    const endpoint = apiType === 'iptsp'
      ? '/a2p-proxy-api-iptsp/api/v1/check-delivery-report'
      : '/a2p-proxy-api/api/v1/check-delivery-report';

    try {
      const response = await fetch(baseUrl + endpoint, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json' },
        body: JSON.stringify({
          username: process.env.INFOZILLION_USERNAME || '',
          password: process.env.INFOZILLION_PASSWORD || '',
          billMsisdn: process.env.INFOZILLION_BILL_MSISDN || '',
          apiKey: process.env.INFOZILLION_API_KEY || '',
          msisdnList: [item.recipient.replace(/^\+/, '')],
          serverReference: item.gatewayMessageId,
        }),
        signal: AbortSignal.timeout(Number(process.env.INFOZILLION_DLR_TIMEOUT_MS || 10000)),
      });

      const data = await response.json().catch(() => ({})) as Record<string, unknown>;
      if (!response.ok || String(data.serverResponseCode ?? '') !== '9000') {
        throw new Error(String(data.serverResponseMessage || ('HTTP ' + response.status)));
      }

      const dnd = Array.isArray(data.dndMsisdn) && data.dndMsisdn.length > 0;
      const invalid = Array.isArray(data.invalidMsisdn) && data.invalidMsisdn.length > 0;
      const statuses = Array.isArray(data.deliveryStatus) ? data.deliveryStatus : [];
      const rawStatus = String(statuses[0] ?? data.a2pDeliveryStatus ?? '');
      const normalized = rawStatus.includes('-')
        ? rawStatus.split('-', 2)[1].trim().toLowerCase()
        : rawStatus.trim().toLowerCase();

      const delivered = !dnd && !invalid && normalized === 'delivered';
      const failed = dnd || invalid || normalized === 'failed' || normalized === 'undelivered'
        || normalized.includes('failure');

      const current = await prisma.message.findUnique({
        where: { id: item.id },
        select: { status: true, batchId: true },
      });
      if (!current || current.status !== 'sent') continue;

      if (delivered || failed) {
        const nextStatus = delivered ? 'delivered' : 'failed';
        const reason = dnd
          ? 'Recipient filtered due to DND enlistment'
          : invalid
            ? 'Invalid MSISDN prefix or format'
            : failed ? 'SMS delivery failed' : null;

        await prisma.message.update({
          where: { id: item.id },
          data: {
            status: nextStatus,
            deliveredAt: delivered ? new Date() : null,
            failedAt: failed ? new Date() : null,
            failedReason: reason,
            pollAttempts: { increment: 1 },
            nextPollAt: null,
            infozillionReport: data as object,
          },
        });

        if (current.batchId) {
          await prisma.batch.update({
            where: { id: current.batchId },
            data: delivered
              ? { delivered: { increment: 1 } }
              : { failed: { increment: 1 } },
          });
        }
      } else {
        const attempts = item.pollAttempts + 1;
        const maxAttempts = Number(process.env.DLR_MAX_ATTEMPTS || 20);
        const expired = attempts >= maxAttempts;

        await prisma.message.update({
          where: { id: item.id },
          data: {
            status: expired ? 'failed' : 'sent',
            failedAt: expired ? new Date() : null,
            failedReason: expired ? 'DLR polling timeout' : null,
            pollAttempts: attempts,
            nextPollAt: expired ? null : new Date(Date.now() + Math.min(300000, 15000 * Math.pow(2, Math.min(attempts, 5)))),
            infozillionReport: data as object,
          },
        });

        if (expired && current.batchId) {
          await prisma.batch.update({
            where: { id: current.batchId },
            data: { failed: { increment: 1 } },
          });
        }
      }
    } catch (error) {
      console.error('DLR polling error', item.id.toString(), error);
      await prisma.message.update({
        where: { id: item.id },
        data: {
          pollAttempts: { increment: 1 },
          nextPollAt: new Date(Date.now() + 30000),
        },
      }).catch(() => undefined);
    }
  }
}

let dlrInterval: NodeJS.Timeout | undefined;

async function main() {
  await prisma.$connect();
  await channel.waitForConnect();
  console.log('InfoZillion worker ready');
  dlrInterval = setInterval(() => { pollDeliveryReports().catch((error) => console.error('DLR poller error', error)); }, Number(process.env.DLR_POLL_INTERVAL_MS || 30000));

  await channel.consume('sms.infozillion', async (message: ConsumeMessage | null) => {
    if (!message) return;
    try {
      await processMessage(message);
    } catch (error) {
      console.error('SMS worker processing error', error);
      channel.nack(message, false, false);
    }
  });
}

async function shutdown() {
  if (dlrInterval) clearInterval(dlrInterval);
  await channel.close();
  await connection.close();
  await prisma.$disconnect();
  process.exit(0);
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});
