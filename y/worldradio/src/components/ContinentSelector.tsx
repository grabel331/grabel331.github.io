import { useState } from 'react';
import { ChevronDown, ChevronUp, Globe } from 'lucide-react';
import { CONTINENT_PRESETS, type ContinentPreset } from '../types/radio';

interface ContinentSelectorProps {
  activeContinentId: string;
  onSelectContinent: (preset: ContinentPreset) => void;
}

export function ContinentSelector({ activeContinentId, onSelectContinent }: ContinentSelectorProps) {
  const [collapsedOnMobile, setCollapsedOnMobile] = useState(true);

  return (
    <aside
      aria-label="Navegação por continentes"
      className="fixed top-[104px] left-3 z-[900] flex flex-col gap-1.5"
    >
      {/* Mobile collapse toggle so map stays open on small screens */}
      <button
        type="button"
        onClick={() => setCollapsedOnMobile((prev) => !prev)}
        className="sm:hidden flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-slate-900/92 text-slate-100 border border-white/15 shadow-lg backdrop-blur-md text-xs font-semibold whitespace-nowrap"
        aria-expanded={!collapsedOnMobile}
      >
        <span className="flex items-center gap-1.5">
          <Globe className="w-3.5 h-3.5 text-emerald-400" />
          Regiões
        </span>
        {collapsedOnMobile ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronUp className="w-3.5 h-3.5" />}
      </button>

      <div
        className={`${
          collapsedOnMobile ? 'hidden sm:flex' : 'flex'
        } flex-col gap-1.5`}
      >
        {CONTINENT_PRESETS.map((preset) => {
          const isActive = activeContinentId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              onClick={() => {
                onSelectContinent(preset);
                setCollapsedOnMobile(true);
              }}
              className={`px-3 py-1.5 rounded-md text-xs font-semibold text-left border transition-colors duration-150 shadow-md backdrop-blur-md whitespace-nowrap min-w-[146px] flex items-center gap-2 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400 ${
                preset.isGlobal
                  ? isActive
                    ? 'bg-emerald-600 text-white border-emerald-400'
                    : 'bg-emerald-700/95 text-white border-emerald-600 hover:bg-emerald-600'
                  : isActive
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-900/90 text-slate-100 border-white/15 hover:bg-emerald-600 hover:border-emerald-500 hover:text-white'
              }`}
            >
              <span aria-hidden="true">{preset.emoji}</span>
              <span>{preset.label}</span>
            </button>
          );
        })}
      </div>
    </aside>
  );
}
