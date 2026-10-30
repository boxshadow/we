import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { AdminJwtPayload } from '../interfaces/admin-auth.interface.js';

export const CurrentAdmin = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AdminJwtPayload => {
    const request = ctx.switchToHttp().getRequest();
    return request.admin;
  },
);
