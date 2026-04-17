import { Injectable } from '@nestjs/common';
import { OrderStatus, Prisma } from '@prisma/client';
import { PrismaService } from 'src/shared/prisma/prisma.service';

// ── Raw query row interfaces ──────────────────────────────────────────────────

interface RawSalesRow {
  date: Date;
  revenue: string;
  orders: string | bigint;
}

interface RawOrderStatusRow {
  status: string;
  count: string | bigint;
  revenue: string;
}

interface RawPaymentMethodRow {
  payment_method: string | null;
  count: string | bigint;
}

interface RawCarrierRow {
  carrier_name: string;
  count: string | bigint;
  avg_cost: string | null;
}

interface RawShipmentStatusRow {
  status: string;
  count: string | bigint;
}

interface RawCategoryRow {
  category: string;
  count: string | bigint;
  total_value: string;
}

// ── Response shape interfaces ─────────────────────────────────────────────────

export interface SalesReportItem {
  date: string;
  revenue: number;
  orders: number;
  avgOrderValue: number;
}

export interface OrdersByStatus {
  status: string;
  count: number;
  revenue: number;
}

export interface OrdersByPaymentMethod {
  method: string;
  count: number;
}

export interface OrdersReportResult {
  totalOrders: number;
  totalRevenue: number;
  byStatus: OrdersByStatus[];
  byPaymentMethod: OrdersByPaymentMethod[];
}

export interface ShipmentsByStatus {
  status: string;
  count: number;
}

export interface ShipmentsByCarrier {
  carrierName: string;
  count: number;
  avgCost: number;
}

export interface ShippingReportResult {
  totalShipments: number;
  byStatus: ShipmentsByStatus[];
  byCarrier: ShipmentsByCarrier[];
}

export interface StockByCategory {
  category: string;
  count: number;
  totalValue: number;
}

export interface StockProduct {
  id: string;
  name: string;
  stockQuantity: number;
  price: number;
  category: string | null;
}

export interface StockReportResult {
  totalProducts: number;
  totalValue: number;
  lowStock: StockProduct[];
  outOfStock: StockProduct[];
  byCategory: StockByCategory[];
}

export interface AiByChannel {
  channel: string;
  count: number;
}

export interface AiUsageReportResult {
  totalConversations: number;
  totalMessages: number;
  avgMessagesPerConversation: number;
  byChannel: AiByChannel[];
}

// ── Service ──────────────────────────────────────────────────────────────────

@Injectable()
export class ReportsService {
  constructor(private readonly prisma: PrismaService) {}

  private defaultDateRange(from?: string, to?: string): { fromDate: Date; toDate: Date } {
    const toDate = to ? new Date(to) : new Date();
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    return { fromDate, toDate };
  }

  async getSalesReport(
    merchantId: string,
    from?: string,
    to?: string,
  ): Promise<SalesReportItem[]> {
    const { fromDate, toDate } = this.defaultDateRange(from, to);

    const rows = await this.prisma.$queryRaw<RawSalesRow[]>(
      Prisma.sql`
        SELECT
          DATE_TRUNC('day', created_at)        AS date,
          COALESCE(SUM(total), 0)::text         AS revenue,
          COUNT(id)::text                       AS orders
        FROM orders
        WHERE merchant_id = ${merchantId}::uuid
          AND created_at >= ${fromDate}
          AND created_at <= ${toDate}
        GROUP BY DATE_TRUNC('day', created_at)
        ORDER BY DATE_TRUNC('day', created_at) ASC
      `,
    );

    return rows.map((row) => {
      const revenue = Number(row.revenue);
      const orders = Number(row.orders);
      return {
        date: row.date.toISOString().split('T')[0] as string,
        revenue,
        orders,
        avgOrderValue: orders > 0 ? Number((revenue / orders).toFixed(2)) : 0,
      };
    });
  }

  async getOrdersReport(
    merchantId: string,
    from?: string,
    to?: string,
    status?: OrderStatus,
  ): Promise<OrdersReportResult> {
    const { fromDate, toDate } = this.defaultDateRange(from, to);

    const whereClause = status
      ? Prisma.sql`merchant_id = ${merchantId}::uuid AND created_at >= ${fromDate} AND created_at <= ${toDate} AND status = ${status}::"OrderStatus"`
      : Prisma.sql`merchant_id = ${merchantId}::uuid AND created_at >= ${fromDate} AND created_at <= ${toDate}`;

    const [statusRows, paymentRows] = await Promise.all([
      this.prisma.$queryRaw<RawOrderStatusRow[]>(
        Prisma.sql`
          SELECT
            status::text,
            COUNT(id)::text       AS count,
            COALESCE(SUM(total), 0)::text AS revenue
          FROM orders
          WHERE ${whereClause}
          GROUP BY status
          ORDER BY count DESC
        `,
      ),
      this.prisma.$queryRaw<RawPaymentMethodRow[]>(
        Prisma.sql`
          SELECT
            COALESCE(payment_method, 'unknown') AS payment_method,
            COUNT(id)::text                     AS count
          FROM orders
          WHERE ${whereClause}
          GROUP BY payment_method
          ORDER BY count DESC
        `,
      ),
    ]);

    const byStatus = statusRows.map((row) => ({
      status: row.status,
      count: Number(row.count),
      revenue: Number(row.revenue),
    }));

    const totalOrders = byStatus.reduce((acc, r) => acc + r.count, 0);
    const totalRevenue = byStatus.reduce((acc, r) => acc + r.revenue, 0);

    const byPaymentMethod = paymentRows.map((row) => ({
      method: row.payment_method ?? 'unknown',
      count: Number(row.count),
    }));

    return { totalOrders, totalRevenue, byStatus, byPaymentMethod };
  }

  async getShippingReport(
    merchantId: string,
    from?: string,
    to?: string,
  ): Promise<ShippingReportResult> {
    const { fromDate, toDate } = this.defaultDateRange(from, to);

    const [statusRows, carrierRows] = await Promise.all([
      this.prisma.$queryRaw<RawShipmentStatusRow[]>(
        Prisma.sql`
          SELECT
            status::text,
            COUNT(id)::text AS count
          FROM shipments
          WHERE merchant_id = ${merchantId}::uuid
            AND created_at >= ${fromDate}
            AND created_at <= ${toDate}
          GROUP BY status
          ORDER BY count DESC
        `,
      ),
      this.prisma.$queryRaw<RawCarrierRow[]>(
        Prisma.sql`
          SELECT
            sc.carrier_name::text AS carrier_name,
            COUNT(s.id)::text     AS count,
            AVG(s.actual_cost)::text AS avg_cost
          FROM shipments s
          INNER JOIN shipping_carriers sc ON sc.id = s.carrier_id
          WHERE s.merchant_id = ${merchantId}::uuid
            AND s.created_at >= ${fromDate}
            AND s.created_at <= ${toDate}
          GROUP BY sc.carrier_name
          ORDER BY count DESC
        `,
      ),
    ]);

    const byStatus = statusRows.map((row) => ({
      status: row.status,
      count: Number(row.count),
    }));

    const totalShipments = byStatus.reduce((acc, r) => acc + r.count, 0);

    const byCarrier = carrierRows.map((row) => ({
      carrierName: row.carrier_name,
      count: Number(row.count),
      avgCost: row.avg_cost != null ? Number(Number(row.avg_cost).toFixed(2)) : 0,
    }));

    return { totalShipments, byStatus, byCarrier };
  }

  async getStockReport(merchantId: string): Promise<StockReportResult> {
    const [totalCount, totalValueRows, lowStockProducts, outOfStockProducts, categoryRows] =
      await Promise.all([
        this.prisma.product.count({ where: { merchantId, isActive: true } }),
        this.prisma.$queryRaw<Array<{ total_value: string }>>(
          Prisma.sql`
            SELECT COALESCE(SUM(price * stock_quantity), 0)::text AS total_value
            FROM products
            WHERE merchant_id = ${merchantId}::uuid AND is_active = true
          `,
        ),
        this.prisma.product.findMany({
          where: { merchantId, isActive: true, stockQuantity: { gt: 0, lte: 10 } },
          select: { id: true, name: true, stockQuantity: true, price: true, category: true },
          orderBy: { stockQuantity: 'asc' },
        }),
        this.prisma.product.findMany({
          where: { merchantId, isActive: true, stockQuantity: 0 },
          select: { id: true, name: true, stockQuantity: true, price: true, category: true },
          orderBy: { name: 'asc' },
        }),
        this.prisma.$queryRaw<RawCategoryRow[]>(
          Prisma.sql`
            SELECT
              COALESCE(category, 'Uncategorized')            AS category,
              COUNT(id)::text                                AS count,
              COALESCE(SUM(price * stock_quantity), 0)::text AS total_value
            FROM products
            WHERE merchant_id = ${merchantId}::uuid
              AND is_active = true
            GROUP BY COALESCE(category, 'Uncategorized')
            ORDER BY count DESC
          `,
        ),
      ]);

    const mapProduct = (p: {
      id: string;
      name: string;
      stockQuantity: number;
      price: { toString(): string };
      category: string | null;
    }): StockProduct => ({
      id: p.id,
      name: p.name,
      stockQuantity: p.stockQuantity,
      price: Number(p.price),
      category: p.category,
    });

    return {
      totalProducts: totalCount,
      totalValue: Number(totalValueRows[0]?.total_value ?? 0),
      lowStock: lowStockProducts.map(mapProduct),
      outOfStock: outOfStockProducts.map(mapProduct),
      byCategory: categoryRows.map((row) => ({
        category: row.category,
        count: Number(row.count),
        totalValue: Number(row.total_value),
      })),
    };
  }

  async getAiUsageReport(
    merchantId: string,
    from?: string,
    to?: string,
  ): Promise<AiUsageReportResult> {
    const { fromDate, toDate } = this.defaultDateRange(from, to);

    const [conversations, channelRows] = await Promise.all([
      this.prisma.conversation.aggregate({
        where: {
          merchantId,
          startedAt: { gte: fromDate, lte: toDate },
        },
        _count: { id: true },
        _sum: { totalMessages: true },
      }),
      this.prisma.$queryRaw<Array<{ channel: string; count: string | bigint }>>(
        Prisma.sql`
          SELECT
            channel::text,
            COUNT(id)::text AS count
          FROM conversations
          WHERE merchant_id = ${merchantId}::uuid
            AND started_at >= ${fromDate}
            AND started_at <= ${toDate}
          GROUP BY channel
          ORDER BY count DESC
        `,
      ),
    ]);

    const totalConversations = conversations._count.id;
    const totalMessages = conversations._sum.totalMessages ?? 0;
    const avgMessagesPerConversation =
      totalConversations > 0
        ? Number((totalMessages / totalConversations).toFixed(2))
        : 0;

    return {
      totalConversations,
      totalMessages,
      avgMessagesPerConversation,
      byChannel: channelRows.map((row) => ({
        channel: row.channel,
        count: Number(row.count),
      })),
    };
  }
}
