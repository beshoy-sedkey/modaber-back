import { Controller, Post, UseGuards, HttpCode } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SallaSyncService } from './salla-sync.service';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';

@ApiTags('Salla Sync')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('platform/salla')
export class SallaSyncController {
  constructor(private readonly syncService: SallaSyncService) {}

  @Post('sync')
  @HttpCode(200)
  @ApiOperation({ summary: 'Manually trigger Salla product sync' })
    async triggerSync(
      @CurrentMerchant() merchant: JwtPayload,
    ): Promise<{ success: boolean; synced: number }> {
      const result = await this.syncService.syncAllProducts(merchant.merchantId);
      return { success: true, synced: result.synced };
    }
}
