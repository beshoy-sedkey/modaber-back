import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma, ShipmentStatus } from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import {
  DashboardOverviewDto,
  SalesChartItemDto,
  TopProductItemDto,
  RecentOrderItemDto,
  OrderStatusBreakdownItemDto,
} from './dto/dashboard-overview.dto';
import { SalesPeriod } from './dto/dashboard-query.dto';

interface RawSalesRow {
  date: Date;
  revenue: string;
  orders: string | bigint;
}

interface RawTopProductRow {
  product_id: string;
  name: string;
  total_quantity: string | bigint;
  total_revenue: string;
}

interface RawStatusRow {
  status: string;
  count: string | bigint;
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async getOverview(merchantId: string): Promise<DashboardOverviewDto> {
    const todayStart = new Date();
    todayStart.setHours(0, 0, 0, 0);

    const [
      totalOrdersCount,
      totalProductsCount,
      totalCustomersCount,
      pendingOrdersCount,
      activeShipmentsCount,
      todayOrdersResult,
      revenueResult,
      lowStockCount,
    ] = await Promise.all([
      this.prisma.order.count({ where: { merchantId } }),
      this.prisma.product.count({ where: { merchantId } }),
      this.prisma.customer.count({ where: { merchantId } }),
      this.prisma.order.count({ where: { merchantId, status: OrderStatus.pending } }),
      this.prisma.shipment.count({
        where: {
          merchantId,
          status: {
            in: [
              ShipmentStatus.pending,
              ShipmentStatus.picked_up,
              ShipmentStatus.in_transit,
              ShipmentStatus.out_for_delivery,
            ],
          },
        },
      }),
      this.prisma.order.aggregate({
        where: { merchantId, createdAt: { gte: todayStart } },
        _count: { id: true },
        _sum: { total: true },
      }),
      this.prisma.order.aggregate({
        where: {
          merchantId,
          status: {
            in: [OrderStatus.confirmed, OrderStatus.shipped, OrderStatus.delivered],
          },
        },
        _sum: { total: true },
      }),
      this.prisma.product.count({ where: { merchantId, stockQuantity: { lte: 5 } } }),
    ]);

    return {
      totalRevenue: Number(revenueResult._sum.total ?? 0),
      totalOrders: totalOrdersCount,
      totalProducts: totalProductsCount,
      totalCustomers: totalCustomersCount,
      pendingOrders: pendingOrdersCount,
      activeShipments: activeShipmentsCount,
      revenueToday: Number(todayOrdersResult._sum.total ?? 0),
      ordersToday: todayOrdersResult._count.id,
      lowStockProducts: lowStockCount,
    };
  }

  async getSalesChart(merchantId: string, period: SalesPeriod): Promise<SalesChartItemDto[]> {
    const daysMap: Record<SalesPeriod, number> = { '7d': 7, '30d': 30, '90d': 90 };
    const days = daysMap[period];
    const since = new Date(Date.now() - days * 86400000);

    const rows = await this.prisma.$queryRaw<RawSalesRow[]>(
      Prisma.sql`
        SELECT
          DATE_TRUNC('day', created_at) AS date,
          COALESCE(SUM(total), 0)::text  AS revenue,
          COUNT(id)::text                AS orders
        FROM orders
        WHERE merchant_id = ${merchantId}::uuid
          AND created_at >= ${since}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY DATE_TRUNC('day', created_at) ASC
      `,
    );

    return rows.map((row) => ({
      date: row.date.toISOString().split('T')[0],
      revenue: Number(row.revenue),
      orders: Number(row.orders),
    }));
  }

  async getTopProducts(merchantId: string, limit: number): Promise<TopProductItemDto[]> {
    const rows = await this.prisma.$queryRaw<RawTopProductRow[]>(
      Prisma.sql`
        SELECT
          p.id          AS product_id,
          p.name        AS name,
          SUM(oi.quantity)::text          AS total_quantity,
          SUM(oi.total_price)::text       AS total_revenue
        FROM order_items oi
        INNER JOIN products p ON p.id = oi.product_id
        INNER JOIN orders o   ON o.id = oi.order_id
        WHERE o.merchant_id = ${merchantId}::uuid
        GROUP BY p.id, p.name
        ORDER BY SUM(oi.total_price) DESC
        LIMIT ${limit}
      `,
    );

    return rows.map((row) => ({
      productId: row.product_id,
      name: row.name,
      totalQuantity: Number(row.total_quantity),
      totalRevenue: Number(row.total_revenue),
    }));
  }

  async getRecentOrders(merchantId: string, limit: number): Promise<RecentOrderItemDto[]> {
    const orders = await this.prisma.order.findMany({
      where: { merchantId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      select: {
        id: true,
        platformOrderId: true,
        total: true,
        status: true,
        createdAt: true,
        customer: { select: { name: true } },
      },
    });

    return orders.map((order) => ({
      id: order.id,
      platformOrderId: order.platformOrderId,
      customerName: order.customer.name,
      total: Number(order.total),
      status: order.status,
      createdAt: order.createdAt,
    }));
  }

  async getOrderStatusBreakdown(merchantId: string): Promise<OrderStatusBreakdownItemDto[]> {
    const rows = await this.prisma.$queryRaw<RawStatusRow[]>(
      Prisma.sql`
        SELECT status::text, COUNT(id)::text AS count
        FROM orders
        WHERE merchant_id = ${merchantId}::uuid
        GROUP BY status
        ORDER BY count DESC
      `,
    );

    return rows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));
  }
}
