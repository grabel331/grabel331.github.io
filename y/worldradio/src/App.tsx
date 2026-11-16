import { useCallback, useEffect, useRef, useState } from 'react';
import { Heart, Loader2, RefreshCw, Search } from 'lucide-react';
import { ContinentSelector } from './components/ContinentSelector';
import { OfflineIndicator, PWAInstallButton } from './components/PWAInstallButton';
import { PlayerBar } from './components/PlayerBar';
import { RadioMap, type RadioMapHandle } from './components/RadioMap';
import { StationsDrawer, type DrawerTab } from './components/StationsDrawer';
import { useFavorites } from './hooks/useFavorites';
import { loadBrazilAndAlpha, loadGlobalStations } from './services/radioApi';
import type { ContinentPreset, RadioStation } from './types/radio';

export default function App() {
  const mapRef = useRef<RadioMapHandle | null>(null);
  const [stations, setStations] = useState<RadioStation[]>([]);
  const [currentStation, setCurrentStation] = useState<RadioStation | null>(null);
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isRandomMode, setIsRandomMode] = useState<boolean>(false);
  const [activeContinentId, setActiveContinentId] = useState<string>('south-america');

  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isLoadingGlobal, setIsLoadingGlobal] = useState<boolean>(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const [drawerTab, setDrawerTab] = useState<DrawerTab>('favorites');
  const [showOnlyFavoritesOnMap, setShowOnlyFavoritesOnMap] = useState<boolean>(false);

  const { favorites, favoriteIds, isFavorite, toggleFavorite, removeFavorite, importFavorites } = useFavorites();

  const fetchStations = useCallback(async (signal?: AbortSignal) => {
    setIsLoading(true);
    setLoadError(null);
    try {
      // Stage 1: Load Alpha MPB + Brazil stations quickly (< 1.5s)
      const { alphaStation, stations: brStations } = await loadBrazilAndAlpha(signal);
      if (signal?.aborted) return;

      setStations(brStations);
      if (alphaStation) {
        setCurrentStation((prev) => prev ?? alphaStation);
        const foundIdx = brStations.findIndex((s) => s.stationuuid === alphaStation.stationuuid);
        if (foundIdx !== -1) setCurrentIndex(foundIdx);
      } else if (brStations.length > 0) {
        setCurrentStation((prev) => prev ?? brStations[0]);
      }

      setIsLoading(false);

      // Stage 2: Hydrate global stations in background without blocking map or audio
      setIsLoadingGlobal(true);
      const globalStations = await loadGlobalStations(signal);
      if (signal?.aborted) return;

      if (globalStations.length > 0) {
        setStations((prev) => {
          const merged = new Map<string, RadioStation>();
          for (const s of prev) merged.set(s.stationuuid, s);
          for (const s of globalStations) {
            if (s.stationuuid && !merged.has(s.stationuuid)) {
              merged.set(s.stationuuid, s);
            }
          }
          return Array.from(merged.values());
        });
      }
    } catch (error) {
      if (signal?.aborted || (error instanceof DOMException && error.name === 'AbortError')) return;
      setLoadError('Falha ao carregar estações. Tente novamente.');
      setIsLoading(false);
    } finally {
      if (!signal?.aborted) {
        setIsLoadingGlobal(false);
      }
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    fetchStations(controller.signal);
    return () => controller.abort();
  }, [fetchStations]);

  const handleSelectStation = useCallback(
    (station: RadioStation, source: 'map' | 'list' = 'list') => {
      setCurrentStation(station);
      const idx = stations.findIndex((s) => s.stationuuid === station.stationuuid);
      if (idx !== -1) {
        setCurrentIndex(idx);
      }

      const lat = parseFloat(String(station.geo_lat ?? ''));
      const lng = parseFloat(String(station.geo_long ?? ''));
      if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
        mapRef.current?.focusStation(lat, lng, source === 'map');
      }
    },
    [stations]
  );

  const handleFocusCurrentStation = useCallback(() => {
    if (!currentStation) return;
    const lat = parseFloat(String(currentStation.geo_lat ?? ''));
    const lng = parseFloat(String(currentStation.geo_long ?? ''));
    if (!Number.isNaN(lat) && !Number.isNaN(lng)) {
      mapRef.current?.focusStation(lat, lng, false);
    }
  }, [currentStation]);

  const handleChangeStation = useCallback(
    (direction: -1 | 1) => {
      if (showOnlyFavoritesOnMap && favorites.length > 0) {
        const curFavIdx = favorites.findIndex(
          (f) => f.stationuuid === currentStation?.stationuuid
        );
        const nextFavIdx =
          curFavIdx === -1
            ? 0
            : (curFavIdx + direction + favorites.length) % favorites.length;
        handleSelectStation(favorites[nextFavIdx], 'list');
        return;
      }

      if (stations.length === 0) return;

      let nextIndex = currentIndex;

      if (isRandomMode) {
        if (stations.length > 1) {
          do {
            nextIndex = Math.floor(Math.random() * stations.length);
          } while (nextIndex === currentIndex);
        } else {
          nextIndex = 0;
        }
      } else {
        const radiosSP = stations.filter((s) => {
          const st = s.state?.toLowerCase() ?? '';
          return st.includes('são paulo') || st.includes('sao paulo');
        });

        if (radiosSP.length > 0) {
          const randomSP = radiosSP[Math.floor(Math.random() * radiosSP.length)];
          const found = stations.findIndex((s) => s.stationuuid === randomSP.stationuuid);
          nextIndex = found !== -1 ? found : 0;
        } else {
          nextIndex = (currentIndex + direction + stations.length) % stations.length;
        }
      }

      const target = stations[nextIndex];
      if (target) {
        setCurrentIndex(nextIndex);
        handleSelectStation(target, 'list');
      }
    },
    [
      showOnlyFavoritesOnMap,
      favorites,
      currentStation,
      stations,
      currentIndex,
      isRandomMode,
      handleSelectStation,
    ]
  );

  const handleSelectContinent = useCallback((preset: ContinentPreset) => {
    setActiveContinentId(preset.id);
    mapRef.current?.flyTo(preset.lat, preset.lng, preset.zoom, 1.5);
  }, []);

  const openDrawer = (tab: DrawerTab) => {
    setDrawerTab(tab);
    setDrawerOpen(true);
  };

  return (
    <main className="relative w-screen h-screen overflow-hidden bg-slate-950 select-none">
      {/* Fullscreen Interactive Map */}
      <RadioMap
        ref={mapRef}
        stations={stations}
        favorites={favorites}
        favoriteIds={favoriteIds}
        currentStation={currentStation}
        showOnlyFavorites={showOnlyFavoritesOnMap}
        onSelectStation={handleSelectStation}
      />

      {/* Top-Right Station Library Triggers */}
      <header className="fixed top-3 right-3 z-[900] flex items-center gap-2">
        {isLoadingGlobal && !isLoading && (
          <div
            className="px-2.5 py-2 rounded-xl bg-slate-900/92 border border-white/15 shadow-lg backdrop-blur-md flex items-center gap-1.5 text-[11px] text-slate-300"
            title="Carregando estações globais"
          >
            <Loader2 className="w-3.5 h-3.5 text-emerald-400 animate-spin" />
          </div>
        )}

        <button
          type="button"
          onClick={() => openDrawer('favorites')}
          className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
            drawerOpen && drawerTab === 'favorites'
              ? 'bg-amber-500/20 text-amber-200 border-amber-400/50'
              : 'bg-slate-900/92 text-slate-100 border-white/15 hover:border-amber-400/50 hover:text-amber-200'
          }`}
        >
          <Heart
            className={`w-3.5 h-3.5 ${
              favorites.length > 0 ? 'fill-amber-400 text-amber-400' : 'text-slate-400'
            }`}
          />
          <span>Favoritos</span>
          <span className="font-mono tabular-nums text-[11px] text-slate-300">
            ({favorites.length})
          </span>
        </button>

        <PWAInstallButton />

        <button
          type="button"
          onClick={() => openDrawer('explore')}
          aria-label="Buscar estações"
          className={`px-3 py-2 rounded-xl border text-xs font-semibold flex items-center gap-1.5 shadow-lg backdrop-blur-md transition-colors cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
            drawerOpen && drawerTab === 'explore'
              ? 'bg-emerald-600 text-white border-emerald-500'
              : 'bg-slate-900/92 text-slate-100 border-white/15 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white'
          }`}
        >
          <Search className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Buscar</span>
        </button>
      </header>

      {/* Initial Loading or Error Toast */}
      {isLoading && (
        <div
          role="status"
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[950] px-4 py-2 rounded-full bg-emerald-600/95 text-white text-xs font-semibold shadow-xl backdrop-blur-md flex items-center gap-2 pointer-events-none"
        >
          <Loader2 className="w-3.5 h-3.5 animate-spin" />
          <span>Carregando estações...</span>
        </div>
      )}

      {loadError && !isLoading && (
        <div
          role="alert"
          className="fixed top-20 left-1/2 -translate-x-1/2 z-[950] px-4 py-2 rounded-xl bg-slate-900/95 border border-rose-500/40 text-rose-200 text-xs font-medium shadow-xl backdrop-blur-md flex items-center gap-3"
        >
          <span>{loadError}</span>
          <button
            type="button"
            onClick={() => fetchStations()}
            className="px-2.5 py-1 rounded-md bg-rose-500/20 hover:bg-rose-500/30 text-rose-100 font-semibold flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Tentar de novo
          </button>
        </div>
      )}

      {/* Continent Quick Navigation (without Home button) */}
      <ContinentSelector
        activeContinentId={activeContinentId}
        onSelectContinent={handleSelectContinent}
      />

      {/* Persistent Floating Player */}
      <PlayerBar
        currentStation={currentStation}
        isRandomMode={isRandomMode}
        isCurrentFavorite={isFavorite(currentStation?.stationuuid)}
        hasStations={stations.length > 0 || favorites.length > 0}
        onToggleRandom={() => setIsRandomMode((prev) => !prev)}
        onChangeStation={handleChangeStation}
        onToggleFavorite={toggleFavorite}
        onFocusCurrentStation={handleFocusCurrentStation}
      />

      {/* Favorites & Station Explorer Drawer */}
      <StationsDrawer
        isOpen={drawerOpen}
        activeTab={drawerTab}
        favorites={favorites}
        stations={stations}
        favoriteIds={favoriteIds}
        currentStationId={currentStation?.stationuuid}
        showOnlyFavoritesOnMap={showOnlyFavoritesOnMap}
        onClose={() => setDrawerOpen(false)}
        onChangeTab={setDrawerTab}
        onSelectStation={handleSelectStation}
        onToggleFavorite={toggleFavorite}
        onRemoveFavorite={removeFavorite}
        onImportFavorites={importFavorites}
        onToggleMapFavoritesFilter={() => setShowOnlyFavoritesOnMap((prev) => !prev)}
      />

      {/* Offline Status Indicator */}
      <OfflineIndicator />
    </main>
  );
}
