import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { OrderStatus } from '@prisma/client';

interface OrdersQuery {
  page?: string;
  limit?: string;
  status?: OrderStatus;
}

@ApiTags('Orders')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('orders')
export class OrdersController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all orders for the merchant' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'status', required: false, enum: OrderStatus })
  async findAll(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: OrdersQuery,
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      merchantId: merchant.merchantId,
      ...(query.status ? { status: query.status } : {}),
    };

    const [orders, total] = await Promise.all([
      this.prisma.order.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          customer: { select: { name: true, phone: true, email: true } },
          items: { include: { product: { select: { name: true } } } },
        },
      }),
      this.prisma.order.count({ where }),
    ]);

    return { success: true, data: orders, meta: { page, limit, total } };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single order by ID' })
  async findOne(
    @CurrentMerchant() merchant: JwtPayload,
    @Param('id') id: string,
  ) {
    const order = await this.prisma.order.findFirst({
      where: { id, merchantId: merchant.merchantId },
      include: {
        customer: true,
        items: { include: { product: true } },
        shipment: true,
      },
    });
    return { success: true, data: order };
  }
}
