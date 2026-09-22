import { Body, Controller, Post, BadRequestException, UnauthorizedException } from '@nestjs/common';
import crypto from 'crypto';
import { PostgresService } from '../db/postgres.service';
import { verifyPassword } from './password';

@Controller('auth')
export class AuthController {
  constructor(private readonly db: PostgresService) {}

  @Post('login')
  async login(@Body() body: any) {
    const username = String(body.username || '').trim();
    const password = String(body.password || '');
    if (!username || !password) {
      throw new BadRequestException('Username and password are required');
    }

    const q = await this.db.pool.query(
      'SELECT id,username,"passwordHash",status FROM "User" WHERE username=$1 LIMIT 1',
      [username],
    );

    const user = q.rows[0];
    if (!q.rowCount || user.status !== 'active' || !user.passwordHash || !verifyPassword(password, user.passwordHash)) {
      throw new UnauthorizedException('Invalid username or password');
    }

    const raw = 'sk_' + crypto.randomBytes(32).toString('hex');
    const hash = crypto.createHash('sha256').update(raw).digest('hex');
    const externalId = crypto.randomUUID();

    await this.db.pool.query(
      'INSERT INTO "ApiKey" ("externalId","userId",name,"keyHash",enabled,"createdAt") VALUES ($1,$2,$3,$4,true,NOW())',
      [externalId, user.id, body.keyName || 'Web Dashboard', hash],
    );

    return { username: user.username, userId: String(user.id), apiKey: raw };
  }
}