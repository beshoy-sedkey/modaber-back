import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { OrderStatus } from '@prisma/client';

export class ReportQueryDto {
  @IsOptional()
  @IsDateString()
  from?: string;

  @IsOptional()
  @IsDateString()
  to?: string;

  @IsOptional()
  @IsEnum(OrderStatus)
  status?: OrderStatus;
}
