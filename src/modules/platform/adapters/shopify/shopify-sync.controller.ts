import { Controller, Post, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { ShopifySyncService } from './shopify-sync.service';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';

@ApiTags('Shopify Sync')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('platform/shopify')
export class ShopifySyncController {
  constructor(private readonly syncService: ShopifySyncService) {}

  @Post('sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Manually trigger Shopify product sync' })
  async triggerSync(
    @CurrentMerchant() merchant: JwtPayload,
  ): Promise<{ success: boolean; synced: number }> {
    const result = await this.syncService.syncAllProducts(merchant.merchantId);
    return { success: true, synced: result.synced };
  }
}
