import { Controller, Post, Body } from '@nestjs/common';
import { AuthService } from './auth.service';
import { GenerateTokenDto } from './dto/generate-token.dto';

interface TokenResponse {
  token: string;
}

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post('token')
  generateToken(@Body() dto: GenerateTokenDto): TokenResponse {
    const token = this.authService.generateToken(
      dto.merchantId,
      dto.platformType,
      dto.planTier,
    );

    return { token };
  }
}
