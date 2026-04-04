import {
  Controller,
  Get,
  Query,
  Redirect,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { PlatformType, PlanTier } from '@prisma/client';
import { SallaTokenService } from './salla-token.service';

const SALLA_AUTH_URL = 'https://accounts.salla.sa/oauth2/auth';
const SALLA_TOKEN_URL = 'https://accounts.salla.sa/oauth2/token';
const SALLA_USER_URL = 'https://accounts.salla.sa/oauth2/user/info';

interface SallaUserInfo {
  data: {
    id: number;
    name: string;
    email: string;
    mobile?: string;
    merchant?: { id: number; username: string };
  };
}

interface CallbackQuery {
  code: string;
  state?: string;
}

interface TokenResponse {
  token: string;
}

@Controller('auth/salla')
export class SallaOauthController {
  private readonly logger = new Logger(SallaOauthController.name);
  private readonly clientId: string;
  private readonly clientSecret: string;
  private readonly appUrl: string;

  constructor(
    private readonly config: ConfigService,
    private readonly prisma: PrismaService,
    private readonly authService: AuthService,
    private readonly tokenService: SallaTokenService,
  ) {
    this.clientId = this.config.get<string>('SALLA_CLIENT_ID', '');
    this.clientSecret = this.config.get<string>('SALLA_CLIENT_SECRET', '');
    this.appUrl = this.config.get<string>('APP_URL', 'http://localhost:3000');
  }

  @Get('install')
  @Redirect()
  install(): { url: string } {
    const redirectUri = `${this.appUrl}/auth/salla/callback`;
    const params = new URLSearchParams({
      client_id: this.clientId,
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'offline_access',
    });
    return { url: `${SALLA_AUTH_URL}?${params.toString()}` };
  }

  @Get('callback')
  async callback(@Query() query: CallbackQuery): Promise<TokenResponse> {
    const { code } = query;
    const redirectUri = `${this.appUrl}/auth/salla/callback`;

    // Exchange code for tokens
    const tokenRes = await axios.post<{
      access_token: string;
      refresh_token: string;
      expires_in: number;
    }>(SALLA_TOKEN_URL, new URLSearchParams({
      grant_type: 'authorization_code',
      client_id: this.clientId,
      client_secret: this.clientSecret,
      redirect_uri: redirectUri,
      code,
    }).toString(), {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });

    const { access_token, refresh_token, expires_in } = tokenRes.data;
    const expiresAt = new Date(Date.now() + expires_in * 1000);

    // Fetch store info
    const userRes = await axios.get<SallaUserInfo>(SALLA_USER_URL, {
      headers: { Authorization: `Bearer ${access_token}` },
    });

    const user = userRes.data.data;
    const storeId = String(user.merchant?.id ?? user.id);

    const merchant = await this.prisma.merchant.upsert({
      where: { email: user.email },
      create: {
        name: user.name,
        email: user.email,
        phone: user.mobile,
        platformType: PlatformType.salla,
        platformStoreId: storeId,
        platformAccessToken: access_token,
        platformRefreshToken: refresh_token,
        tokenExpiresAt: expiresAt,
        planTier: PlanTier.basic,
      },
      update: {
        platformAccessToken: access_token,
        platformRefreshToken: refresh_token,
        tokenExpiresAt: expiresAt,
        needsReauth: false,
      },
    });

    this.logger.log(`Salla merchant installed: ${storeId} (${merchant.id})`);

    const jwt = this.authService.generateToken(
      merchant.id,
      PlatformType.salla,
      merchant.planTier,
    );
    return { token: jwt };
  }
}
