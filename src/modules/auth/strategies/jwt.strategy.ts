import { Injectable } from '@nestjs/common';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { PlatformType, PlanTier } from '@prisma/client';

export interface JwtPayload {
  merchantId: string;
  platformType: PlatformType;
  planTier: PlanTier;
  sub: string;
  iat: number;
  exp: number;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor() {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      ignoreExpiration: false,
      secretOrKey: process.env['JWT_SECRET'] ?? 'fallback-secret',
    });
  }

  async validate(payload: JwtPayload): Promise<JwtPayload> {
    return {
      merchantId: payload.merchantId,
      platformType: payload.platformType,
      planTier: payload.planTier,
      sub: payload.sub,
      iat: payload.iat,
      exp: payload.exp,
    };
  }
}
