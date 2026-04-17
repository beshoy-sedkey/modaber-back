import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { Type } from 'class-transformer';

export type SalesPeriod = '7d' | '30d' | '90d';

export class SalesChartQueryDto {
  @IsOptional()
  @IsEnum(['7d', '30d', '90d'])
  period?: SalesPeriod = '30d';
}

export class TopProductsQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(50)
  limit?: number = 5;
}

export class RecentOrdersQueryDto {
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;
}
