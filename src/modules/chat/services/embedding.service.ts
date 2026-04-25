import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OnEvent } from '@nestjs/event-emitter';
import { OpenAIEmbeddings } from '@langchain/openai';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { ProductSyncedEvent } from 'src/modules/platform/events/product-synced.event';

interface ProductRow {
  id: string;
  merchantId: string;
  name: string;
  description: string | null;
  category: string | null;
  brand: string | null;
}

interface SimilarProductResult {
  productId: string;
  merchantId: string;
  embeddedText: string;
  similarity: number;
}

@Injectable()
export class EmbeddingService {
  private readonly logger = new Logger(EmbeddingService.name);
  private readonly embeddings: OpenAIEmbeddings;
  private readonly BATCH_SIZE = 100;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {
    this.embeddings = new OpenAIEmbeddings({
      openAIApiKey: this.config.get<string>('OPENAI_API_KEY'),
      modelName: 'text-embedding-3-small',
    });
  }

  /**
   * Generate a 1536-dim embedding vector for the given text.
   */
  async generateEmbedding(text: string): Promise<number[]> {
    return this.embeddings.embedQuery(text);
  }

  /**
   * Concat product fields, embed, and upsert into product_embeddings.
   */
  async embedProduct(product: ProductRow): Promise<void> {
    const textParts: string[] = [product.name];

    if (product.description) {
      textParts.push(product.description);
    }
    if (product.category) {
      textParts.push(product.category);
    }
    if (product.brand) {
      textParts.push(product.brand);
    }

    const embeddedText = textParts.join(' ');
    const vector = await this.generateEmbedding(embeddedText);

    // Format as Postgres vector literal: '[0.1,0.2,...]'
    const vectorLiteral = `[${vector.join(',')}]`;

    await this.prisma.$executeRaw`
      INSERT INTO product_embeddings (id, product_id, merchant_id, embedding, embedded_text, model_version, created_at)
      VALUES (
        uuid_generate_v4(),
        ${product.id}::uuid,
        ${product.merchantId}::uuid,
        ${vectorLiteral}::vector,
        ${embeddedText},
        'text-embedding-3-small',
        NOW()
      )
      ON CONFLICT (product_id) DO UPDATE
        SET embedding     = EXCLUDED.embedding,
            embedded_text = EXCLUDED.embedded_text,
            model_version = EXCLUDED.model_version
    `;

    this.logger.log(
      `Embedded product productId=${product.id} merchantId=${product.merchantId}`,
    );
  }

  /**
   * Batch-embed all active products for a given merchant.
   */
  async embedAllProducts(merchantId: string): Promise<void> {
    const products = await this.prisma.$queryRaw<ProductRow[]>`
      SELECT id, merchant_id AS "merchantId", name, description, category, brand
      FROM products
      WHERE merchant_id = ${merchantId}::uuid
        AND is_active = true
    `;

    this.logger.log(
      `Starting batch embed for merchantId=${merchantId} total=${products.length}`,
    );

    // Process in batches to stay under API rate limits
    for (let i = 0; i < products.length; i += this.BATCH_SIZE) {
      const batch = products.slice(i, i + this.BATCH_SIZE);

      // Build the concatenated texts for this batch
      const texts = batch.map((p) => {
        const parts = [p.name];
        if (p.description) parts.push(p.description);
        if (p.category) parts.push(p.category);
        if (p.brand) parts.push(p.brand);
        return parts.join(' ');
      });

      // Use embedDocuments for batch efficiency
      const vectors = await this.embeddings.embedDocuments(texts);

      for (let j = 0; j < batch.length; j++) {
        const product = batch[j];
        const vector = vectors[j];
        const embeddedText = texts[j];
        const vectorLiteral = `[${vector.join(',')}]`;

        await this.prisma.$executeRaw`
          INSERT INTO product_embeddings (id, product_id, merchant_id, embedding, embedded_text, model_version, created_at)
          VALUES (
            uuid_generate_v4(),
            ${product.id}::uuid,
            ${product.merchantId}::uuid,
            ${vectorLiteral}::vector,
            ${embeddedText},
            'text-embedding-3-small',
            NOW()
          )
          ON CONFLICT (product_id) DO UPDATE
            SET embedding     = EXCLUDED.embedding,
                embedded_text = EXCLUDED.embedded_text,
                model_version = EXCLUDED.model_version
        `;
      }

      this.logger.log(
        `Batch ${Math.floor(i / this.BATCH_SIZE) + 1} complete for merchantId=${merchantId}`,
      );
    }

    this.logger.log(`Batch embed complete for merchantId=${merchantId}`);
  }

  /**
   * Embed queryText and find similar products for the merchant using cosine similarity.
   */
  async searchSimilarProducts(
    merchantId: string,
    queryText: string,
    limit = 5,
  ): Promise<SimilarProductResult[]> {
    const vector = await this.generateEmbedding(queryText);
    const vectorLiteral = `[${vector.join(',')}]`;

    const results = await this.prisma.$queryRaw<SimilarProductResult[]>`
      SELECT
        pe.product_id   AS "productId",
        pe.merchant_id  AS "merchantId",
        pe.embedded_text AS "embeddedText",
        1 - (pe.embedding <=> ${vectorLiteral}::vector) AS similarity
      FROM product_embeddings pe
      WHERE pe.merchant_id = ${merchantId}::uuid
      ORDER BY pe.embedding <=> ${vectorLiteral}::vector
      LIMIT ${limit}
    `;

    return results;
  }

  /**
   * Listen for ProductSyncedEvent and auto re-embed the synced product.
   */
  @OnEvent('product.synced')
  async handleProductSynced(event: ProductSyncedEvent): Promise<void> {
    this.logger.log(
      `ProductSyncedEvent received: merchantId=${event.merchantId} productId=${event.productId}`,
    );

    try {
      const products = await this.prisma.$queryRaw<ProductRow[]>`
        SELECT id, merchant_id AS "merchantId", name, description, category, brand
        FROM products
        WHERE id = ${event.productId}::uuid
          AND merchant_id = ${event.merchantId}::uuid
          AND is_active = true
        LIMIT 1
      `;

      if (products.length === 0) {
        this.logger.warn(
          `Product not found or inactive: productId=${event.productId} merchantId=${event.merchantId}`,
        );
        return;
      }

      await this.embedProduct(products[0]);
    } catch (error) {
      this.logger.error(
        `Failed to embed product productId=${event.productId} merchantId=${event.merchantId}: ${String(error)}`,
      );
    }
  }
}
