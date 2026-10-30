import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthService } from './auth.service.js';
import { AuthController } from './auth.controller.js';
import { SignatureVerifierService } from './signature-verifier.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';
import { UserModule } from '../user/user.module.js';
import { AdaptersModule } from '../adapters/adapters.module.js';
import { NetworkModule } from '../network/network.module.js';

@Module({
  imports: [
    JwtModule.register({
      secret:
        process.env.JWT_SECRET ||
        'web3-multichain-secret-jwt-key-2026-secure-token',
      signOptions: { expiresIn: '2h' },
    }),
    UserModule,
    AdaptersModule,
    NetworkModule,
  ],
  controllers: [AuthController],
  providers: [AuthService, SignatureVerifierService, JwtAuthGuard],
  exports: [AuthService, SignatureVerifierService, JwtAuthGuard, JwtModule],
})
export class AuthModule {}
