import { forwardRef, useEffect, useImperativeHandle, useMemo, useRef } from 'react';
import L from '../lib/leafletGlobal';
import 'leaflet.markercluster';
import type { RadioStation } from '../types/radio';

export interface RadioMapHandle {
  flyTo: (lat: number, lng: number, zoom: number, duration?: number) => void;
  focusStation: (lat: number, lng: number, fromMapClick?: boolean) => void;
}

interface RadioMapProps {
  stations: RadioStation[];
  favorites: RadioStation[];
  favoriteIds: Set<string>;
  currentStation: RadioStation | null;
  showOnlyFavorites: boolean;
  onSelectStation: (station: RadioStation, source?: 'map' | 'list') => void;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function parseCoords(station: RadioStation): [number, number] | null {
  if (station.geo_lat === null || station.geo_lat === undefined) return null;
  if (station.geo_long === null || station.geo_long === undefined) return null;
  const lat = Number(station.geo_lat);
  const lng = Number(station.geo_long);
  if (Number.isNaN(lat) || Number.isNaN(lng)) return null;
  if (lat === 0 && lng === 0) return null;
  return [lat, lng];
}

function createRadioIcon(isFavorite: boolean, isPlaying: boolean): L.DivIcon {
  const classes = ['radio-marker-dot'];
  if (isFavorite) classes.push('is-favorite');
  if (isPlaying) classes.push('is-playing');
  const size = isPlaying ? 16 : 12;

  return L.divIcon({
    className: 'custom-radio-icon',
    html: `<div class="${classes.join(' ')}"></div>`,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
  });
}

function createNowPlayingIcon(): L.DivIcon {
  const speakerSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`;

  return L.divIcon({
    className: 'now-playing-pin',
    html: `<div class="now-playing-pin-wrapper"><div class="now-playing-pin-ring"></div><div class="now-playing-pin-core">${speakerSvg}</div></div>`,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
  });
}

function buildNowPlayingBubbleHtml(station: RadioStation): string {
  const locationParts = [station.state?.trim(), station.country?.trim()].filter(Boolean).join(' · ');
  const radioIconSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#10b981" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" style="flex-shrink:0"><path d="M4.9 19.1C1 15.2 1 8.8 4.9 4.9"/><path d="M7.8 16.2c-2.3-2.3-2.3-6.1 0-8.5"/><circle cx="12" cy="12" r="2"/><path d="M16.2 7.8c2.3 2.3 2.3 6.1 0 8.5"/><path d="M19.1 4.9C23 8.8 23 15.1 19.1 19"/></svg>`;

  return `
    <div style="display:flex;flex-direction:column;gap:2px;max-width:210px;">
      <div style="display:flex;align-items:center;gap:5px;font-size:10px;font-weight:600;color:#34d399;line-height:1.2;">
        ${radioIconSvg}
        <span>Tocando agora</span>
      </div>
      <div style="font-size:12px;font-weight:700;color:#f8fafc;line-height:1.25;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(station.name)}</div>
      ${
        locationParts
          ? `<div style="font-size:11px;color:#94a3b8;line-height:1.2;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${escapeHtml(locationParts)}</div>`
          : ''
      }
    </div>
  `;
}

export const RadioMap = forwardRef<RadioMapHandle, RadioMapProps>(function RadioMap(
  { stations, favorites, favoriteIds, currentStation, showOnlyFavorites, onSelectStation },
  ref
) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<L.Map | null>(null);
  const clusterGroupRef = useRef<L.MarkerClusterGroup | null>(null);
  const activeMarkerRef = useRef<L.Marker | null>(null);
  const markerMapRef = useRef<Map<string, L.Marker>>(new Map());
  const onSelectStationRef = useRef(onSelectStation);
  const prevHighlightRef = useRef<{ playingId?: string; favoriteIds: Set<string> }>({
    playingId: undefined,
    favoriteIds: new Set(),
  });

  const currentStationId = currentStation?.stationuuid;

  useEffect(() => {
    onSelectStationRef.current = onSelectStation;
  }, [onSelectStation]);

  useImperativeHandle(
    ref,
    () => ({
      flyTo(lat: number, lng: number, zoom: number, duration = 1.2) {
        if (!mapRef.current) return;
        mapRef.current.flyTo([lat, lng], zoom, { duration });
      },
      focusStation(lat: number, lng: number, fromMapClick = false) {
        const map = mapRef.current;
        if (!map) return;

        if (fromMapClick) {
          map.panTo([lat, lng], { animate: true, duration: 0.45 });
        } else {
          // Always fly smoothly to follow Next/Prev/List station changes across countries/world
          const currentZoom = map.getZoom();
          const targetZoom = currentZoom < 7 ? 8 : Math.min(currentZoom, 9);
          map.flyTo([lat, lng], targetZoom, { duration: 1.0 });
        }
      },
    }),
    []
  );

  useEffect(() => {
    if (!containerRef.current || mapRef.current) return;

    const map = L.map(containerRef.current, {
      center: [-20.5, -48.5],
      zoom: 5,
      minZoom: 2,
      closePopupOnClick: false,
      maxBounds: [
        [-90, -180],
        [90, 180],
      ],
      maxBoundsViscosity: 1.0,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      noWrap: true,
      bounds: [
        [-90, -180],
        [90, 180],
      ],
      attribution: '&copy; OpenStreetMap',
    }).addTo(map);

    const clusterGroup = L.markerClusterGroup({
      chunkedLoading: true,
      maxClusterRadius: 40,
    });
    map.addLayer(clusterGroup);

    mapRef.current = map;
    clusterGroupRef.current = clusterGroup;

    const resizeTimer = window.setTimeout(() => {
      map.invalidateSize();
    }, 200);

    return () => {
      window.clearTimeout(resizeTimer);
      if (activeMarkerRef.current) {
        activeMarkerRef.current.remove();
        activeMarkerRef.current = null;
      }
      clusterGroup.clearLayers();
      map.remove();
      mapRef.current = null;
      clusterGroupRef.current = null;
      markerMapRef.current.clear();
    };
  }, []);

  const visibleStations = useMemo(() => {
    if (!showOnlyFavorites) return stations;
    const merged = new Map<string, RadioStation>();
    for (const fav of favorites) {
      merged.set(fav.stationuuid, fav);
    }
    return Array.from(merged.values());
  }, [stations, favorites, showOnlyFavorites]);

  // Build / rebuild cluster markers only when the station dataset or filter mode changes
  useEffect(() => {
    const clusterGroup = clusterGroupRef.current;
    const map = mapRef.current;
    if (!clusterGroup || !map) return;

    clusterGroup.clearLayers();
    markerMapRef.current.clear();

    const markerList: L.Marker[] = [];

    for (const station of visibleStations) {
      const coords = parseCoords(station);
      if (!coords) continue;

      const [lat, lng] = coords;
      const isFav = favoriteIds.has(station.stationuuid);
      const isPlaying = currentStationId === station.stationuuid;
      const marker = L.marker([lat, lng], {
        icon: createRadioIcon(isFav, isPlaying),
      });

      marker.on('click', () => {
        onSelectStationRef.current(station, 'map');
      });

      const locationParts = [station.state, station.country].filter(Boolean).join(' · ');
      const favBadge = isFav ? ' ★' : '';
      marker.bindTooltip(
        `<div class="text-xs leading-snug"><strong class="text-emerald-400 font-semibold">${escapeHtml(station.name)}${favBadge}</strong>${
          locationParts ? `<div class="text-slate-300 mt-0.5">${escapeHtml(locationParts)}</div>` : ''
        }</div>`,
        {
          direction: 'top',
          className: 'world-radio-tooltip',
          opacity: 1,
        }
      );

      markerMapRef.current.set(station.stationuuid, marker);
      markerList.push(marker);
    }

    if (markerList.length > 0) {
      clusterGroup.addLayers(markerList);
      window.setTimeout(() => {
        map.invalidateSize();
      }, 150);
    }

    prevHighlightRef.current = {
      playingId: currentStationId,
      favoriteIds: new Set(favoriteIds),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visibleStations]);

  // Incrementally update marker icons when currentStationId or favoriteIds changes
  useEffect(() => {
    const prev = prevHighlightRef.current;
    const affectedIds = new Set<string>();

    if (prev.playingId) affectedIds.add(prev.playingId);
    if (currentStationId) affectedIds.add(currentStationId);

    for (const id of prev.favoriteIds) {
      if (!favoriteIds.has(id)) affectedIds.add(id);
    }
    for (const id of favoriteIds) {
      if (!prev.favoriteIds.has(id)) affectedIds.add(id);
    }

    for (const id of affectedIds) {
      const marker = markerMapRef.current.get(id);
      if (marker) {
        marker.setIcon(createRadioIcon(favoriteIds.has(id), currentStationId === id));
      }
    }

    prevHighlightRef.current = {
      playingId: currentStationId,
      favoriteIds: new Set(favoriteIds),
    };
  }, [currentStationId, favoriteIds]);

  // Always-visible dedicated Now-Playing pin + permanent popup bubble on top of map
  useEffect(() => {
    const map = mapRef.current;
    if (!map) return;

    if (activeMarkerRef.current) {
      activeMarkerRef.current.remove();
      activeMarkerRef.current = null;
    }

    if (!currentStation) return;

    const coords = parseCoords(currentStation);
    if (!coords) return;

    const [lat, lng] = coords;
    const activeMarker = L.marker([lat, lng], {
      icon: createNowPlayingIcon(),
      zIndexOffset: 2000,
    }).addTo(map);

    activeMarker.bindTooltip(buildNowPlayingBubbleHtml(currentStation), {
      permanent: true,
      direction: 'top',
      offset: [0, -18],
      opacity: 1,
      className: 'now-playing-tooltip',
    });

    activeMarkerRef.current = activeMarker;
  }, [currentStation]);

  return <div ref={containerRef} id="map" className="w-full h-full z-0" aria-label="Mapa mundial de rádios" />;
});
