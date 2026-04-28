import {
  Controller,
  Post,
  Param,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';
import { OrderConfirmationService } from './order-confirmation.service';
import { ManualConfirmDto } from './dto/manual-confirm.dto';

@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrderConfirmationController {
  constructor(private readonly orderConfirmationService: OrderConfirmationService) {}

  @Post(':id/confirm')
  @HttpCode(HttpStatus.OK)
  async manualConfirm(
    @Param('id') orderId: string,
    @CurrentMerchant() merchant: JwtPayload,
    @Body() dto: ManualConfirmDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.orderConfirmationService.manualConfirm(merchant.merchantId, orderId, dto.notes);
    return { success: true, message: 'Order confirmed successfully' };
  }

  @Post(':id/flag')
  @HttpCode(HttpStatus.OK)
  async manualFlag(
    @Param('id') orderId: string,
    @CurrentMerchant() merchant: JwtPayload,
    @Body() dto: ManualConfirmDto,
  ): Promise<{ success: boolean; message: string }> {
    await this.orderConfirmationService.manualFlag(merchant.merchantId, orderId, dto.notes);
    return { success: true, message: 'Order flagged for review' };
  }

}

