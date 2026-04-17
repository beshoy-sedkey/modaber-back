import {
  IsString,
  IsOptional,
  IsEnum,
  IsNumber,
  IsDateString,
} from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';
import { ShipmentStatus } from '@prisma/client';

export class UpdateShipmentDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  trackingNumber?: string;

  @ApiPropertyOptional({ enum: ShipmentStatus })
  @IsOptional()
  @IsEnum(ShipmentStatus)
  status?: ShipmentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  labelUrl?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  estimatedCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  actualCost?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsNumber()
  weightKg?: number;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  estimatedDelivery?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  shippedAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  deliveredAt?: string;
}
