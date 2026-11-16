import { useMemo, useRef, useState } from 'react';
import { Download, Heart, MapPin, Play, Radio, Search, Trash2, Upload, X } from 'lucide-react';
import { getStationLocationLabel } from '../services/radioApi';
import type { RadioStation } from '../types/radio';

export type DrawerTab = 'favorites' | 'explore';

interface StationsDrawerProps {
  isOpen: boolean;
  activeTab: DrawerTab;
  favorites: RadioStation[];
  stations: RadioStation[];
  favoriteIds: Set<string>;
  currentStationId?: string;
  showOnlyFavoritesOnMap: boolean;
  onClose: () => void;
  onChangeTab: (tab: DrawerTab) => void;
  onSelectStation: (station: RadioStation) => void;
  onToggleFavorite: (station: RadioStation) => void;
  onRemoveFavorite: (stationuuid: string) => void;
  onImportFavorites: (stations: RadioStation[]) => void;
  onToggleMapFavoritesFilter: () => void;
}

export function StationsDrawer({
  isOpen,
  activeTab,
  favorites,
  stations,
  favoriteIds,
  currentStationId,
  showOnlyFavoritesOnMap,
  onClose,
  onChangeTab,
  onSelectStation,
  onToggleFavorite,
  onRemoveFavorite,
  onImportFavorites,
  onToggleMapFavoritesFilter,
}: StationsDrawerProps) {
  const [query, setQuery] = useState('');
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleExportFavorites = () => {
    if (favorites.length === 0) return;
    const blob = new Blob([JSON.stringify(favorites, null, 2)], {
      type: 'application/json;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'world-radio-favoritos.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      if (Array.isArray(parsed)) {
        onImportFavorites(parsed as RadioStation[]);
      }
    } catch {
      // Ignore malformed JSON files safely
    } finally {
      e.target.value = '';
    }
  };

  const filteredFavorites = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((s) => {
      const haystack = `${s.name} ${s.country ?? ''} ${s.state ?? ''} ${s.tags ?? ''}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [favorites, query]);

  const filteredStations = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) {
      return stations.slice(0, 60);
    }
    const results: RadioStation[] = [];
    for (const s of stations) {
      const haystack = `${s.name} ${s.country ?? ''} ${s.state ?? ''} ${s.tags ?? ''}`.toLowerCase();
      if (haystack.includes(q)) {
        results.push(s);
        if (results.length >= 80) break;
      }
    }
    return results;
  }, [stations, query]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-y-0 right-0 z-[1100] w-full max-w-[380px] bg-slate-900/95 border-l border-white/15 shadow-2xl backdrop-blur-xl flex flex-col">
      {/* Drawer Header */}
      <div className="flex items-center justify-between gap-3 px-4 py-3.5 border-b border-white/10">
        <div className="flex items-center gap-2">
          <Radio className="w-4 h-4 text-emerald-400" />
          <h2 className="text-sm font-semibold text-slate-100">Estações</h2>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar painel"
          className="w-8 h-8 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 flex items-center justify-center transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Segmented Tabs */}
      <div className="px-4 pt-3 pb-2">
        <div className="grid grid-cols-2 gap-1 p-1 bg-slate-950/80 rounded-lg border border-white/10">
          <button
            type="button"
            onClick={() => onChangeTab('favorites')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'favorites'
                ? 'bg-slate-800 text-amber-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Heart className={`w-3.5 h-3.5 ${activeTab === 'favorites' ? 'fill-amber-400 text-amber-400' : ''}`} />
            <span>Favoritos</span>
            <span className="font-mono tabular-nums text-[11px] opacity-80">({favorites.length})</span>
          </button>
          <button
            type="button"
            onClick={() => onChangeTab('explore')}
            className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap ${
              activeTab === 'explore'
                ? 'bg-slate-800 text-emerald-300 shadow-sm'
                : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Explorar</span>
            <span className="font-mono tabular-nums text-[11px] opacity-80">({stations.length})</span>
          </button>
        </div>
      </div>

      {/* Search & Map Filter */}
      <div className="px-4 pb-3 space-y-2 border-b border-white/10">
        <div className="relative">
          <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder={
              activeTab === 'favorites'
                ? 'Filtrar seus favoritos...'
                : 'Buscar por rádio, cidade, país ou gênero...'
            }
            className="w-full bg-slate-950/90 border border-white/15 rounded-lg pl-8 pr-8 py-2 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
          />
          {query && (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
              className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {activeTab === 'favorites' && (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onToggleMapFavoritesFilter}
              className={`w-full px-3 py-1.5 rounded-lg border text-xs font-medium flex items-center justify-between transition-colors cursor-pointer ${
                showOnlyFavoritesOnMap
                  ? 'bg-amber-500/15 border-amber-400/50 text-amber-300'
                  : 'bg-slate-950/50 border-white/10 text-slate-300 hover:border-white/25'
              }`}
            >
              <span className="flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5" />
                Mostrar só favoritos no mapa
              </span>
              <span className="font-mono tabular-nums text-[11px]">
                {showOnlyFavoritesOnMap ? 'ATIVO' : 'TODOS'}
              </span>
            </button>

            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={handleExportFavorites}
                disabled={favorites.length === 0}
                className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-slate-950/60 hover:border-emerald-500/50 hover:text-emerald-300 disabled:opacity-40 disabled:pointer-events-none text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Download className="w-3 h-3" />
                <span>Salvar local</span>
              </button>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-2.5 py-1.5 rounded-lg border border-white/10 bg-slate-950/60 hover:border-emerald-500/50 hover:text-emerald-300 text-[11px] font-semibold text-slate-200 flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Upload className="w-3 h-3" />
                <span>Importar</span>
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".json,application/json"
                onChange={handleImportFile}
                className="hidden"
              />
            </div>
          </div>
        )}
      </div>

      {/* Station List */}
      <div className="flex-1 overflow-y-auto custom-scrollbar divide-y divide-white/8">
        {activeTab === 'favorites' ? (
          filteredFavorites.length === 0 ? (
            <div className="px-6 py-12 text-center">
              <Heart className="w-8 h-8 text-slate-600 mx-auto mb-3" />
              <p className="text-sm font-medium text-slate-200">
                {favorites.length === 0
                  ? 'Nenhuma rádio favorita ainda'
                  : 'Nenhuma favorita encontrada'}
              </p>
              <p className="text-xs text-slate-400 mt-1.5 leading-relaxed">
                {favorites.length === 0
                  ? 'Clique no botão Favoritar no player ou explore o mapa para salvar suas estações preferidas.'
                  : 'Tente outro termo de busca.'}
              </p>
            </div>
          ) : (
            filteredFavorites.map((station) => {
              const isPlaying = currentStationId === station.stationuuid;
              const details = [
                getStationLocationLabel(station),
                station.codec ? station.codec.toUpperCase() : null,
                station.bitrate ? `${station.bitrate}k` : null,
              ]
                .filter(Boolean)
                .join(' · ');

              return (
                <div
                  key={station.stationuuid}
                  className={`px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                    isPlaying ? 'bg-emerald-500/10' : 'hover:bg-white/5'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onSelectStation(station)}
                    className="flex-1 min-w-0 text-left cursor-pointer group"
                  >
                    <div
                      className={`text-xs font-semibold truncate ${
                        isPlaying ? 'text-emerald-400' : 'text-slate-100 group-hover:text-emerald-300'
                      }`}
                    >
                      {station.name}
                    </div>
                    <div className="text-[11px] text-slate-400 truncate mt-0.5 tabular-nums">
                      {details}
                    </div>
                  </button>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => onSelectStation(station)}
                      aria-label={`Tocar ${station.name}`}
                      title="Tocar e localizar no mapa"
                      className="w-8 h-8 rounded-lg bg-white/5 text-slate-300 hover:bg-emerald-600 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onRemoveFavorite(station.stationuuid)}
                      aria-label={`Remover ${station.name} dos favoritos`}
                      title="Remover dos favoritos"
                      className="w-8 h-8 rounded-lg bg-white/5 text-slate-400 hover:bg-rose-500/20 hover:text-rose-300 flex items-center justify-center transition-colors cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              );
            })
          )
        ) : filteredStations.length === 0 ? (
          <div className="px-6 py-12 text-center">
            <Search className="w-8 h-8 text-slate-600 mx-auto mb-3" />
            <p className="text-sm font-medium text-slate-200">
              {stations.length === 0 ? 'Carregando estações globais...' : 'Nenhuma estação encontrada'}
            </p>
            <p className="text-xs text-slate-400 mt-1.5">
              {stations.length === 0
                ? 'Aguarde enquanto buscamos rádios no mundo todo.'
                : 'Tente buscar por outro nome, país ou estilo musical.'}
            </p>
          </div>
        ) : (
          filteredStations.map((station) => {
            const isPlaying = currentStationId === station.stationuuid;
            const isFav = favoriteIds.has(station.stationuuid);
            const details = [
              getStationLocationLabel(station),
              station.codec ? station.codec.toUpperCase() : null,
              station.bitrate ? `${station.bitrate}k` : null,
            ]
              .filter(Boolean)
              .join(' · ');

            return (
              <div
                key={station.stationuuid}
                className={`px-4 py-3 flex items-center justify-between gap-2 transition-colors ${
                  isPlaying ? 'bg-emerald-500/10' : 'hover:bg-white/5'
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelectStation(station)}
                  className="flex-1 min-w-0 text-left cursor-pointer group"
                >
                  <div
                    className={`text-xs font-semibold truncate ${
                      isPlaying ? 'text-emerald-400' : 'text-slate-100 group-hover:text-emerald-300'
                    }`}
                  >
                    {station.name}
                  </div>
                  <div className="text-[11px] text-slate-400 truncate mt-0.5 tabular-nums">
                    {details}
                  </div>
                </button>

                <div className="flex items-center gap-1 shrink-0">
                  <button
                    type="button"
                    onClick={() => onToggleFavorite(station)}
                    aria-label={isFav ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
                    title={isFav ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
                    className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors cursor-pointer ${
                      isFav
                        ? 'bg-amber-500/20 text-amber-300 hover:bg-amber-500/30'
                        : 'bg-white/5 text-slate-400 hover:bg-white/10 hover:text-amber-300'
                    }`}
                  >
                    <Heart className={`w-3.5 h-3.5 ${isFav ? 'fill-amber-400 text-amber-400' : ''}`} />
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectStation(station)}
                    aria-label={`Tocar ${station.name}`}
                    title="Tocar e localizar no mapa"
                    className="w-8 h-8 rounded-lg bg-white/5 text-slate-300 hover:bg-emerald-600 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
                  >
                    <Play className="w-3.5 h-3.5 fill-current ml-0.5" />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
