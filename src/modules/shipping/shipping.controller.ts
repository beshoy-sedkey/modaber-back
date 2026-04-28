import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiQuery,
  ApiTags,
} from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';
import { ShippingService } from './shipping.service';
import { CreateCarrierDto } from './dto/create-carrier.dto';
import { UpdateCarrierDto } from './dto/update-carrier.dto';
import { UpdateShipmentDto } from './dto/update-shipment.dto';
import { AssignShipmentDto } from './dto/assign-shipment.dto';

interface PaginationQuery {
  page?: string;
  limit?: string;
}

@ApiTags('Shipping')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('shipping')
export class ShippingController {
  constructor(private readonly shippingService: ShippingService) {}

  // ── Carriers ──────────────────────────────────────────────────────────────

  @Get('carriers')
  @ApiOperation({ summary: 'List all carriers for the merchant' })
  async listCarriers(@CurrentMerchant() merchant: JwtPayload) {
    const data = await this.shippingService.listCarriers(merchant.merchantId);
    return { success: true, data };
  }

  @Post('carriers')
  @ApiOperation({ summary: 'Add a carrier for the merchant' })
  async createCarrier(
    @CurrentMerchant() merchant: JwtPayload,
    @Body() dto: CreateCarrierDto,
  ) {
    const data = await this.shippingService.createCarrier(
      merchant.merchantId,
      dto,
    );
    return { success: true, data, message: 'Carrier created successfully' };
  }

  @Put('carriers/:id')
  @ApiOperation({ summary: 'Update carrier configuration' })
  async updateCarrier(
    @CurrentMerchant() merchant: JwtPayload,
    @Param('id') carrierId: string,
    @Body() dto: UpdateCarrierDto,
  ) {
    const data = await this.shippingService.updateCarrier(
      merchant.merchantId,
      carrierId,
      dto,
    );
    return { success: true, data, message: 'Carrier updated successfully' };
  }

  @Delete('carriers/:id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Remove a carrier' })
  async deleteCarrier(
    @CurrentMerchant() merchant: JwtPayload,
    @Param('id') carrierId: string,
  ) {
    await this.shippingService.deleteCarrier(merchant.merchantId, carrierId);
    return { success: true, data: null, message: 'Carrier deleted successfully' };
  }

  // ── Shipments ─────────────────────────────────────────────────────────────

  @Get('shipments')
  @ApiOperation({ summary: 'List shipments (paginated)' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  async listShipments(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: PaginationQuery,
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 20));

    const result = await this.shippingService.listShipments(
      merchant.merchantId,
      page,
      limit,
    );

    return {
      success: true,
      data: result.shipments,
      meta: { page: result.page, limit: result.limit, total: result.total },
    };
  }

  @Get('shipments/:id')
  @ApiOperation({ summary: 'Get a single shipment by ID' })
  async getShipment(
    @CurrentMerchant() merchant: JwtPayload,
    @Param('id') shipmentId: string,
  ) {
    const data = await this.shippingService.getShipment(
      merchant.merchantId,
      shipmentId,
    );
    return { success: true, data };
  }

  @Post('shipments/:orderId/assign')
  @ApiOperation({ summary: 'Auto-assign best carrier to an order' })
  async assignCarrier(
    @CurrentMerchant() merchant: JwtPayload,
    @Param('orderId') orderId: string,
    @Body() _dto: AssignShipmentDto,
  ) {
    const data = await this.shippingService.assignCarrier(
      merchant.merchantId,
      orderId,
    );
    return { success: true, data, message: 'Carrier assigned successfully' };
  }

  @Put('shipments/:id')
  @ApiOperation({ summary: 'Update shipment tracking number, status, etc.' })
  async updateShipment(
    @CurrentMerchant() merchant: JwtPayload,
    @Param('id') shipmentId: string,
    @Body() dto: UpdateShipmentDto,
  ) {
    const data = await this.shippingService.updateShipment(
      merchant.merchantId,
      shipmentId,
      dto,
    );
    return { success: true, data, message: 'Shipment updated successfully' };
  }
}
