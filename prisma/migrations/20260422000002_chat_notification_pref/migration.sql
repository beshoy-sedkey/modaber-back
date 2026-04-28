-- Migration: add notification preferences and customer phone to conversations table

ALTER TABLE "conversations"
  ADD COLUMN IF NOT EXISTS "notify_on_ship"    BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "notify_on_deliver" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "customer_phone"    VARCHAR(20);
