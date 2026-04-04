import { Test, TestingModule } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { AuthService } from '../auth.service';
import { PrismaService } from 'src/shared/prisma/prisma.service';
import { PlatformType, PlanTier } from '@prisma/client';

describe('AuthService', () => {
  let service: AuthService;
  let jwtService: jest.Mocked<JwtService>;
  let prisma: jest.Mocked<PrismaService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: JwtService,
          useValue: {
            sign: jest.fn().mockReturnValue('signed-jwt-token'),
          },
        },
        {
          provide: PrismaService,
          useValue: {
            merchant: {
              findUnique: jest.fn(),
            },
          },
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
    jwtService = module.get(JwtService);
    prisma = module.get(PrismaService);
  });

  describe('generateToken', () => {
    it('should sign a JWT with merchantId, platformType and planTier', () => {
      const token = service.generateToken(
        'merchant-uuid',
        PlatformType.shopify,
        PlanTier.basic,
      );
      expect(jwtService.sign).toHaveBeenCalledWith({
        merchantId: 'merchant-uuid',
        platformType: PlatformType.shopify,
        planTier: PlanTier.basic,
        sub: 'merchant-uuid',
      });
      expect(token).toBe('signed-jwt-token');
    });
  });

  describe('validateMerchant', () => {
    it('should return true for an active merchant', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-uuid',
        isActive: true,
      });
      const result = await service.validateMerchant('merchant-uuid');
      expect(result).toBe(true);
    });

    it('should return false for an inactive merchant', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue({
        id: 'merchant-uuid',
        isActive: false,
      });
      const result = await service.validateMerchant('merchant-uuid');
      expect(result).toBe(false);
    });

    it('should return false when merchant does not exist', async () => {
      (prisma.merchant.findUnique as jest.Mock).mockResolvedValue(null);
      const result = await service.validateMerchant('non-existent');
      expect(result).toBe(false);
    });
  });
});
