import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import type { AdminJwtPayload } from '../interfaces/admin-auth.interface.js';

@Injectable()
export class AdminJwtAuthGuard implements CanActivate {
  constructor(private readonly jwtService: JwtService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const authHeader = request.headers.authorization;

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new UnauthorizedException('管理后台访问凭证缺失：请先登录管理员账号');
    }

    const token = authHeader.split(' ')[1]?.trim();
    if (!token) {
      throw new UnauthorizedException('管理后台访问凭证非法');
    }

    try {
      const payload: AdminJwtPayload = await this.jwtService.verifyAsync(token);

      // 强校验 Token 签发目标类型必须为 ADMIN
      if (payload.type !== 'ADMIN') {
        throw new ForbiddenException('权限不足：非管理后台专用鉴权凭证');
      }

      if (!['FOUNDER', 'SUPER_ADMIN', 'ADMIN', 'OPERATOR', 'AUDITOR'].includes(payload.role)) {
        throw new ForbiddenException('权限不足：该账号角色无权操作管理后台');
      }

      // 将解析出的管理员信息挂载至 Request 上下文
      request.admin = payload;
      return true;
    } catch (err) {
      if (err instanceof ForbiddenException) {
        throw err;
      }
      throw new UnauthorizedException('管理员凭证已失效或过期，请重新登录');
    }
  }
}
