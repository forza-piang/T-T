import { deriveMaps } from '../../../src/app-config/derive';
import { AmapProxyService } from '../../../src/nest/maps/amap-proxy.service';

import { afterEach, describe, expect, it, vi } from 'vitest';

const config = deriveMaps({ AMAP_JS_API_KEY: 'test-js-key', AMAP_SECURITY_JS_CODE: 'test-server-secret' });
const path = '/_AMapService/v3/place/text?key=test-js-key&keywords=Shanghai';
afterEach(() => vi.unstubAllGlobals());

function stubResponse(response: Response) {
  const stub = vi.fn<typeof fetch>().mockResolvedValue(response);
  vi.stubGlobal('fetch', stub);
  return stub;
}

describe('AMap JS security proxy', () => {
  it('signs only on the server, replaces client credentials, and does not forward cookies', async () => {
    const fetchMock = stubResponse(new Response('{"status":"1"}', { headers: { 'content-type': 'application/json' } }));
    const result = await new AmapProxyService(config).forward(path + '&jscode=untrusted&JSCODE=also-untrusted');
    const [url, options] = fetchMock.mock.calls[0];
    const target = new URL(String(url));
    expect(target.origin).toBe('https://restapi.amap.com');
    expect(target.searchParams.getAll('jscode')).toEqual(['test-server-secret']);
    expect(target.searchParams.has('JSCODE')).toBe(false);
    expect(options.redirect).toBe('error');
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(new Headers(options.headers).has('cookie')).toBe(false);
    expect(new Headers(options.headers).has('authorization')).toBe(false);
    expect(result.body.toString()).toBe('{"status":"1"}');
    expect(result.contentType).toBe('application/json');
  });

  it('uses the documented custom-style host', async () => {
    const fetchMock = stubResponse(new Response(new Uint8Array([1, 2, 3])));
    const result = await new AmapProxyService(config).forward('/_AMapService/v4/map/styles?key=test-js-key');
    expect(String(fetchMock.mock.calls[0][0])).toMatch(/^https:\/\/webapi.amap.com\/v4\/map\/styles\?/);
    expect([...result.body]).toEqual([1, 2, 3]);
  });

  it.each([
    ['v4/map/styles2', 'webapi.amap.com'],
    ['v3/vectormap', 'fmap01.amap.com'],
  ])('routes %s to its fixed SDK host', async (resource, host) => {
    const fetchMock = stubResponse(new Response('map-data'));
    await new AmapProxyService(config).forward(`/_AMapService/${resource}?key=test-js-key&s=rsv3`);
    const url = new URL(String(fetchMock.mock.calls[0][0]));
    expect(url.hostname).toBe(host);
    expect(url.searchParams.get('s')).toBe('rsv3');
  });

  it.each([
    '/_AMapService/https://evil.example/path?key=test-js-key',
    '/_AMapService/v3/../admin?key=test-js-key',
    '/_AMapService/v3/%2e%2e/admin?key=test-js-key',
    '/_AMapService/v3//place/text?key=test-js-key',
    '/_AMapService/v3/place/text?key=someone-else',
  ])('rejects an invalid path or key before fetching: %s', async (input) => {
    const fetchMock = stubResponse(new Response('{}'));
    await expect(new AmapProxyService(config).forward(input)).rejects.toMatchObject({ status: 400 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('fails closed when the security code is absent', async () => {
    const fetchMock = stubResponse(new Response('{}'));
    await expect(new AmapProxyService(deriveMaps({})).forward(path)).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('caps oversized response streams even without Content-Length', async () => {
    stubResponse(new Response(new Uint8Array(8 * 1024 * 1024 + 1)));
    await expect(new AmapProxyService(config).forward(path)).rejects.toMatchObject({ status: 502 });
  });

  it('caps a declared oversized response before reading it', async () => {
    stubResponse(new Response('body', { headers: { 'content-length': '99999999' } }));
    await expect(new AmapProxyService(config).forward(path)).rejects.toMatchObject({ status: 502 });
  });

  it('does not expose upstream exceptions containing secrets', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('URL contained test-server-secret')));
    await expect(new AmapProxyService(config).forward(path)).rejects.toMatchObject({
      message: 'AMap service is unavailable',
    });
  });
});
