import { Injectable } from '@nestjs/common';
import { execFile } from 'node:child_process';
import { RECEIPT_OCR_MAX_IMAGE_BYTES, receiptOcrRequestSchema, stripDataUrlPrefix, type ReceiptOcrResponse } from '@trek/shared';
import { parseReceiptText, trimOcrText } from './receipt-ocr.helpers';

export class OcrServiceError extends Error {
  constructor(public readonly status: number, message: string) { super(message); }
}

/** Read dimensions before invoking any image decoder. Only PNG/JPEG are accepted. */
export function imageDimensions(buffer: Buffer): { width: number; height: number } {
  if (buffer.length >= 24 && buffer.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) &&
      buffer.toString('ascii', 12, 16) === 'IHDR') {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
    let offset = 2;
    while (offset + 3 < buffer.length) {
      if (buffer[offset++] !== 0xff) break;
      while (buffer[offset] === 0xff) offset++;
      const marker = buffer[offset++];
      if (marker === 0xd9 || marker === 0xda) break;
      if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
      if (offset + 2 > buffer.length) break;
      const size = buffer.readUInt16BE(offset);
      if (size < 2 || offset + size > buffer.length) break;
      if ([0xc0, 0xc1, 0xc2].includes(marker) && size >= 8) {
        return { height: buffer.readUInt16BE(offset + 3), width: buffer.readUInt16BE(offset + 5) };
      }
      offset += size;
    }
  }
  throw new OcrServiceError(400, 'Use a valid PNG or JPEG image');
}

export function validateReceiptImage(base64: string): Buffer {
    if (!receiptOcrRequestSchema.safeParse({ imageBase64: base64 }).success) {
      throw new OcrServiceError(400, 'Invalid image data');
    }
    const buffer = Buffer.from(stripDataUrlPrefix(base64), 'base64');
    if (buffer.length > RECEIPT_OCR_MAX_IMAGE_BYTES) throw new OcrServiceError(400, 'Image is too large');
    const { width, height } = imageDimensions(buffer);
    if (!width || !height || width > 4000 || height > 4000 || width * height > 8000000) {
      throw new OcrServiceError(400, 'Image dimensions are too large');
    }
  return buffer;
}

@Injectable()
export class ReceiptOcrService {
  private active = 0;

  async scan(base64: string): Promise<ReceiptOcrResponse> {
    if (this.active >= 2) throw new OcrServiceError(429, 'OCR is busy; please retry');
    const buffer = validateReceiptImage(base64);
    this.active++;
    try {
      const output = await new Promise<string>((resolve, reject) => {
        const child = execFile('tesseract', ['stdin', 'stdout', '-l', 'chi_sim+eng', '--psm', '6'], {
          timeout: 30000, maxBuffer: 256 * 1024, encoding: 'utf8', killSignal: 'SIGKILL',
        }, (error, stdout) => {
          if (error) {
            const unavailable = (error as NodeJS.ErrnoException).code === 'ENOENT';
            reject(new OcrServiceError(unavailable ? 503 : 400, unavailable ? 'OCR engine unavailable' : 'Could not read this image'));
          } else resolve(stdout);
        });
        child.stdin?.on('error', () => {
          child.kill('SIGKILL');
          reject(new OcrServiceError(400, 'Could not read this image'));
        });
        child.stdin?.end(buffer);
      });
      const text = trimOcrText(output);
      return { text, ...parseReceiptText(text) };
    } finally { this.active--; }
  }
}
