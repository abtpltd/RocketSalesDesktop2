import { describe, expect, it } from 'vitest';
import { AppRangeSource, FALLBACK_STATUS, layerKind } from './mapSource';

describe('map source', () => {
  it('draws Protomaps only when the app chose it and a file is set', () => {
    expect(layerKind(FALLBACK_STATUS)).toBe('osm');
    expect(layerKind({ ...FALLBACK_STATUS, use_source: 'protomaps', pmtiles_url: 'https://m.example.com/ea.pmtiles' })).toBe('protomaps');
    expect(layerKind({ ...FALLBACK_STATUS, use_source: 'protomaps', pmtiles_url: '' })).toBe('osm');
  });

  it('reads PMTiles ranges through the app', async () => {
    const calls: [string, number, number][] = [];
    const api = { mapRange: async (url: string, offset: number, length: number) => { calls.push([url, offset, length]); return new ArrayBuffer(length); } };
    const src = new AppRangeSource(api, 'https://m.example.com/ea.pmtiles');
    expect(src.getKey()).toBe('https://m.example.com/ea.pmtiles');
    const r = await src.getBytes(0, 16384);
    expect(r.data.byteLength).toBe(16384);
    expect(calls).toEqual([['https://m.example.com/ea.pmtiles', 0, 16384]]);
  });
});
