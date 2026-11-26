import L from 'leaflet';
import type { Api, MapStatus } from '../../api/types';
import { AppRangeSource, FALLBACK_STATUS, layerKind, OSM_ATTRIBUTION, PROTOMAPS_ATTRIBUTION } from '../mapSource';

/** The base map pictures, as on Eagle Eye View: OpenStreetMap through the cache on this computer, or the company's
 *  Protomaps file. When OpenStreetMap pictures fail, the app is asked again (on "auto" it may move to Protomaps). */
export function attachBaseMap(api: Api, m: L.Map): () => void {
  let alive = true;
  let base: L.Layer | null = null;
  let drawn = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const make = async (status: MapStatus): Promise<L.Layer> => {
    if (layerKind(status) === 'protomaps') {
      const [{ PMTiles }, { leafletLayer }] = await Promise.all([import('pmtiles'), import('protomaps-leaflet')]);
      const pm = new PMTiles(new AppRangeSource(api, status.pmtiles_url));
      return leafletLayer({ url: pm, flavor: 'light', lang: 'en', attribution: PROTOMAPS_ATTRIBUTION }) as unknown as L.Layer;
    }
    return L.tileLayer(api.mapTileUrl(), { maxZoom: 19, attribution: OSM_ATTRIBUTION });
  };
  const apply = async (status: MapStatus) => {
    const kind = layerKind(status);
    if (!alive || kind === drawn) return;
    drawn = kind;
    let next: L.Layer;
    try { next = await make(status); } catch { drawn = ''; if (kind === 'protomaps') void apply(FALLBACK_STATUS); return; }
    if (!alive || drawn !== kind) return;
    if (base) m.removeLayer(base);
    base = next;
    if (kind === 'osm') base.on('tileerror', check);
    base.addTo(m);
  };
  const check = () => { clearTimeout(timer); timer = setTimeout(() => { api.mapStatus().then(apply).catch(() => undefined); }, 1500); };
  api.mapStatus().then(apply).catch(() => apply(FALLBACK_STATUS));
  return () => { alive = false; clearTimeout(timer); };
}
