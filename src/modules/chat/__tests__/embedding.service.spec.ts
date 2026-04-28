import { Test, TestingModule } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { EmbeddingService } from '../services/embedding.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { ProductSyncedEvent } from 'src/modules/platform/events/product-synced.event';

// ── Mock OpenAIEmbeddings ─────────────────────────────────────────────────────

const mockEmbedQuery = jest.fn();
const mockEmbedDocuments = jest.fn();

jest.mock('@langchain/openai', () => ({
  OpenAIEmbeddings: jest.fn().mockImplementation(() => ({
    embedQuery: mockEmbedQuery,
    embedDocuments: mockEmbedDocuments,
  })),
}));

// ── Constants ─────────────────────────────────────────────────────────────────

const MERCHANT_ID = 'aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa';
const PRODUCT_ID  = 'bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb';

const FAKE_VECTOR = Array.from({ length: 1536 }, (_, i) => i / 1536);

// ── Mock Prisma ───────────────────────────────────────────────────────────────

const mockPrisma = {
  $executeRaw: jest.fn(),
  $queryRaw:   jest.fn(),
};

// ── Test setup ────────────────────────────────────────────────────────────────

describe('EmbeddingService', () => {
  let service: EmbeddingService;

  beforeEach(async () => {
    jest.clearAllMocks();

    mockEmbedQuery.mockResolvedValue(FAKE_VECTOR);
    mockEmbedDocuments.mockResolvedValue([FAKE_VECTOR]);

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        EmbeddingService,
        { provide: PrismaService,   useValue: mockPrisma },
        {
          provide: ConfigService,
          useValue: { get: jest.fn().mockReturnValue('sk-test-key') },
        },
      ],
    }).compile();

    service = module.get<EmbeddingService>(EmbeddingService);
  });

  // ── generateEmbedding ──────────────────────────────────────────────────────

  describe('generateEmbedding', () => {
    it('should return a 1536-dim vector', async () => {
      const result = await service.generateEmbedding('test text');

      expect(result).toHaveLength(1536);
      expect(mockEmbedQuery).toHaveBeenCalledWith('test text');
    });

    it('should call embedQuery with the provided text', async () => {
      await service.generateEmbedding('hello world');

      expect(mockEmbedQuery).toHaveBeenCalledTimes(1);
      expect(mockEmbedQuery).toHaveBeenCalledWith('hello world');
    });
  });

  // ── embedProduct ───────────────────────────────────────────────────────────

  describe('embedProduct', () => {
    const product = {
      id:          PRODUCT_ID,
      merchantId:  MERCHANT_ID,
      name:        'Test Product',
      description: 'A great product',
      category:    'Electronics',
      brand:       'Acme',
    };

    it('should concatenate name, description, category, brand and embed', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.embedProduct(product);

      const expectedText = 'Test Product A great product Electronics Acme';
      expect(mockEmbedQuery).toHaveBeenCalledWith(expectedText);
    });

    it('should upsert into product_embeddings via $executeRaw', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.embedProduct(product);

      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });

    it('should handle product with missing optional fields', async () => {
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.embedProduct({
        id:          PRODUCT_ID,
        merchantId:  MERCHANT_ID,
        name:        'Minimal Product',
        description: null,
        category:    null,
        brand:       null,
      });

      expect(mockEmbedQuery).toHaveBeenCalledWith('Minimal Product');
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
    });
  });

  // ── embedAllProducts ───────────────────────────────────────────────────────

  describe('embedAllProducts', () => {
    it('should query only products for the given merchantId (tenant isolation)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.embedAllProducts(MERCHANT_ID);

      const call = mockPrisma.$queryRaw.mock.calls[0];
      // The tagged-template SQL strings contain the merchantId
      const sqlParts: string[] = call[0] as string[];
      const fullSql = sqlParts.join('');
      expect(fullSql).toContain('merchant_id');
      expect(fullSql).toContain('is_active');
    });

    it('should embed nothing when no active products exist', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.embedAllProducts(MERCHANT_ID);

      expect(mockEmbedDocuments).not.toHaveBeenCalled();
      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should batch-embed products using embedDocuments', async () => {
      const products = [
        {
          id: PRODUCT_ID,
          merchantId: MERCHANT_ID,
          name: 'Product A',
          description: 'Desc A',
          category: 'Cat A',
          brand: 'Brand A',
        },
        {
          id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc',
          merchantId: MERCHANT_ID,
          name: 'Product B',
          description: null,
          category: null,
          brand: null,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(products);
      mockEmbedDocuments.mockResolvedValue([FAKE_VECTOR, FAKE_VECTOR]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      await service.embedAllProducts(MERCHANT_ID);

      expect(mockEmbedDocuments).toHaveBeenCalledTimes(1);
      expect(mockEmbedDocuments).toHaveBeenCalledWith([
        'Product A Desc A Cat A Brand A',
        'Product B',
      ]);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(2);
    });
  });

  // ── searchSimilarProducts ──────────────────────────────────────────────────

  describe('searchSimilarProducts', () => {
    it('should embed the query and query by merchantId (tenant isolation)', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.searchSimilarProducts(MERCHANT_ID, 'wireless headphones');

      expect(mockEmbedQuery).toHaveBeenCalledWith('wireless headphones');

      const call = mockPrisma.$queryRaw.mock.calls[0];
      const sqlParts: string[] = call[0] as string[];
      const fullSql = sqlParts.join('');
      expect(fullSql).toContain('merchant_id');
      expect(fullSql).toContain('<=>');
    });

    it('should return similarity results', async () => {
      const fakeResults = [
        {
          productId: PRODUCT_ID,
          merchantId: MERCHANT_ID,
          embeddedText: 'Wireless Headphones Premium Audio',
          similarity: 0.95,
        },
      ];

      mockPrisma.$queryRaw.mockResolvedValue(fakeResults);

      const results = await service.searchSimilarProducts(
        MERCHANT_ID,
        'headphones',
        5,
      );

      expect(results).toHaveLength(1);
      expect(results[0].productId).toBe(PRODUCT_ID);
      expect(results[0].similarity).toBe(0.95);
    });

    it('should default limit to 5', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      await service.searchSimilarProducts(MERCHANT_ID, 'shoes');

      // LIMIT 5 appears as a raw value in the template
      const call = mockPrisma.$queryRaw.mock.calls[0];
      const values = call.slice(1);
      expect(values).toContain(5);
    });

    it('should not return products from a different merchant', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const results = await service.searchSimilarProducts(
        'different-merchant-id',
        'shoes',
        5,
      );

      // Results are scoped to the queried merchantId only
      const call = mockPrisma.$queryRaw.mock.calls[0];
      const sqlParts: string[] = call[0] as string[];
      const fullSql = sqlParts.join('');
      expect(fullSql).toContain('merchant_id');
      expect(results).toHaveLength(0);
    });
  });

  // ── handleProductSynced ────────────────────────────────────────────────────

  describe('handleProductSynced', () => {
    it('should re-embed the product when ProductSyncedEvent fires', async () => {
      const product = {
        id: PRODUCT_ID,
        merchantId: MERCHANT_ID,
        name: 'Synced Product',
        description: 'Desc',
        category: 'Cat',
        brand: 'Brand',
      };

      mockPrisma.$queryRaw.mockResolvedValue([product]);
      mockPrisma.$executeRaw.mockResolvedValue(1);

      const event = new ProductSyncedEvent(MERCHANT_ID, 'platform-prod-1', PRODUCT_ID);
      await service.handleProductSynced(event);

      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$executeRaw).toHaveBeenCalledTimes(1);
      expect(mockEmbedQuery).toHaveBeenCalledTimes(1);
    });

    it('should do nothing when product is not found or inactive', async () => {
      mockPrisma.$queryRaw.mockResolvedValue([]);

      const event = new ProductSyncedEvent(MERCHANT_ID, 'platform-prod-x', PRODUCT_ID);
      await service.handleProductSynced(event);

      expect(mockPrisma.$executeRaw).not.toHaveBeenCalled();
    });

    it('should log error but not throw when embedding fails', async () => {
      mockPrisma.$queryRaw.mockRejectedValue(new Error('DB error'));

      const event = new ProductSyncedEvent(MERCHANT_ID, 'platform-prod-y', PRODUCT_ID);

      await expect(service.handleProductSynced(event)).resolves.not.toThrow();
    });
  });
});
