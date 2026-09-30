import { getAppUrl } from '../../app-config';
import { mapsConfig } from '../app-config/tokens';
import {
  BadGatewayException,
  BadRequestException,
  Inject,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import type { ConfigType } from '@nestjs/config';

const PREFIX = '/_AMapService/';
const MAX_BYTES = 8 * 1024 * 1024;

@Injectable()
export class AmapProxyService {
  constructor(@Inject(mapsConfig.KEY) private readonly config: ConfigType<typeof mapsConfig>) {}

  async forward(originalUrl: string): Promise<{ body: Buffer; contentType: string }> {
    const key = this.config.amapJsKey?.trim();
    const secret = this.config.amapSecurityCode?.trim();
    if (!key || !secret) throw new ServiceUnavailableException('AMap JS proxy is not configured');
    if (originalUrl.length > 16384) throw new BadRequestException('AMap request is too long');
    const split = originalUrl.indexOf('?');
    const path = split < 0 ? originalUrl : originalUrl.slice(0, split);
    if (!path.startsWith(PREFIX)) throw new BadRequestException('Invalid AMap path');
    const resource = path.slice(PREFIX.length);
    // Fixed hosts plus a literal versioned path: no encoded traversal, URLs or redirects.
    if (!/^v[345]\/[A-Za-z0-9_/-]+$/.test(resource) || resource.includes('//')) {
      throw new BadRequestException('Invalid AMap path');
    }
    const query = new URLSearchParams(split < 0 ? '' : originalUrl.slice(split + 1));
    if (query.get('key') !== key) throw new BadRequestException('AMap JS key does not match this instance');
    for (const name of [...query.keys()]) {
      if (['key', 'jscode'].includes(name.toLowerCase())) query.delete(name);
    }
    query.set('key', key);
    query.set('jscode', secret);
    const host = ['v4/map/styles', 'v4/map/styles2'].includes(resource)
      ? 'webapi.amap.com'
      : resource === 'v3/vectormap'
        ? 'fmap01.amap.com'
        : 'restapi.amap.com';
    const url = new URL(`https://${host}/${resource}`);
    url.search = query.toString();
    try {
      const response = await fetch(url, {
        method: 'GET',
        redirect: 'error',
        signal: AbortSignal.timeout(12000),
        headers: { Referer: getAppUrl() + '/' },
      });
      if (!response.ok || !response.body) throw new Error('upstream unavailable');
      const length = Number(response.headers.get('content-length'));
      if (length > MAX_BYTES) {
        await response.body.cancel();
        throw new Error('response too large');
      }
      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let size = 0;
      try {
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          size += value.byteLength;
          if (size > MAX_BYTES) throw new Error('response too large');
          chunks.push(value);
        }
      } finally {
        await reader.cancel();
        reader.releaseLock();
      }
      return {
        body: Buffer.concat(chunks),
        contentType: response.headers.get('content-type') || 'application/octet-stream',
      };
    } catch {
      // Never include upstream URLs/errors: they carry the signing secret.
      throw new BadGatewayException('AMap service is unavailable');
    }
  }
}
