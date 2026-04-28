import { IsUUID, IsOptional, IsString } from 'class-validator';
import { ApiPropertyOptional } from '@nestjs/swagger';

export class AssignShipmentDto {
  @ApiPropertyOptional({ description: 'Carrier ID to use (optional; auto-selects by priority if omitted)' })
  @IsOptional()
  @IsUUID()
  carrierId?: string;

  @ApiPropertyOptional({ description: 'Override notes for the shipment' })
  @IsOptional()
  @IsString()
  notes?: string;
}
