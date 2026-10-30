import { Controller, Get, Res } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import type { Response } from 'express';
import path from 'path';
import { AppService } from './app.service.js';

@ApiTags('Health - 系统探针与健康检查')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @ApiOperation({ summary: '系统存活心跳检查 (Liveness Probe)' })
  @ApiResponse({ status: 200, description: '服务运行正常' })
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @ApiOperation({ summary: 'Web3 登录与多链绑定交互式测试页面' })
  @Get('demo')
  getDemo(@Res() res: Response) {
    res.sendFile(path.join(process.cwd(), 'public', 'demo.html'));
  }
}
