export interface RadioStation {
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
  votes?: number;
  savedAt?: number;
}

export interface ContinentPreset {
  id: string;
  label: string;
  emoji: string;
  lat: number;
  lng: number;
  zoom: number;
  isGlobal?: boolean;
}

export const CONTINENT_PRESETS: ContinentPreset[] = [
  { id: 'global', label: 'GLOBAL', emoji: '🌍', lat: 20, lng: 0, zoom: 2, isGlobal: true },
  { id: 'south-america', label: 'América do Sul', emoji: '🌎', lat: -20.5, lng: -48.5, zoom: 5 },
  { id: 'north-america', label: 'América do Norte', emoji: '🌎', lat: 40.0, lng: -100.0, zoom: 4 },
  { id: 'central-america', label: 'América Central', emoji: '🌎', lat: 15.0, lng: -88.0, zoom: 5 },
  { id: 'europe', label: 'Europa', emoji: '🌍', lat: 50.0, lng: 10.0, zoom: 4 },
  { id: 'africa', label: 'África', emoji: '🌍', lat: 0.0, lng: 20.0, zoom: 3 },
  { id: 'asia-oceania', label: 'Ásia e Oceania', emoji: '🌏', lat: 15.0, lng: 125.0, zoom: 4 },
];
