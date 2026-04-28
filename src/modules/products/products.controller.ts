import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from 'src/shared/guards/jwt-auth.guard';
import { CurrentMerchant } from 'src/shared/decorators/current-merchant.decorator';
import { JwtPayload } from 'src/modules/auth/strategies/jwt.strategy';
import { PrismaService } from 'src/shared/prisma/prisma.service';

interface PaginationQuery {
  page?: string;
  limit?: string;
  category?: string;
  search?: string;
}

@ApiTags('Products')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard)
@Controller('products')
export class ProductsController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  @ApiOperation({ summary: 'List all products for the merchant' })
  @ApiQuery({ name: 'page', required: false })
  @ApiQuery({ name: 'limit', required: false })
  @ApiQuery({ name: 'category', required: false })
  @ApiQuery({ name: 'search', required: false })
  async findAll(
    @CurrentMerchant() merchant: JwtPayload,
    @Query() query: PaginationQuery,
  ) {
    const page = Math.max(1, Number(query.page ?? 1));
    const limit = Math.min(100, Number(query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where = {
      merchantId: merchant.merchantId,
      isActive: true,
      ...(query.category ? { category: query.category } : {}),
      ...(query.search
        ? { name: { contains: query.search, mode: 'insensitive' as const } }
        : {}),
    };

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({ where, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      this.prisma.product.count({ where }),
    ]);

    return { success: true, data: products, meta: { page, limit, total } };
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a single product by ID' })
  async findOne(
    @CurrentMerchant() merchant: JwtPayload,
    @Param('id') id: string,
  ) {
    const product = await this.prisma.product.findFirst({
      where: { id, merchantId: merchant.merchantId },
    });
    return { success: true, data: product };
  }
}
