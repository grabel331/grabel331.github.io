import type { RadioStation } from '../types/radio';

const API_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://all.api.radio-browser.info',
];

export function getRawStreamUrl(station: RadioStation): string {
  return (station.url_resolved || station.url || '').trim();
}

export function getProxyStreamUrl(station: RadioStation): string {
  const rawUrl = getRawStreamUrl(station);
  if (!rawUrl) return '';
  return `/api/stream?url=${encodeURIComponent(rawUrl)}`;
}

export function resolveStreamUrl(station: RadioStation, forceProxy = false): string {
  const rawUrl = getRawStreamUrl(station);
  if (!rawUrl) return '';

  if (forceProxy) {
    return getProxyStreamUrl(station);
  }

  if (
    typeof window !== 'undefined' &&
    window.location.protocol === 'https:' &&
    rawUrl.startsWith('http://')
  ) {
    return getProxyStreamUrl(station);
  }

  return rawUrl;
}

export function getStationLocationLabel(station: RadioStation): string {
  const parts = [station.state?.trim(), station.country?.trim()].filter(Boolean);
  return parts.join(' · ') || 'Localização global';
}

export interface LoadRadiosResult {
  alphaStation: RadioStation | null;
  stations: RadioStation[];
}

async function fetchWithTimeout(
  url: string,
  timeoutMs: number,
  externalSignal?: AbortSignal
): Promise<Response> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);

  const onExternalAbort = () => controller.abort();
  if (externalSignal) {
    if (externalSignal.aborted) {
      controller.abort();
    } else {
      externalSignal.addEventListener('abort', onExternalAbort, { once: true });
    }
  }

  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    window.clearTimeout(timer);
    if (externalSignal) {
      externalSignal.removeEventListener('abort', onExternalAbort);
    }
  }
}

export function hasValidCoordinates(station: RadioStation): boolean {
  if (station.geo_lat === null || station.geo_lat === undefined) return false;
  if (station.geo_long === null || station.geo_long === undefined) return false;
  const lat = Number(station.geo_lat);
  const lng = Number(station.geo_long);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return false;
  if (lat === 0 && lng === 0) return false;
  return lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;
}

export async function loadBrazilAndAlpha(signal?: AbortSignal): Promise<LoadRadiosResult> {
  try {
    const res = await fetchWithTimeout('/api/radios?scope=br', 15000, signal);
    if (res.ok) {
      const data = (await res.json()) as LoadRadiosResult;
      if (data.stations && data.stations.length > 0) {
        return data;
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
  }

  // Fallback directly to Radio Browser mirrors
  for (const server of API_SERVERS) {
    try {
      const [resAlpha, resBrasil] = await Promise.all([
        fetchWithTimeout(
          `${server}/json/stations/search?name=Alpha%20MPB&limit=5&hidebroken=true`,
          8000,
          signal
        ).catch(() => null),
        fetchWithTimeout(
          `${server}/json/stations/search?countrycode=BR&has_geo_info=true&limit=3000&hidebroken=true`,
          12000,
          signal
        ),
      ]);

      if (!resBrasil.ok) continue;

      const stationsAlpha: RadioStation[] = resAlpha?.ok ? await resAlpha.json() : [];
      const alphaStation =
        stationsAlpha.find((s) => Boolean(s.url_resolved || s.url) && hasValidCoordinates(s)) ??
        null;
      const stationsBrasil: RadioStation[] = await resBrasil.json();

      const map = new Map<string, RadioStation>();
      if (alphaStation?.stationuuid) map.set(alphaStation.stationuuid, alphaStation);
      for (const s of stationsBrasil) {
        if (s.stationuuid && hasValidCoordinates(s) && !map.has(s.stationuuid)) {
          map.set(s.stationuuid, s);
        }
      }

      const stations = Array.from(map.values());
      if (stations.length > 0) {
        return { alphaStation, stations };
      }
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  throw new Error('Não foi possível conectar aos servidores de rádio.');
}

export async function loadGlobalStations(signal?: AbortSignal): Promise<RadioStation[]> {
  try {
    const res = await fetchWithTimeout('/api/radios?scope=global', 22000, signal);
    if (res.ok) {
      const data = (await res.json()) as { stations?: RadioStation[] };
      if (Array.isArray(data.stations) && data.stations.length > 0) {
        return data.stations;
      }
    }
  } catch (err) {
    if (signal?.aborted) throw err;
  }

  for (const server of API_SERVERS) {
    try {
      const resGlobal = await fetchWithTimeout(
        `${server}/json/stations/search?has_geo_info=true&limit=8000&hidebroken=true`,
        18000,
        signal
      );
      if (!resGlobal.ok) continue;
      const stationsGlobal: RadioStation[] = await resGlobal.json();
      const filtered = stationsGlobal.filter(hasValidCoordinates);
      if (filtered.length > 0) return filtered;
    } catch (error) {
      if (signal?.aborted) throw error;
    }
  }

  return [];
}
