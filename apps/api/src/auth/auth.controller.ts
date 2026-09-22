import { Controller, Get, Req, UseGuards } from '@nestjs/common';
import { ApiKeyGuard } from './api-key.guard';
import { PrismaService } from '../prisma.service';

@Controller('auth')
export class AuthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('me')
  @UseGuards(ApiKeyGuard)
  async me(@Req() request: { userId: bigint }) {
    const user = await this.prisma.user.findUnique({
      where: { id: request.userId },
      select: {
        id: true,
        username: true,
        name: true,
        email: true,
        role: true,
        status: true,
        balance: true,
      },
    });

    return user;
  }
}
