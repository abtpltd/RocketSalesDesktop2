/**
 * Map source rules for Eagle Eye View, without Leaflet (so they are tested in node).
 * The app decides the source (src-tauri/core/src/map.rs): OpenStreetMap through the cache on this computer, or the
 * company's Protomaps file when the provider chose it or, on "auto", when OpenStreetMap refused this computer.
 */
import type { RangeResponse, Source } from 'pmtiles';
import type { Api, MapStatus } from '../api/types';

export const OSM_ATTRIBUTION = '&copy; OpenStreetMap contributors';
export const PROTOMAPS_ATTRIBUTION = 'Protomaps &copy; OpenStreetMap contributors';

/** Used when the app cannot say (never blocks the map): OpenStreetMap. */
export const FALLBACK_STATUS: MapStatus = {
  use_source: 'osm', pmtiles_url: '', source_setting: 'auto', osm_blocked_until: 0, cached_bytes: 0, cached_pieces: 0, max_bytes: 0,
};

/** 'protomaps' only with a file address; anything else draws OpenStreetMap. */
export function layerKind(status: MapStatus): 'osm' | 'protomaps' {
  return status.use_source === 'protomaps' && !!status.pmtiles_url ? 'protomaps' : 'osm';
}

/** PMTiles reads byte ranges; each one goes through the app, which keeps it on disk after the first download. */
export class AppRangeSource implements Source {
  constructor(private readonly api: Pick<Api, 'mapRange'>, private readonly url: string) {}

  getKey(): string {
    return this.url;
  }

  async getBytes(offset: number, length: number): Promise<RangeResponse> {
    return { data: await this.api.mapRange(this.url, offset, length) };
  }
}
