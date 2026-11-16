import express from 'express';
import type { Request, Response } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { Readable } from 'node:stream';
import type { ReadableStream as WebReadableStream } from 'node:stream/web';
import { fileURLToPath } from 'node:url';

interface RawRadioStation {
  stationuuid?: string;
  name?: string;
  url?: string;
  url_resolved?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  tags?: string;
  geo_lat?: number | string | null;
  geo_long?: number | string | null;
  codec?: string;
  bitrate?: number;
  favicon?: string;
}

interface CompactRadioStation {
  stationuuid: string;
  name: string;
  url: string;
  url_resolved?: string;
  country?: string;
  countrycode?: string;
  state?: string;
  tags?: string;
  geo_lat?: number | string | null;
  geo_long?: number | string | null;
  codec?: string;
  bitrate?: number;
  favicon?: string;
}

const API_MIRRORS = [
  'https://de1.api.radio-browser.info',
  'https://de2.api.radio-browser.info',
  'https://all.api.radio-browser.info',
];

const CACHE_TTL_MS = 10 * 60 * 1000;

interface CacheEntry<T> {
  data: T;
  expiresAt: number;
}

const brCache: { entry: CacheEntry<{ alphaStation: CompactRadioStation | null; stations: CompactRadioStation[] }> | null } = {
  entry: null,
};

const globalCache: { entry: CacheEntry<{ stations: CompactRadioStation[] }> | null } = {
  entry: null,
};

function hasValidCoords(lat: unknown, lng: unknown): boolean {
  if (lat === null || lat === undefined || lng === null || lng === undefined) return false;
  const numLat = Number(lat);
  const numLng = Number(lng);
  if (Number.isNaN(numLat) || Number.isNaN(numLng)) return false;
  if (numLat === 0 && numLng === 0) return false;
  return numLat >= -90 && numLat <= 90 && numLng >= -180 && numLng <= 180;
}

function trimStation(raw: RawRadioStation): CompactRadioStation | null {
  if (!raw.stationuuid || !raw.name || (!raw.url_resolved && !raw.url)) {
    return null;
  }
  if (!hasValidCoords(raw.geo_lat, raw.geo_long)) {
    return null;
  }
  return {
    stationuuid: raw.stationuuid,
    name: raw.name,
    url: raw.url ?? raw.url_resolved ?? '',
    url_resolved: raw.url_resolved || undefined,
    country: raw.country || undefined,
    countrycode: raw.countrycode || undefined,
    state: raw.state || undefined,
    tags: raw.tags || undefined,
    geo_lat: Number(raw.geo_lat),
    geo_long: Number(raw.geo_long),
    codec: raw.codec || undefined,
    bitrate: raw.bitrate || undefined,
    favicon: raw.favicon || undefined,
  };
}

async function fetchJsonWithMirrors<T>(pathAndQuery: string, timeoutMs = 10000): Promise<T> {
  let lastError: unknown = null;

  for (const mirror of API_MIRRORS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${mirror}${pathAndQuery}`, {
        signal: controller.signal,
        headers: {
          'User-Agent': 'WorldRadio/1.0',
          Accept: 'application/json',
        },
      });
      if (!response.ok) {
        lastError = new Error(`HTTP ${response.status} from ${mirror}`);
        continue;
      }
      return (await response.json()) as T;
    } catch (err) {
      lastError = err;
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError ?? new Error('All Radio Browser mirrors failed');
}

function isBlockedHost(hostname: string): boolean {
  const lower = hostname.toLowerCase();
  if (
    lower === 'localhost' ||
    lower === '127.0.0.1' ||
    lower === '0.0.0.0' ||
    lower === '::1' ||
    lower.endsWith('.local') ||
    lower.endsWith('.internal')
  ) {
    return true;
  }

  // Block private IPv4 ranges
  const ipv4Match = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(lower);
  if (ipv4Match) {
    const a = Number(ipv4Match[1]);
    const b = Number(ipv4Match[2]);
    if (
      a === 10 ||
      a === 127 ||
      a === 0 ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    ) {
      return true;
    }
  }

  return false;
}

async function startServer() {
  const app = express();
  const port = Number(process.env.PORT ?? 3000);
  const __dirname = path.dirname(fileURLToPath(import.meta.url));

  app.get('/api/radios', async (req: Request, res: Response) => {
    const scope = req.query.scope === 'global' ? 'global' : 'br';

    try {
      if (scope === 'br') {
        if (brCache.entry && brCache.entry.expiresAt > Date.now()) {
          res.json(brCache.entry.data);
          return;
        }

        const [alphaRaw, brRaw] = await Promise.all([
          fetchJsonWithMirrors<RawRadioStation[]>(
            '/json/stations/search?name=Alpha%20MPB&limit=5&hidebroken=true',
            8000
          ).catch(() => [] as RawRadioStation[]),
          fetchJsonWithMirrors<RawRadioStation[]>(
            '/json/stations/search?countrycode=BR&has_geo_info=true&limit=3000&hidebroken=true',
            12000
          ),
        ]);

        const alphaTrimmed = alphaRaw.map(trimStation).filter((s): s is CompactRadioStation => s !== null);
        const alphaStation = alphaTrimmed[0] ?? null;

        const map = new Map<string, CompactRadioStation>();
        if (alphaStation) {
          map.set(alphaStation.stationuuid, alphaStation);
        }
        for (const raw of brRaw) {
          const item = trimStation(raw);
          if (item && !map.has(item.stationuuid)) {
            map.set(item.stationuuid, item);
          }
        }

        const payload = { alphaStation, stations: Array.from(map.values()) };
        brCache.entry = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };
        res.json(payload);
        return;
      }

      if (globalCache.entry && globalCache.entry.expiresAt > Date.now()) {
        res.json(globalCache.entry.data);
        return;
      }

      const globalRaw = await fetchJsonWithMirrors<RawRadioStation[]>(
        '/json/stations/search?has_geo_info=true&limit=8000&hidebroken=true',
        20000
      );

      const stations = globalRaw
        .map(trimStation)
        .filter((s): s is CompactRadioStation => s !== null);

      const payload = { stations };
      globalCache.entry = { data: payload, expiresAt: Date.now() + CACHE_TTL_MS };
      res.json(payload);
    } catch (error) {
      console.error('Error fetching radio stations:', error);
      res.status(502).json({ error: 'Falha ao buscar estações na rede Radio Browser.' });
    }
  });

  app.get('/api/stream', async (req: Request, res: Response) => {
    const rawUrl = typeof req.query.url === 'string' ? req.query.url.trim() : '';
    if (!rawUrl) {
      res.status(400).send('Missing stream url');
      return;
    }

    let parsed: URL;
    try {
      parsed = new URL(rawUrl);
    } catch {
      res.status(400).send('Invalid stream url');
      return;
    }

    if ((parsed.protocol !== 'http:' && parsed.protocol !== 'https:') || isBlockedHost(parsed.hostname)) {
      res.status(403).send('Stream URL protocol or host not allowed');
      return;
    }

    const controller = new AbortController();
    const connectTimer = setTimeout(() => controller.abort(), 12000);
    let closed = false;

    req.on('close', () => {
      closed = true;
      controller.abort();
    });

    try {
      const upstream = await fetch(parsed.toString(), {
        redirect: 'follow',
        signal: controller.signal,
        headers: {
          'User-Agent': 'VLC/3.0.18 LibVLC/3.0.18',
          'Icy-MetaData': '0',
        },
      });
      clearTimeout(connectTimer);

      if (!upstream.ok || !upstream.body) {
        if (!res.headersSent) {
          res.status(upstream.status || 502).send('Stream unavailable');
        }
        return;
      }

      const contentType = upstream.headers.get('content-type') || 'audio/mpeg';
      res.status(200);
      res.setHeader('Content-Type', contentType);
      res.setHeader('Cache-Control', 'no-store');
      res.setHeader('Access-Control-Allow-Origin', '*');

      if (req.method === 'HEAD') {
        controller.abort();
        res.end();
        return;
      }

      const nodeStream = Readable.fromWeb(upstream.body as WebReadableStream<Uint8Array>);
      nodeStream.on('error', () => {
        if (!closed && !res.writableEnded) {
          res.end();
        }
      });
      nodeStream.pipe(res);
    } catch {
      clearTimeout(connectTimer);
      if (!closed && !res.headersSent) {
        res.status(502).send('Stream connection failed');
      }
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('/{*splat}', (_req: Request, res: Response) => {
      const indexHtml = path.join(distPath, 'index.html');
      if (fs.existsSync(indexHtml)) {
        res.sendFile(indexHtml);
      } else {
        res.status(404).send('Build not found');
      }
    });
  }

  app.listen(port, '0.0.0.0', () => {
    console.log(`World Radio server listening on http://0.0.0.0:${port}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start server:', err);
  process.exit(1);
});
