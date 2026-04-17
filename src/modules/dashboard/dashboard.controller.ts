import { Controller, Get, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';
import { DashboardService } from './dashboard.service';
import {
  SalesChartQueryDto,
  TopProductsQueryDto,
  RecentOrdersQueryDto,
} from './dto/dashboard-query.dto';

@ApiTags('Dashboard')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboardService: DashboardService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Get main KPIs for the merchant dashboard' })
  async getOverview(@CurrentMerchant() merchant: JwtPayload) {
    const data = await this.dashboardService.getOverview(merchant.merchantId);
    return { success: true, data };
  }

  @Get('sales-chart')
  @ApiOperation({ summary: 'Get daily revenue for chart (7d, 30d, 90d)' })
  @ApiQuery({ name: 'period', required: false, enum: ['7d', '30d', '90d'] })
  async getSalesChart(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: SalesChartQueryDto,
  ) {
    const data = await this.dashboardService.getSalesChart(
      merchant.merchantId,
      query.period ?? '30d',
    );
    return { success: true, data };
  }

  @Get('top-products')
  @ApiOperation({ summary: 'Get top selling products by revenue' })
  @ApiQuery({ name: 'limit', required: false })
  async getTopProducts(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: TopProductsQueryDto,
  ) {
    const data = await this.dashboardService.getTopProducts(
      merchant.merchantId,
      query.limit ?? 5,
    );
    return { success: true, data };
  }

  @Get('recent-orders')
  @ApiOperation({ summary: 'Get most recent orders with customer info' })
  @ApiQuery({ name: 'limit', required: false })
  async getRecentOrders(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: RecentOrdersQueryDto,
  ) {
    const data = await this.dashboardService.getRecentOrders(
      merchant.merchantId,
      query.limit ?? 10,
    );
    return { success: true, data };
  }

  @Get('order-status-breakdown')
  @ApiOperation({ summary: 'Get order counts per status' })
  async getOrderStatusBreakdown(@CurrentMerchant() merchant: JwtPayload) {
    const data = await this.dashboardService.getOrderStatusBreakdown(merchant.merchantId);
    return { success: true, data };
  }
}
