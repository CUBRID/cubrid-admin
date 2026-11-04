import { Body, Controller, Post, Request } from '@nestjs/common';
import { AuthService } from './auth.service';
import { UserDTO } from '@type/index';
import {
  LoginResponse,
  LogoutRequest,
  RefreshTokenRequest,
} from '@api-interfaces';
import { Public } from '@common';
import { ValidationError } from '@error/validation/validation-error';

@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Post('login')
  async login(@Body() userDTO: UserDTO): Promise<LoginResponse> {
    return await this.authService.login(userDTO);
  }

  @Public()
  @Post('refresh')
  async refresh(@Body() body: RefreshTokenRequest): Promise<LoginResponse> {
    if (!body?.refreshToken?.trim()) {
      throw ValidationError.MissingRequiredField('refreshToken', { endpoint: 'auth/refresh' });
    }
    return await this.authService.refresh(body.refreshToken.trim());
  }

  @Post('logout')
  async logout(@Request() req, @Body() body: LogoutRequest): Promise<{ success: true }> {
    const { jti, exp } = req.user ?? {};
    await this.authService.logout(jti, exp, body?.refreshToken?.trim());
    return { success: true };
  }

  @Public()
  @Post('register')
  async register(@Body() userDTO: UserDTO): Promise<void> {
    await this.authService.register(userDTO);
  }
}
