export class DashboardOverviewDto {
  totalRevenue!: number;
  totalOrders!: number;
  totalProducts!: number;
  totalCustomers!: number;
  pendingOrders!: number;
  activeShipments!: number;
  revenueToday!: number;
  ordersToday!: number;
  lowStockProducts!: number;
}

export class SalesChartItemDto {
  date!: string;
  revenue!: number;
  orders!: number;
}

export class TopProductItemDto {
  productId!: string;
  name!: string;
  totalQuantity!: number;
  totalRevenue!: number;
}

export class RecentOrderItemDto {
  id!: string;
  platformOrderId!: string | null;
  customerName!: string;
  total!: number;
  status!: string;
  createdAt!: Date;
}

export class OrderStatusBreakdownItemDto {
  status!: string;
  count!: number;
}
