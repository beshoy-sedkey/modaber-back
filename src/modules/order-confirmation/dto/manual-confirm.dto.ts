import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ManualConfirmDto {
  @IsOptional()
  @IsString()
  @MaxLength(500)
  readonly notes?: string;
}
