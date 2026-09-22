import { CanActivate, ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../prisma.service';

@Injectable()
export class ApiKeyGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const header = request.headers.authorization;
    if (!header?.startsWith('Bearer ')) throw new UnauthorizedException('API key is required');

    const rawKey = header.slice(7).trim();
    if (!rawKey) throw new UnauthorizedException('API key is required');

    const keyHash = createHash('sha256').update(rawKey).digest('hex');
    const apiKey = await this.prisma.apiKey.findUnique({ where: { keyHash } });

    if (!apiKey || !apiKey.enabled) throw new UnauthorizedException('Invalid API key');
    if (apiKey.expiresAt && apiKey.expiresAt <= new Date()) throw new UnauthorizedException('API key expired');

    const ip = request.ip || request.socket?.remoteAddress || null;
    if (apiKey.allowedIps.length > 0 && ip && !apiKey.allowedIps.includes(ip)) {
      throw new UnauthorizedException('IP address is not allowed');
    }

    await this.prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastIp: ip, lastUsedAt: new Date() },
    });

    request.userId = apiKey.userId;
    request.apiKeyId = apiKey.id;
    return true;
  }
}
