import { describe, expect, it } from 'vitest';
import {
  createToken,
  decodeApiEnvelope,
  decryptApiData,
  decryptDomainService,
  extractJsonObject,
} from '../src/lib/crypto';

describe('JM API crypto compatibility', () => {
  it('matches the Python token vector', () => {
    expect(createToken('1700566805', '2.0.29')).toEqual({
      token: 'cce2cb071cd0cf371a2e34fd5ad66fd6',
      tokenparam: '1700566805,2.0.29',
    });
  });

  it('decrypts the Python AES-ECB/PKCS7 vector', () => {
    expect(
      decryptApiData('WgqvPutFOtURnTRz2DPa8WtY1U8PwPdC8WGCKyHl/rY=', '1700566805'),
    ).toBe('{"code":200,"name":"向量"}');
  });

  it('decrypts the line-service vector with an empty timestamp', () => {
    expect(
      decryptDomainService('\uFEFFNSAThS5dKFDE01ywmpjbuZIx/CHGkvQ8j/6PyP5fdXA='),
    ).toBe('{"Server":["www.cdnhjk.net"]}');
  });

  it('extracts a JSON object from dirty text', () => {
    expect(extractJsonObject('\uFEFFgarbage{"code":200,"data":"ok"}tail')).toEqual({
      code: 200,
      data: 'ok',
    });
  });

  it('rejects an unsuccessful API envelope', () => {
    expect(() => decodeApiEnvelope('noise{"code":403,"data":[],"errorMsg":"denied"}', 1))
      .toThrow('denied');
  });
});
