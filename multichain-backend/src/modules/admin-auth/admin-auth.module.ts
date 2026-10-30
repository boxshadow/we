import { Module, Global } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AdminAuthService } from './admin-auth.service.js';
import { AdminAuthController } from './admin-auth.controller.js';
import { AdminJwtAuthGuard } from './guards/admin-jwt-auth.guard.js';

@Global()
@Module({
  imports: [
    JwtModule.register({
      secret:
        process.env.ADMIN_JWT_SECRET ||
        process.env.JWT_SECRET ||
        'web3-multichain-secret-jwt-key-2026-secure-token',
      signOptions: { expiresIn: '8h' },
    }),
  ],
  controllers: [AdminAuthController],
  providers: [AdminAuthService, AdminJwtAuthGuard],
  exports: [AdminAuthService, AdminJwtAuthGuard, JwtModule],
})
export class AdminAuthModule {}
