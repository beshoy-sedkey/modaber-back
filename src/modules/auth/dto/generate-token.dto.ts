import { IsString, IsNotEmpty, IsEnum } from 'class-validator';
import { PlatformType, PlanTier } from '@prisma/client';

export class GenerateTokenDto {
  @IsString()
  @IsNotEmpty()
  merchantId!: string;

  @IsEnum(PlatformType)
  platformType!: PlatformType;

  @IsEnum(PlanTier)
  planTier!: PlanTier;
}
