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

async function main() {
  await prisma.$connect();
  await channel.waitForConnect();
  console.log('InfoZillion worker ready');

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
