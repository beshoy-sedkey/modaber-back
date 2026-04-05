import {
  PlatformProduct,
  PlatformOrder,
  PlatformOrderItem,
  PlatformCustomer,
} from '../../interfaces/platform-adapter.interface';

// ── Salla raw types ───────────────────────────────────────────────────────────

interface SallaProductImage {
  url: string;
}

interface SallaRawProduct {
  id: number;
  name: string;
  description?: string;
  price: { amount: number; currency: string } | number;
  sale_price?: { amount: number } | number | null;
  quantity: number;
  category?: { name?: string } | string;
  brand?: { name?: string } | string;
  images?: SallaProductImage[];
  thumbnail?: string;
  status: string;
}

interface SallaOrderItem {
  product_id?: number;
  name: string;
  quantity: number;
  price: { amount: number } | number;
}

interface SallaAddress {
  street?: string;
  city?: string;
  country?: string;
  country_code?: string;
  postal_code?: string;
}

interface SallaRawOrder {
  id: number;
  reference_id?: string;
  status: { slug?: string; name?: string } | string;
  payment_method?: string;
  amounts: {
    subtotal?: { amount: number };
    discount?: { amount: number };
    shipping?: { amount: number };
    total?: { amount: number };
  };
  currency: string;
  customer?: {
    id?: number;
    name?: string;
    email?: string;
    mobile?: string;
  };
  shipping?: { address?: SallaAddress };
  items: SallaOrderItem[];
  note?: string;
  date?: { date?: string; hijri?: string } | string;
}

interface SallaRawCustomer {
  id: number;
  first_name?: string;
  last_name?: string;
  name?: string;
  email?: string;
  mobile?: string;
  city?: string;
  country?: string;
  orders_count?: number;
  total_spent?: number | { amount: number };
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function toAmount(val: { amount: number } | number | null | undefined): number {
  if (val == null) return 0;
  if (typeof val === 'number') return val;
  return val.amount ?? 0;
}

function toStr(val: { name?: string } | string | null | undefined): string | undefined {
  if (!val) return undefined;
  if (typeof val === 'string') return val || undefined;
  return val.name ?? undefined;
}

function orderStatus(val: { slug?: string; name?: string } | string | undefined): string {
  if (!val) return 'pending';
  if (typeof val === 'string') return val;
  return val.slug ?? val.name ?? 'pending';
}

function orderDate(val: { date?: string } | string | undefined): Date {
  if (!val) return new Date();
  if (typeof val === 'string') return new Date(val);
  return val.date ? new Date(val.date) : new Date();
}

// ── Mappers ───────────────────────────────────────────────────────────────────

export function mapSallaProduct(raw: SallaRawProduct): PlatformProduct {
  const price = toAmount(raw.price);
  const compareAtPrice = raw.sale_price ? toAmount(raw.sale_price) : undefined;
  const currency =
    typeof raw.price === 'object' && raw.price !== null
      ? (raw.price as { amount: number; currency: string }).currency ?? 'SAR'
      : 'SAR';

  const images: string[] = [];
  if (raw.thumbnail) images.push(raw.thumbnail);
  if (raw.images) {
    for (const img of raw.images) {
      if (img.url && !images.includes(img.url)) images.push(img.url);
    }
  }

  return {
    platformProductId: String(raw.id),
    name: raw.name,
    description: raw.description ?? undefined,
    price,
    compareAtPrice,
    currency,
    stockQuantity: raw.quantity ?? 0,
    category: toStr(raw.category),
    brand: toStr(raw.brand),
    images,
    isActive: raw.status === 'sale' || raw.status === 'active',
  };
}

export function mapSallaOrder(raw: SallaRawOrder): PlatformOrder {
  const items: PlatformOrderItem[] = (raw.items ?? []).map((item) => {
    const unitPrice = toAmount(item.price);
    return {
      platformProductId: String(item.product_id ?? 0),
      name: item.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: unitPrice * item.quantity,
    };
  });

  return {
    platformOrderId: String(raw.id),
    customerPhone: raw.customer?.mobile ?? undefined,
    customerEmail: raw.customer?.email ?? undefined,
    customerName: raw.customer?.name ?? undefined,
    status: orderStatus(raw.status),
    paymentStatus: orderStatus(raw.status),
    paymentMethod: raw.payment_method ?? undefined,
    subtotal: toAmount(raw.amounts?.subtotal),
    discountAmount: toAmount(raw.amounts?.discount),
    shippingCost: toAmount(raw.amounts?.shipping),
    total: toAmount(raw.amounts?.total),
    currency: raw.currency ?? 'SAR',
    shippingAddress: raw.shipping?.address as Record<string, unknown> | undefined,
    items,
    notes: raw.note ?? undefined,
    createdAt: orderDate(raw.date),
  };
}

export function mapSallaCustomer(raw: SallaRawCustomer): PlatformCustomer {
  const name =
    raw.name ??
    `${raw.first_name ?? ''} ${raw.last_name ?? ''}`.trim();

  const totalSpent =
    typeof raw.total_spent === 'object' && raw.total_spent !== null
      ? (raw.total_spent as { amount: number }).amount
      : (raw.total_spent ?? 0);

  return {
    platformCustomerId: String(raw.id),
    name,
    email: raw.email ?? undefined,
    phone: raw.mobile ?? undefined,
    city: raw.city ?? undefined,
    country: raw.country ?? undefined,
    totalOrders: raw.orders_count ?? 0,
    totalSpent,
  };
}
