import {
  PlatformProduct,
  PlatformOrder,
  PlatformOrderItem,
  PlatformCustomer,
} from '../../interfaces/platform-adapter.interface';

interface ShopifyImage {
  src: string;
}

interface ShopifyVariant {
  id: number;
  price: string;
  compare_at_price?: string;
  inventory_quantity: number;
}

interface ShopifyRawProduct {
  id: number;
  title: string;
  body_html?: string;
  vendor?: string;
  product_type?: string;
  status: string;
  variants: ShopifyVariant[];
  images: ShopifyImage[];
  tags?: string;
}

interface ShopifyLineItem {
  variant_id?: number;
  title: string;
  quantity: number;
  price: string;
}

interface ShopifyAddress {
  address1?: string;
  city?: string;
  country?: string;
  zip?: string;
}

interface ShopifyCustomerRaw {
  email?: string;
  first_name?: string;
  last_name?: string;
  phone?: string;
}

interface ShopifyRawOrder {
  id: number;
  name: string;
  financial_status: string;
  fulfillment_status?: string;
  payment_gateway?: string;
  subtotal_price: string;
  total_discounts: string;
  total_shipping_price_set?: { shop_money: { amount: string } };
  total_price: string;
  currency: string;
  shipping_address?: ShopifyAddress;
  line_items: ShopifyLineItem[];
  note?: string;
  customer?: ShopifyCustomerRaw;
  created_at: string;
}

interface ShopifyRawCustomer {
  id: number;
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  default_address?: { city?: string; country?: string };
  orders_count: number;
  total_spent: string;
}

export function mapShopifyProduct(raw: ShopifyRawProduct): PlatformProduct {
  const variant = raw.variants[0];
  return {
    platformProductId: String(raw.id),
    name: raw.title,
    description: raw.body_html ?? undefined,
    price: parseFloat(variant?.price ?? '0'),
    compareAtPrice: variant?.compare_at_price
      ? parseFloat(variant.compare_at_price)
      : undefined,
    currency: 'SAR',
    stockQuantity: variant?.inventory_quantity ?? 0,
    category: raw.product_type ?? undefined,
    brand: raw.vendor ?? undefined,
    images: raw.images.map((img) => img.src),
    isActive: raw.status === 'active',
  };
}

export function mapShopifyOrder(raw: ShopifyRawOrder): PlatformOrder {
  const items: PlatformOrderItem[] = raw.line_items.map((li) => ({
    platformProductId: String(li.variant_id ?? 0),
    variantId: li.variant_id ? String(li.variant_id) : undefined,
    name: li.title,
    quantity: li.quantity,
    unitPrice: parseFloat(li.price),
    totalPrice: parseFloat(li.price) * li.quantity,
  }));

  const shippingCost = raw.total_shipping_price_set
    ? parseFloat(raw.total_shipping_price_set.shop_money.amount)
    : 0;

  return {
    platformOrderId: String(raw.id),
    customerPhone: raw.customer?.phone ?? undefined,
    customerEmail: raw.customer?.email ?? undefined,
    customerName: raw.customer
      ? `${raw.customer.first_name ?? ''} ${raw.customer.last_name ?? ''}`.trim()
      : undefined,
    status: raw.fulfillment_status ?? 'pending',
    paymentStatus: raw.financial_status,
    paymentMethod: raw.payment_gateway ?? undefined,
    subtotal: parseFloat(raw.subtotal_price),
    discountAmount: parseFloat(raw.total_discounts),
    shippingCost,
    total: parseFloat(raw.total_price),
    currency: raw.currency,
    shippingAddress: raw.shipping_address as Record<string, unknown> | undefined,
    items,
    notes: raw.note ?? undefined,
    createdAt: new Date(raw.created_at),
  };
}

export function mapShopifyCustomer(raw: ShopifyRawCustomer): PlatformCustomer {
  return {
    platformCustomerId: String(raw.id),
    name: `${raw.first_name ?? ''} ${raw.last_name ?? ''}`.trim(),
    email: raw.email ?? undefined,
    phone: raw.phone ?? undefined,
    city: raw.default_address?.city ?? undefined,
    country: raw.default_address?.country ?? undefined,
    totalOrders: raw.orders_count,
    totalSpent: parseFloat(raw.total_spent),
  };
}
