import { Controller, Get, Post, Delete, Patch, Body, Param, Req, UseGuards, UnauthorizedException, BadRequestException } from '@nestjs/common';
import crypto from 'crypto';
import { PostgresService } from '../db/postgres.service';
import { ApiKeyGuard } from './api-key.guard';

@Controller('api-keys')
@UseGuards(ApiKeyGuard)
export class ApiKeyController {
  constructor(private readonly db: PostgresService) {}

  private uid(req: any) {
    if (!req.userId) throw new UnauthorizedException();
    return String(req.userId);
  }

  @Get()
  async list(@Req() req: any) {
    const q = await this.db.pool.query(
      'SELECT id,"externalId",name,"lastUsedAt","lastIp","expiresAt",enabled,"allowedIps","createdAt" FROM "ApiKey" WHERE "userId"=$1 ORDER BY "createdAt" DESC',
      [this.uid(req)],
    );
    return q.rows;
  }

  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const raw = 'sk_' + crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const externalId = crypto.randomUUID();
    const name = String(body.name || 'API Key').slice(0, 100);
    const ips = this.normalizeIps(body.allowedIps);
    const expires = this.expiry(body.expiresAt);

    await this.db.pool.query(
      'INSERT INTO "ApiKey" ("externalId","userId",name,"keyHash",enabled,"allowedIps","expiresAt","createdAt") VALUES ($1,$2,$3,$4,true,$5,$6,NOW())',
      [externalId, this.uid(req), name, hash, ips, expires],
    );

    return { externalId, name, apiKey: raw, allowedIps: ips, expiresAt: expires };
  }

  @Patch(':id')
  async update(@Req() req: any, @Param('id') id: string, @Body() body: any) {
    const fields: string[] = [];
    const vals: any[] = [];

    if (body.allowedIps !== undefined) {
      fields.push('"allowedIps"=$' + (vals.length + 1));
      vals.push(this.normalizeIps(body.allowedIps));
    }

    if (body.expiresAt !== undefined) {
      fields.push('"expiresAt"=$' + (vals.length + 1));
      vals.push(this.expiry(body.expiresAt));
    }

    if (body.name !== undefined) {
      fields.push('name=$' + (vals.length + 1));
      vals.push(String(body.name).slice(0, 100));
    }

    if (!fields.length) throw new BadRequestException('No changes supplied');

    vals.push(id, this.uid(req));

    const q = await this.db.pool.query(
      'UPDATE "ApiKey" SET ' + fields.join(',') +
      ' WHERE id=$' + (vals.length - 1) +
      ' AND "userId"=$' + vals.length +
      ' RETURNING id,"externalId",name,"allowedIps","expiresAt",enabled',
      vals,
    );

    if (!q.rowCount) throw new UnauthorizedException('API key not found');
    return q.rows[0];
  }

  @Post(':id/rotate')
  async rotate(@Req() req: any, @Param('id') id: string) {
    const raw = 'sk_' + crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');

    const q = await this.db.pool.query(
      'UPDATE "ApiKey" SET "keyHash"=$1,"lastUsedAt"=NULL,"lastIp"=NULL WHERE id=$2 AND "userId"=$3 AND enabled=true RETURNING id,"externalId",name,"expiresAt","allowedIps"',
      [hash, id, this.uid(req)],
    );

    if (!q.rowCount) throw new UnauthorizedException('API key not found');
    return { ...q.rows[0], apiKey: raw };
  }

  @Delete(':id')
  async revoke(@Req() req: any, @Param('id') id: string) {
    const q = await this.db.pool.query(
      'UPDATE "ApiKey" SET enabled=false WHERE id=$1 AND "userId"=$2 RETURNING id,"externalId",name',
      [id, this.uid(req)],
    );

    if (!q.rowCount) throw new UnauthorizedException('API key not found');
    return { status: 'revoked', ...q.rows[0] };
  }

  private normalizeIps(v: any) {
    if (v === undefined || v === null) return [];
    if (!Array.isArray(v)) throw new BadRequestException('allowedIps must be an array');
    return [...new Set(v.map((x: any) => String(x).trim()).filter(Boolean))].slice(0, 50);
  }

  private expiry(v: any) {
    if (v === undefined || v === null || v === '') return null;
    const d = new Date(v);
    if (Number.isNaN(d.getTime()) || d <= new Date()) {
      throw new BadRequestException('expiresAt must be a future date');
    }
    return d.toISOString();
  }
}
