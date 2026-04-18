import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsEnum,
  IsArray,
  ValidateNested,
  IsBoolean,
} from 'class-validator';
import { Type } from 'class-transformer';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  WhatsAppTemplateComponent,
  WhatsAppInteractive,
} from '../interfaces/whatsapp-message.interface';

export enum SendMessageType {
  text = 'text',
  template = 'template',
  interactive = 'interactive',
}

export class SendTextMessageDto {
  @ApiProperty({ description: 'Recipient phone number (E.164 format)', example: '966501234567' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'Text message body', example: 'Hello from the store!' })
  @IsString()
  @IsNotEmpty()
  message!: string;

  @ApiPropertyOptional({ description: 'Enable URL preview in message' })
  @IsOptional()
  @IsBoolean()
  previewUrl?: boolean;
}

export class SendTemplateMessageDto {
  @ApiProperty({ description: 'Recipient phone number (E.164 format)', example: '966501234567' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'WhatsApp template name', example: 'order_confirmation' })
  @IsString()
  @IsNotEmpty()
  templateName!: string;

  @ApiProperty({ description: 'Language code', example: 'ar' })
  @IsString()
  @IsNotEmpty()
  languageCode!: string;

  @ApiPropertyOptional({ description: 'Template components with parameters' })
  @IsOptional()
  @IsArray()
  components?: WhatsAppTemplateComponent[];
}

export class SendInteractiveMessageDto {
  @ApiProperty({ description: 'Recipient phone number (E.164 format)', example: '966501234567' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiProperty({ description: 'Interactive message payload' })
  @IsNotEmpty()
  interactive!: WhatsAppInteractive;
}

export class SendMessageDto {
  @ApiProperty({ enum: SendMessageType, description: 'Type of message to send' })
  @IsEnum(SendMessageType)
  type!: SendMessageType;

  @ApiProperty({ description: 'Recipient phone number (E.164 format)', example: '966501234567' })
  @IsString()
  @IsNotEmpty()
  to!: string;

  @ApiPropertyOptional({ description: 'Text message body (required when type=text)' })
  @IsOptional()
  @IsString()
  message?: string;

  @ApiPropertyOptional({ description: 'Template name (required when type=template)' })
  @IsOptional()
  @IsString()
  templateName?: string;

  @ApiPropertyOptional({ description: 'Language code (required when type=template)', example: 'ar' })
  @IsOptional()
  @IsString()
  languageCode?: string;

  @ApiPropertyOptional({ description: 'Template components (for type=template)' })
  @IsOptional()
  @IsArray()
  components?: WhatsAppTemplateComponent[];

  @ApiPropertyOptional({ description: 'Interactive payload (required when type=interactive)' })
  @IsOptional()
  interactive?: WhatsAppInteractive;

  @ApiPropertyOptional({ description: 'Enable URL preview (for type=text)' })
  @IsOptional()
  @IsBoolean()
  previewUrl?: boolean;
}
