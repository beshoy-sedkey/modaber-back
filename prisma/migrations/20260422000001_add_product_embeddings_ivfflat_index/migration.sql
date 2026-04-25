-- Migration: add ivfflat index on product_embeddings for cosine similarity search
-- This index uses the pgvector ivfflat algorithm for approximate nearest neighbour queries.
-- lists=100 is a reasonable starting value; tune upward as data grows.

CREATE INDEX IF NOT EXISTS product_embeddings_embedding_ivfflat_idx
  ON product_embeddings
  USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);
