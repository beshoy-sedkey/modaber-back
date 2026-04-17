import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';
import { ReportsService } from './reports.service';
import { ReportQueryDto } from './dto/report-query.dto';

@ApiTags('Reports')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('reports')
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

  @Get('sales')
  @ApiOperation({ summary: 'Daily revenue breakdown for a date range' })
  async getSalesReport(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: ReportQueryDto,
  ) {
    const data = await this.reportsService.getSalesReport(
      merchant.merchantId,
      query.from,
      query.to,
    );
    return { success: true, data };
  }

  @Get('orders')
  @ApiOperation({ summary: 'Order stats with optional status filter' })
  async getOrdersReport(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: ReportQueryDto,
  ) {
    const data = await this.reportsService.getOrdersReport(
      merchant.merchantId,
      query.from,
      query.to,
      query.status,
    );
    return { success: true, data };
  }

  @Get('shipping')
  @ApiOperation({ summary: 'Shipment stats per carrier and status' })
  async getShippingReport(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: ReportQueryDto,
  ) {
    const data = await this.reportsService.getShippingReport(
      merchant.merchantId,
      query.from,
      query.to,
    );
    return { success: true, data };
  }

  @Get('stock')
  @ApiOperation({ summary: 'Current inventory snapshot with low stock alerts' })
  async getStockReport(@CurrentMerchant() merchant: JwtPayload) {
    const data = await this.reportsService.getStockReport(merchant.merchantId);
    return { success: true, data };
  }

  @Get('ai-usage')
  @ApiOperation({ summary: 'AI conversation and message usage stats' })
  async getAiUsageReport(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: ReportQueryDto,
  ) {
    const data = await this.reportsService.getAiUsageReport(
      merchant.merchantId,
      query.from,
      query.to,
    );
    return { success: true, data };
  }
}
