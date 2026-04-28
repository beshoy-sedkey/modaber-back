-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- CreateExtension
CREATE EXTENSION IF NOT EXISTS "vector";

-- CreateEnum
CREATE TYPE "PlatformType" AS ENUM ('shopify', 'salla');

-- CreateEnum
CREATE TYPE "PlanTier" AS ENUM ('basic', 'pro', 'business', 'enterprise');

-- CreateEnum
CREATE TYPE "CustomerSegment" AS ENUM ('new', 'returning', 'vip', 'dormant');

-- CreateEnum
CREATE TYPE "SourceChannel" AS ENUM ('web', 'whatsapp', 'import');

-- CreateEnum
CREATE TYPE "OrderStatus" AS ENUM ('pending', 'confirming', 'confirmed', 'processing', 'shipping_assigned', 'shipped', 'delivered', 'cancelled', 'returned');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('pending', 'paid', 'failed', 'refunded');

-- CreateEnum
CREATE TYPE "ShipmentStatus" AS ENUM ('pending', 'picked_up', 'in_transit', 'out_for_delivery', 'delivered', 'failed', 'returned');

-- CreateEnum
CREATE TYPE "CarrierName" AS ENUM ('aramex', 'smsa', 'bosta', 'dhl', 'fedex', 'r2s', 'jt_express', 'other');

-- CreateEnum
CREATE TYPE "ConversationChannel" AS ENUM ('web', 'whatsapp');

-- CreateEnum
CREATE TYPE "ConversationStatus" AS ENUM ('active', 'closed', 'escalated');

-- CreateEnum
CREATE TYPE "MessageRole" AS ENUM ('user', 'assistant', 'system', 'tool');

-- CreateEnum
CREATE TYPE "CampaignType" AS ENUM ('social_post', 'ad_campaign');

-- CreateEnum
CREATE TYPE "CampaignPlatform" AS ENUM ('instagram', 'facebook', 'tiktok', 'snapchat', 'google_ads');

-- CreateEnum
CREATE TYPE "CampaignStatus" AS ENUM ('draft', 'scheduled', 'published', 'paused', 'completed');

-- CreateEnum
CREATE TYPE "RatingStatus" AS ENUM ('pending', 'submitted', 'published');

-- CreateEnum
CREATE TYPE "TriggerEvent" AS ENUM ('order_received', 'order_confirmed', 'shipment_dispatched', 'delivery_completed', 'cart_abandoned', 'customer_registered', 'rating_submitted');

-- CreateTable
CREATE TABLE "merchants" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "name" VARCHAR(255) NOT NULL,
    "email" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "platform_type" "PlatformType" NOT NULL,
    "platform_store_id" VARCHAR(255) NOT NULL,
    "platform_access_token" TEXT NOT NULL,
    "platform_refresh_token" TEXT,
    "token_expires_at" TIMESTAMP(3),
    "settings" JSONB DEFAULT '{}',
    "plan_tier" "PlanTier" NOT NULL DEFAULT 'basic',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "needs_reauth" BOOLEAN NOT NULL DEFAULT false,
    "webhook_secret" VARCHAR(255),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "merchants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "customers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "phone" VARCHAR(20),
    "email" VARCHAR(255),
    "address_encrypted" TEXT,
    "city" VARCHAR(100),
    "country" VARCHAR(50),
    "loyalty_points" INTEGER NOT NULL DEFAULT 0,
    "total_orders" INTEGER NOT NULL DEFAULT 0,
    "total_spent" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "segment" "CustomerSegment" NOT NULL DEFAULT 'new',
    "source_channel" "SourceChannel" NOT NULL DEFAULT 'web',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "customers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "products" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "platform_product_id" VARCHAR(255) NOT NULL,
    "name" VARCHAR(500) NOT NULL,
    "description" TEXT,
    "price" DECIMAL(12,2) NOT NULL,
    "compare_at_price" DECIMAL(12,2),
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
    "stock_quantity" INTEGER NOT NULL DEFAULT 0,
    "category" VARCHAR(255),
    "brand" VARCHAR(255),
    "attributes" JSONB DEFAULT '{}',
    "images" JSONB DEFAULT '[]',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "synced_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "products_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "product_embeddings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "product_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "embedding" vector(1536) NOT NULL,
    "embedded_text" TEXT NOT NULL,
    "model_version" VARCHAR(50) NOT NULL DEFAULT 'text-embedding-3-small',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "product_embeddings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "orders" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "platform_order_id" VARCHAR(255),
    "status" "OrderStatus" NOT NULL DEFAULT 'pending',
    "subtotal" DECIMAL(12,2) NOT NULL,
    "discount_amount" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "shipping_cost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'SAR',
    "authenticity_score" INTEGER,
    "payment_method" VARCHAR(50),
    "payment_status" "PaymentStatus" NOT NULL DEFAULT 'pending',
    "shipping_address" JSONB,
    "notes" TEXT,
    "confirmed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "order_items" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "order_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "variant_id" VARCHAR(255),
    "quantity" INTEGER NOT NULL,
    "unit_price" DECIMAL(12,2) NOT NULL,
    "total_price" DECIMAL(12,2) NOT NULL,

    CONSTRAINT "order_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipments" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "order_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "carrier_id" UUID NOT NULL,
    "tracking_number" VARCHAR(255),
    "status" "ShipmentStatus" NOT NULL DEFAULT 'pending',
    "label_url" TEXT,
    "estimated_cost" DECIMAL(10,2),
    "actual_cost" DECIMAL(10,2),
    "weight_kg" DECIMAL(6,2),
    "estimated_delivery" TIMESTAMP(3),
    "shipped_at" TIMESTAMP(3),
    "delivered_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "shipping_carriers" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "carrier_name" "CarrierName" NOT NULL,
    "api_key_encrypted" TEXT,
    "api_credentials" JSONB,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "priority" INTEGER NOT NULL DEFAULT 1,
    "coverage_areas" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "shipping_carriers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "conversations" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "customer_id" UUID,
    "channel" "ConversationChannel" NOT NULL DEFAULT 'web',
    "status" "ConversationStatus" NOT NULL DEFAULT 'active',
    "session_id" VARCHAR(255) NOT NULL,
    "total_messages" INTEGER NOT NULL DEFAULT 0,
    "total_tokens" INTEGER NOT NULL DEFAULT 0,
    "resolved_by_ai" BOOLEAN NOT NULL DEFAULT true,
    "notify_on_ship" BOOLEAN NOT NULL DEFAULT false,
    "notify_on_deliver" BOOLEAN NOT NULL DEFAULT false,
    "customer_phone" VARCHAR(20),
    "started_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "ended_at" TIMESTAMP(3),

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "conversation_id" UUID NOT NULL,
    "role" "MessageRole" NOT NULL,
    "content" TEXT NOT NULL,
    "tool_calls" JSONB,
    "tool_results" JSONB,
    "tokens_input" INTEGER,
    "tokens_output" INTEGER,
    "latency_ms" INTEGER,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "messages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaigns" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "type" "CampaignType" NOT NULL,
    "platform" "CampaignPlatform" NOT NULL,
    "content" TEXT NOT NULL,
    "media_urls" JSONB DEFAULT '[]',
    "hashtags" JSONB DEFAULT '[]',
    "target_audience" JSONB,
    "budget" DECIMAL(10,2),
    "status" "CampaignStatus" NOT NULL DEFAULT 'draft',
    "scheduled_at" TIMESTAMP(3),
    "published_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "campaigns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "campaign_metrics" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "campaign_id" UUID NOT NULL,
    "impressions" INTEGER NOT NULL DEFAULT 0,
    "reach" INTEGER NOT NULL DEFAULT 0,
    "clicks" INTEGER NOT NULL DEFAULT 0,
    "conversions" INTEGER NOT NULL DEFAULT 0,
    "spend" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "revenue" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "metric_date" DATE NOT NULL,

    CONSTRAINT "campaign_metrics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ratings" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "order_id" UUID NOT NULL,
    "customer_id" UUID NOT NULL,
    "merchant_id" UUID NOT NULL,
    "score" SMALLINT NOT NULL,
    "review_text" TEXT,
    "status" "RatingStatus" NOT NULL DEFAULT 'pending',
    "requested_at" TIMESTAMP(3),
    "submitted_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ratings_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "automation_rules" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "name" VARCHAR(255) NOT NULL,
    "description" TEXT,
    "trigger_event" "TriggerEvent" NOT NULL,
    "conditions" JSONB NOT NULL DEFAULT '{}',
    "actions" JSONB NOT NULL DEFAULT '[]',
    "delay_minutes" INTEGER NOT NULL DEFAULT 0,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "execution_count" INTEGER NOT NULL DEFAULT 0,
    "last_executed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "automation_rules_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_configs" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "phone_number_id" VARCHAR(255) NOT NULL,
    "access_token" TEXT NOT NULL,
    "webhook_verify_token" VARCHAR(255) NOT NULL,
    "business_account_id" VARCHAR(255) NOT NULL,
    "app_secret" TEXT,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "whatsapp_configs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "whatsapp_messages" (
    "id" UUID NOT NULL DEFAULT uuid_generate_v4(),
    "merchant_id" UUID NOT NULL,
    "whatsapp_msg_id" VARCHAR(255) NOT NULL,
    "from" VARCHAR(50) NOT NULL,
    "to" VARCHAR(50),
    "message_type" VARCHAR(50) NOT NULL,
    "content" TEXT NOT NULL,
    "direction" VARCHAR(10) NOT NULL,
    "timestamp" TIMESTAMP(3) NOT NULL,
    "raw_payload" JSONB NOT NULL,
    "config_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "whatsapp_messages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "merchants_email_key" ON "merchants"("email");

-- CreateIndex
CREATE INDEX "merchants_platform_store_id_idx" ON "merchants"("platform_store_id");

-- CreateIndex
CREATE INDEX "customers_merchant_id_idx" ON "customers"("merchant_id");

-- CreateIndex
CREATE INDEX "customers_merchant_id_phone_idx" ON "customers"("merchant_id", "phone");

-- CreateIndex
CREATE INDEX "customers_merchant_id_email_idx" ON "customers"("merchant_id", "email");

-- CreateIndex
CREATE INDEX "products_merchant_id_idx" ON "products"("merchant_id");

-- CreateIndex
CREATE INDEX "products_merchant_id_category_idx" ON "products"("merchant_id", "category");

-- CreateIndex
CREATE INDEX "products_merchant_id_is_active_idx" ON "products"("merchant_id", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "products_merchant_id_platform_product_id_key" ON "products"("merchant_id", "platform_product_id");

-- CreateIndex
CREATE INDEX "product_embeddings_merchant_id_idx" ON "product_embeddings"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "product_embeddings_product_id_key" ON "product_embeddings"("product_id");

-- CreateIndex
CREATE INDEX "orders_merchant_id_idx" ON "orders"("merchant_id");

-- CreateIndex
CREATE INDEX "orders_merchant_id_status_idx" ON "orders"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "orders_merchant_id_customer_id_idx" ON "orders"("merchant_id", "customer_id");

-- CreateIndex
CREATE INDEX "orders_merchant_id_created_at_idx" ON "orders"("merchant_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "orders_merchant_id_platform_order_id_key" ON "orders"("merchant_id", "platform_order_id");

-- CreateIndex
CREATE INDEX "order_items_order_id_idx" ON "order_items"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "shipments_order_id_key" ON "shipments"("order_id");

-- CreateIndex
CREATE INDEX "shipments_merchant_id_idx" ON "shipments"("merchant_id");

-- CreateIndex
CREATE INDEX "shipments_merchant_id_status_idx" ON "shipments"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "shipments_tracking_number_idx" ON "shipments"("tracking_number");

-- CreateIndex
CREATE INDEX "shipping_carriers_merchant_id_idx" ON "shipping_carriers"("merchant_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_session_id_key" ON "conversations"("session_id");

-- CreateIndex
CREATE INDEX "conversations_merchant_id_idx" ON "conversations"("merchant_id");

-- CreateIndex
CREATE INDEX "conversations_merchant_id_status_idx" ON "conversations"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "messages_conversation_id_idx" ON "messages"("conversation_id");

-- CreateIndex
CREATE INDEX "messages_conversation_id_created_at_idx" ON "messages"("conversation_id", "created_at");

-- CreateIndex
CREATE INDEX "campaigns_merchant_id_idx" ON "campaigns"("merchant_id");

-- CreateIndex
CREATE INDEX "campaigns_merchant_id_status_idx" ON "campaigns"("merchant_id", "status");

-- CreateIndex
CREATE INDEX "campaign_metrics_campaign_id_idx" ON "campaign_metrics"("campaign_id");

-- CreateIndex
CREATE INDEX "campaign_metrics_campaign_id_metric_date_idx" ON "campaign_metrics"("campaign_id", "metric_date");

-- CreateIndex
CREATE UNIQUE INDEX "ratings_order_id_key" ON "ratings"("order_id");

-- CreateIndex
CREATE INDEX "ratings_merchant_id_idx" ON "ratings"("merchant_id");

-- CreateIndex
CREATE INDEX "ratings_merchant_id_score_idx" ON "ratings"("merchant_id", "score");

-- CreateIndex
CREATE INDEX "automation_rules_merchant_id_idx" ON "automation_rules"("merchant_id");

-- CreateIndex
CREATE INDEX "automation_rules_merchant_id_trigger_event_is_active_idx" ON "automation_rules"("merchant_id", "trigger_event", "is_active");

-- CreateIndex
CREATE UNIQUE INDEX "whatsapp_configs_merchant_id_key" ON "whatsapp_configs"("merchant_id");

-- CreateIndex
CREATE INDEX "whatsapp_configs_merchant_id_idx" ON "whatsapp_configs"("merchant_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_merchant_id_idx" ON "whatsapp_messages"("merchant_id");

-- CreateIndex
CREATE INDEX "whatsapp_messages_merchant_id_from_idx" ON "whatsapp_messages"("merchant_id", "from");

-- CreateIndex
CREATE INDEX "whatsapp_messages_merchant_id_timestamp_idx" ON "whatsapp_messages"("merchant_id", "timestamp");

-- AddForeignKey
ALTER TABLE "customers" ADD CONSTRAINT "customers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "products" ADD CONSTRAINT "products_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "product_embeddings" ADD CONSTRAINT "product_embeddings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "order_items" ADD CONSTRAINT "order_items_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipments" ADD CONSTRAINT "shipments_carrier_id_fkey" FOREIGN KEY ("carrier_id") REFERENCES "shipping_carriers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "shipping_carriers" ADD CONSTRAINT "shipping_carriers_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "messages" ADD CONSTRAINT "messages_conversation_id_fkey" FOREIGN KEY ("conversation_id") REFERENCES "conversations"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaigns" ADD CONSTRAINT "campaigns_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "campaign_metrics" ADD CONSTRAINT "campaign_metrics_campaign_id_fkey" FOREIGN KEY ("campaign_id") REFERENCES "campaigns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_customer_id_fkey" FOREIGN KEY ("customer_id") REFERENCES "customers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "automation_rules" ADD CONSTRAINT "automation_rules_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_configs" ADD CONSTRAINT "whatsapp_configs_merchant_id_fkey" FOREIGN KEY ("merchant_id") REFERENCES "merchants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "whatsapp_messages" ADD CONSTRAINT "whatsapp_messages_config_id_fkey" FOREIGN KEY ("config_id") REFERENCES "whatsapp_configs"("id") ON DELETE CASCADE ON UPDATE CASCADE;
