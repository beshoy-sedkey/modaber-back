import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export class WhatsAppConfigDto {
  @ApiProperty({ description: 'WhatsApp phone number ID from Meta Business', example: '123456789' })
  @IsString()
  @IsNotEmpty()
  phoneNumberId!: string;

  @ApiProperty({ description: 'Meta Cloud API access token' })
  @IsString()
  @IsNotEmpty()
  accessToken!: string;

  @ApiProperty({ description: 'Token used to verify Meta webhook challenges' })
  @IsString()
  @IsNotEmpty()
  webhookVerifyToken!: string;

  @ApiProperty({ description: 'WhatsApp Business Account ID (WABA ID)' })
  @IsString()
  @IsNotEmpty()
  businessAccountId!: string;

  @ApiPropertyOptional({ description: 'App secret for X-Hub-Signature-256 verification' })
  @IsOptional()
  @IsString()
  appSecret?: string;

  @ApiPropertyOptional({ description: 'Whether this config is active', default: true })
  @IsOptional()
  @IsBoolean()
  isActive?: boolean;
}

export class WhatsAppConfigResponseDto {
  @ApiProperty()
  id!: string;

  @ApiProperty()
  merchantId!: string;

  @ApiProperty()
  phoneNumberId!: string;

  @ApiProperty({ description: 'Access token — masked for security' })
  accessTokenMasked!: string;

  @ApiProperty()
  webhookVerifyToken!: string;

  @ApiProperty()
  businessAccountId!: string;

  @ApiProperty()
  isActive!: boolean;

  @ApiProperty()
  createdAt!: Date;

  @ApiProperty()
  updatedAt!: Date;
}
