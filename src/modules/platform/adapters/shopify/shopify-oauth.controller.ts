import {
  Controller,
  Get,
  Query,
  Redirect,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { ShopifyAuthService } from './shopify-auth.service';
import { AuthService } from 'src/modules/auth/auth.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { PlatformType, PlanTier } from '@prisma/client';

interface InstallQuery {
  shop: string;
}

interface CallbackQuery {
  shop: string;
  code: string;
  hmac: string;
  state?: string;
  timestamp?: string;
  [key: string]: string | undefined;
}

interface TokenResponse {
  token: string;
}

@Controller('auth/shopify')
export class ShopifyOauthController {
  private readonly logger = new Logger(ShopifyOauthController.name);

  constructor(
    private readonly shopifyAuth: ShopifyAuthService,
    private readonly authService: AuthService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('install')
  @Redirect()
  install(@Query() query: InstallQuery): { url: string } {
    const { shop } = query;
    const url = this.shopifyAuth.buildInstallUrl(shop);
    return { url };
  }

  @Get('callback')
  async callback(@Query() query: CallbackQuery): Promise<TokenResponse> {
    const { shop, code, ...rest } = query;

    // Verify HMAC — build query record without undefined values
    const hmacQuery: Record<string, string> = {};
    for (const [k, v] of Object.entries(rest)) {
      if (v !== undefined) hmacQuery[k] = v;
    }
    hmacQuery['shop'] = shop;
    hmacQuery['code'] = code;

    const valid = this.shopifyAuth.verifyHmac(hmacQuery);
    if (!valid) {
      throw new UnauthorizedException('Invalid HMAC signature');
    }

    // Exchange code for token
    const tokenData = await this.shopifyAuth.exchangeCode(shop, code);

    // Upsert merchant
    const merchant = await this.prisma.merchant.upsert({
      where: { email: `shopify-${shop}` },
      create: {
        name: shop,
        email: `shopify-${shop}`,
        platformType: PlatformType.shopify,
        platformStoreId: shop,
        platformAccessToken: tokenData.access_token,
        planTier: PlanTier.basic,
      },
      update: {
        platformAccessToken: tokenData.access_token,
        needsReauth: false,
      },
    });

    this.logger.log(`Shopify merchant installed: ${shop} (${merchant.id})`);

    const jwt = this.authService.generateToken(
      merchant.id,
      PlatformType.shopify,
      merchant.planTier,
    );

    return { token: jwt };
  }
}
