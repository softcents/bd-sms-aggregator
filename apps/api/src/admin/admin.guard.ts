import { CanActivate,ExecutionContext,Injectable,ForbiddenException,UnauthorizedException } from '@nestjs/common';
import { PostgresService } from '../db/postgres.service';

@Injectable()
export class AdminGuard implements CanActivate{
  constructor(private readonly db:PostgresService){}
  async canActivate(ctx:ExecutionContext){
    const req=ctx.switchToHttp().getRequest();
    if(!req.userId)throw new UnauthorizedException();
    const q=await this.db.pool.query('SELECT role,status FROM "User" WHERE id=$1 LIMIT 1',[String(req.userId)]);
    if(!q.rowCount||q.rows[0].status!=='active')throw new UnauthorizedException('Account inactive');
    if(!['admin','super-admin'].includes(String(q.rows[0].role)))throw new ForbiddenException('Admin access required');
    return true;
  }
}