import type { ReceiptOcrResponse } from '@trek/shared';
import { receiptOcrRequestSchema } from '@trek/shared';
import { CurrentUser } from '../auth/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RequirePermission, TripAccessGuard } from '../permissions/trip-access.guard';
import { createZodDto } from 'nestjs-zod';
import { OcrServiceError, ReceiptOcrService } from './receipt-ocr.service';
import {
  Body,
  Controller,
  HttpCode,
  HttpException,
  Param,
  Post,
  UseGuards,
} from '@nestjs/common';
import { MiniMaxReceiptService } from './minimax-receipt.service';
import type { User } from '../../types';

/** createZodDto wrapper: validated by the global ZodValidationPipe (APP_PIPE). */
export class ReceiptOcrRequestDto extends createZodDto(receiptOcrRequestSchema) {}

/** Recognize a payment screenshot without writing expenses or storing the image. */
@Controller('api/trips/:tripId/budget')
@UseGuards(JwtAuthGuard, TripAccessGuard)
export class ReceiptOcrController {
  constructor(private readonly ocr: ReceiptOcrService, private readonly minimax: MiniMaxReceiptService) {}

  @Post('scan-receipt')
  @HttpCode(200)
  @RequirePermission('budget_edit')
  async scan(
    @CurrentUser() _user: User,
    @Param('tripId') _tripId: string,
    @Body() body: ReceiptOcrRequestDto,
  ): Promise<ReceiptOcrResponse> {
    try {
      return await (body.provider === 'minimax' ? this.minimax : this.ocr).scan(body.imageBase64);
    } catch (err) {
      if (err instanceof OcrServiceError) {
        throw new HttpException({ error: err.message }, err.status);
      }
      throw err;
    }
  }
}
