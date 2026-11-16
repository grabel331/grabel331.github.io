import { useCallback, useEffect, useMemo, useState } from 'react';
import type { RadioStation } from '../types/radio';

const STORAGE_KEY = 'world_radio_favorites_v1';

function readStoredFavorites(): RadioStation[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is RadioStation =>
        Boolean(item && typeof item.stationuuid === 'string' && typeof item.name === 'string')
    );
  } catch {
    return [];
  }
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<RadioStation[]>(() => readStoredFavorites());

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
    } catch {
      // Ignore storage quota errors safely
    }
  }, [favorites]);

  const favoriteIds = useMemo(
    () => new Set(favorites.map((station) => station.stationuuid)),
    [favorites]
  );

  const isFavorite = useCallback(
    (stationuuid?: string | null) => {
      if (!stationuuid) return false;
      return favoriteIds.has(stationuuid);
    },
    [favoriteIds]
  );

  const toggleFavorite = useCallback((station: RadioStation) => {
    setFavorites((prev) => {
      const exists = prev.some((item) => item.stationuuid === station.stationuuid);
      if (exists) {
        return prev.filter((item) => item.stationuuid !== station.stationuuid);
      }
      const savedStation: RadioStation = {
        stationuuid: station.stationuuid,
        name: station.name,
        url: station.url,
        url_resolved: station.url_resolved,
        country: station.country,
        countrycode: station.countrycode,
        state: station.state,
        tags: station.tags,
        geo_lat: station.geo_lat,
        geo_long: station.geo_long,
        codec: station.codec,
        bitrate: station.bitrate,
        favicon: station.favicon,
        savedAt: Date.now(),
      };
      return [savedStation, ...prev];
    });
  }, []);

  const removeFavorite = useCallback((stationuuid: string) => {
    setFavorites((prev) => prev.filter((item) => item.stationuuid !== stationuuid));
  }, []);

  const importFavorites = useCallback((incoming: RadioStation[]) => {
    setFavorites((prev) => {
      const merged = new Map<string, RadioStation>();
      for (const item of prev) merged.set(item.stationuuid, item);
      for (const item of incoming) {
        if (item?.stationuuid && item?.name && !merged.has(item.stationuuid)) {
          merged.set(item.stationuuid, { ...item, savedAt: item.savedAt ?? Date.now() });
        }
      }
      return Array.from(merged.values());
    });
  }, []);

  return {
    favorites,
    favoriteIds,
    isFavorite,
    toggleFavorite,
    removeFavorite,
    importFavorites,
  };
}
