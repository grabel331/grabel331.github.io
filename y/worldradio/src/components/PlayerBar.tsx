import { useEffect, useRef, useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
  Globe,
  Heart,
  Loader2,
  LocateFixed,
  Pause,
  Play,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { getProxyStreamUrl, getStationLocationLabel, resolveStreamUrl } from '../services/radioApi';
import type { RadioStation } from '../types/radio';

interface PlayerBarProps {
  currentStation: RadioStation | null;
  isRandomMode: boolean;
  isCurrentFavorite: boolean;
  hasStations: boolean;
  onToggleRandom: () => void;
  onChangeStation: (direction: -1 | 1) => void;
  onToggleFavorite: (station: RadioStation) => void;
  onFocusCurrentStation?: () => void;
}

export function PlayerBar({
  currentStation,
  isRandomMode,
  isCurrentFavorite,
  hasStations,
  onToggleRandom,
  onChangeStation,
  onToggleFavorite,
  onFocusCurrentStation,
}: PlayerBarProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isBuffering, setIsBuffering] = useState(false);
  const [hasError, setHasError] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(0.85);
  const triedProxyRef = useRef(false);
  const hasAttemptedGlobalStartRef = useRef(false);

  const streamUrl = currentStation ? resolveStreamUrl(currentStation) : '';

  // Sync volume & mute to audio element
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.volume = volume;
    audio.muted = isMuted;
  }, [volume, isMuted]);

  // Load & play whenever currentStation changes
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !currentStation || !streamUrl) return;

    triedProxyRef.current = streamUrl.startsWith('/api/stream');
    setHasError(false);
    setAutoplayBlocked(false);
    setIsBuffering(true);
    audio.src = streamUrl;
    audio.load();

    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentStation.name,
        artist: 'World Radio',
        album: getStationLocationLabel(currentStation),
      });
    }

    audio
      .play()
      .then(() => {
        setIsPlaying(true);
        setAutoplayBlocked(false);
      })
      .catch((err: unknown) => {
        setIsPlaying(false);
        setIsBuffering(false);
        if (err instanceof DOMException && err.name === 'NotAllowedError') {
          setAutoplayBlocked(true);
        }
      });
  }, [currentStation, streamUrl]);

  // First user click starts playback if browser blocked initial autoplay
  useEffect(() => {
    if (!streamUrl || !autoplayBlocked) return;

    const handleFirstInteraction = () => {
      if (hasAttemptedGlobalStartRef.current) return;
      hasAttemptedGlobalStartRef.current = true;
      const audio = audioRef.current;
      if (audio && audio.paused && streamUrl) {
        if (!audio.src) audio.src = streamUrl;
        setIsBuffering(true);
        audio
          .play()
          .then(() => {
            setIsPlaying(true);
            setAutoplayBlocked(false);
            setHasError(false);
          })
          .catch(() => {
            setIsBuffering(false);
          });
      }
    };

    document.addEventListener('click', handleFirstInteraction, { once: true });
    return () => {
      document.removeEventListener('click', handleFirstInteraction);
    };
  }, [streamUrl, autoplayBlocked]);

  const handlePlayPause = () => {
    const audio = audioRef.current;
    if (!audio || !currentStation || !streamUrl) return;

    if (audio.paused) {
      setHasError(false);
      setAutoplayBlocked(false);
      setIsBuffering(true);
      if (!audio.src) {
        audio.src = streamUrl;
      }
      audio
        .play()
        .then(() => {
          setIsPlaying(true);
        })
        .catch(() => {
          // Try proxy stream once if direct stream rejected playback
          const proxyUrl = getProxyStreamUrl(currentStation);
          if (!triedProxyRef.current && proxyUrl && audio.src !== proxyUrl) {
            triedProxyRef.current = true;
            audio.src = proxyUrl;
            audio.load();
            audio
              .play()
              .then(() => setIsPlaying(true))
              .catch(() => {
                setIsPlaying(false);
                setIsBuffering(false);
                setHasError(true);
              });
          } else {
            setIsPlaying(false);
            setIsBuffering(false);
            setHasError(true);
          }
        });
    } else {
      audio.pause();
      setIsPlaying(false);
      setIsBuffering(false);
    }
  };

  const handleAudioError = () => {
    const audio = audioRef.current;
    if (!audio || !currentStation) return;

    const proxyUrl = getProxyStreamUrl(currentStation);
    if (!triedProxyRef.current && proxyUrl) {
      triedProxyRef.current = true;
      setIsBuffering(true);
      audio.src = proxyUrl;
      audio.load();
      audio.play().catch(() => {
        setIsBuffering(false);
        setIsPlaying(false);
        setHasError(true);
      });
      return;
    }

    setIsBuffering(false);
    setIsPlaying(false);
    if (streamUrl) setHasError(true);
  };

  const subtitleText = hasError
    ? 'Stream indisponível — tente outra estação'
    : autoplayBlocked
      ? 'Toque em ▶ ou em uma rádio no mapa'
      : isBuffering
        ? 'Conectando transmissão...'
        : currentStation
          ? getStationLocationLabel(currentStation)
          : 'Conectando à rede global de rádios';

  return (
    <div
      role="region"
      aria-label="Player de rádio"
      className="fixed bottom-3 sm:bottom-5 left-1/2 -translate-x-1/2 z-[1000] w-[calc(100vw-24px)] max-w-[440px] bg-slate-900/95 text-slate-100 px-3.5 py-2.5 rounded-2xl border border-white/15 shadow-2xl backdrop-blur-md flex flex-col gap-2"
    >
      <audio
        ref={audioRef}
        playsInline
        onPlay={() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
          setHasError(false);
        }}
        onPlaying={() => {
          setIsPlaying(true);
          setIsBuffering(false);
          setHasError(false);
        }}
        onPause={() => {
          setIsPlaying(false);
          setIsBuffering(false);
        }}
        onWaiting={() => setIsBuffering(true)}
        onCanPlay={() => setIsBuffering(false)}
        onError={handleAudioError}
      />

      {/* Station header + Favorite action */}
      <div className="flex items-center justify-between gap-2 min-w-0">
        <button
          type="button"
          onClick={onFocusCurrentStation}
          disabled={!currentStation}
          title="Centralizar mapa nesta estação"
          className="min-w-0 flex-1 text-left cursor-pointer disabled:cursor-default group"
        >
          <div className="text-[13px] font-semibold text-emerald-400 group-hover:text-emerald-300 truncate leading-tight">
            {currentStation ? currentStation.name : 'Carregando estações...'}
          </div>
          <div
            className={`text-[11px] truncate leading-tight mt-0.5 ${
              hasError ? 'text-rose-300' : autoplayBlocked ? 'text-amber-300' : 'text-slate-400'
            }`}
          >
            {subtitleText}
          </div>
        </button>

        {currentStation && (
          <button
            type="button"
            onClick={() => onToggleFavorite(currentStation)}
            aria-label={isCurrentFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
            title={isCurrentFavorite ? 'Remover dos favoritos' : 'Salvar nos favoritos'}
            className={`shrink-0 h-8 px-2.5 rounded-lg border text-xs font-semibold flex items-center gap-1.5 transition-colors duration-150 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 ${
              isCurrentFavorite
                ? 'bg-amber-500/20 text-amber-300 border-amber-400/50 hover:bg-amber-500/30'
                : 'bg-white/5 text-slate-300 border-white/15 hover:bg-white/10 hover:text-white'
            }`}
          >
            <Heart
              className={`w-3.5 h-3.5 ${isCurrentFavorite ? 'fill-amber-400 text-amber-400' : ''}`}
            />
            <span className="hidden sm:inline">{isCurrentFavorite ? 'Salva' : 'Favoritar'}</span>
          </button>
        )}
      </div>

      {/* Player controls */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={onToggleRandom}
            title={
              isRandomMode
                ? 'Modo aleatório global ativado (clique para priorizar SP)'
                : 'Modo aleatório global desativado (prioriza SP; clique para ativar global)'
            }
            className={`h-8 px-2.5 rounded-full border text-[11px] font-semibold flex items-center gap-1.5 transition-colors duration-150 shrink-0 cursor-pointer whitespace-nowrap focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-400 ${
              isRandomMode
                ? 'bg-blue-600 text-white border-blue-500 shadow-[0_0_10px_rgba(59,130,246,0.55)]'
                : 'bg-white/8 text-slate-300 border-white/15 hover:bg-emerald-600 hover:text-white hover:border-emerald-500'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span className="font-mono tabular-nums">{isRandomMode ? 'ON' : 'OFF'}</span>
          </button>

          <button
            type="button"
            onClick={onFocusCurrentStation}
            disabled={!currentStation}
            title="Focar na rádio atual"
            aria-label="Focar na rádio atual"
            className="w-8 h-8 rounded-full bg-white/8 text-emerald-300 border border-white/15 flex items-center justify-center hover:bg-emerald-600 hover:text-white hover:border-emerald-500 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150 shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <LocateFixed className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => onChangeStation(-1)}
            disabled={!hasStations}
            title="Estação Anterior"
            aria-label="Estação Anterior"
            className="w-8 h-8 rounded-full bg-white/8 text-slate-200 border border-white/15 flex items-center justify-center hover:bg-emerald-600 hover:text-white hover:border-emerald-500 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>

          <button
            type="button"
            onClick={handlePlayPause}
            disabled={!streamUrl}
            aria-label={isPlaying ? 'Pausar rádio' : 'Tocar rádio'}
            title={isPlaying ? 'Pausar' : 'Tocar'}
            className="w-9 h-9 rounded-full bg-emerald-500 text-slate-950 flex items-center justify-center hover:bg-emerald-400 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150 shadow-md cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-300"
          >
            {isBuffering ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-4 h-4 fill-current" />
            ) : (
              <Play className="w-4 h-4 fill-current ml-0.5" />
            )}
          </button>

          <button
            type="button"
            onClick={() => onChangeStation(1)}
            disabled={!hasStations}
            title="Próxima Estação"
            aria-label="Próxima Estação"
            className="w-8 h-8 rounded-full bg-white/8 text-slate-200 border border-white/15 flex items-center justify-center hover:bg-emerald-600 hover:text-white hover:border-emerald-500 disabled:opacity-40 disabled:pointer-events-none transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            <ChevronRight className="w-4 h-4" />
          </button>
        </div>

        {/* Volume control */}
        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setIsMuted((m) => !m)}
            aria-label={isMuted ? 'Ativar som' : 'Silenciar'}
            title={isMuted ? 'Ativar som' : 'Silenciar'}
            className="w-8 h-8 rounded-full bg-white/8 text-slate-300 border border-white/15 flex items-center justify-center hover:bg-white/15 hover:text-white transition-colors duration-150 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="w-3.5 h-3.5" />
            ) : (
              <Volume2 className="w-3.5 h-3.5" />
            )}
          </button>
          <input
            type="range"
            min={0}
            max={1}
            step={0.05}
            value={isMuted ? 0 : volume}
            onChange={(e) => {
              const nextVal = parseFloat(e.target.value);
              setVolume(nextVal);
              if (nextVal > 0 && isMuted) setIsMuted(false);
            }}
            aria-label="Volume"
            className="hidden sm:block w-16 accent-emerald-500 cursor-pointer"
          />
        </div>
      </div>
    </div>
  );
}
