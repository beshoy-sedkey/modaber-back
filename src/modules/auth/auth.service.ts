import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { PlatformType, PlanTier } from '@prisma/client';

interface TokenPayload {
  merchantId: string;
  platformType: PlatformType;
  planTier: PlanTier;
  sub: string;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly jwtService: JwtService,
    private readonly prisma: PrismaService,
  ) {}

  generateToken(
    merchantId: string,
    platformType: PlatformType,
    planTier: PlanTier,
  ): string {
    const payload: TokenPayload = {
      merchantId,
      platformType,
      planTier,
      sub: merchantId,
    };

    return this.jwtService.sign(payload);
  }

  async validateMerchant(merchantId: string): Promise<boolean> {
    const merchant = await this.prisma.merchant.findUnique({
      where: { id: merchantId },
    });

    return merchant !== null && merchant.isActive;
  }
}
