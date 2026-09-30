import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AmapProxyService } from './amap-proxy.service';
import { Controller, Get, Req, Res, UseGuards } from '@nestjs/common';

import type { Request, Response } from 'express';

@Controller('_AMapService')
@UseGuards(JwtAuthGuard)
export class AmapProxyController {
  constructor(private readonly proxy: AmapProxyService) {}

  @Get('*path')
  async forward(@Req() req: Request, @Res() res: Response): Promise<void> {
    const result = await this.proxy.forward(req.originalUrl);
    res.setHeader('Content-Type', result.contentType);
    res.setHeader('Cache-Control', 'private, no-store');
    res.status(200).send(result.body);
  }
}
