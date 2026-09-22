import { CanActivate, ExecutionContext, Injectable, TooManyRequestsException } from '@nestjs/common';
import Redis from 'ioredis';

@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly redis = new Redis(process.env.REDIS_URL || 'redis://redis:6379');
  private readonly windowSeconds = Number(process.env.API_RATE_WINDOW_SECONDS || 1);
  private readonly maxRequests = Number(process.env.API_RATE_LIMIT || 30);

  async canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest();
    const identity = String(req.userId || req.headers['x-api-key'] || req.ip || 'unknown');
    const bucket = Math.floor(Date.now() / (this.windowSeconds * 1000));
    const key = `ratelimit:sms:${identity}:${bucket}`;
    const count = await this.redis.incr(key);
    if (count === 1) await this.redis.expire(key, this.windowSeconds + 1);
    if (count > this.maxRequests) throw new TooManyRequestsException('Rate limit exceeded');
    return true;
  }
}
