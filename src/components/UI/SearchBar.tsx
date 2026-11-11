'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Search, MapPin, X, Loader2 } from 'lucide-react';
import { LatLng } from '@/lib/types';

interface SearchBarProps {
  onSelectLocation: (latlng: LatLng, displayName: string) => void;
}

interface NominatimResult {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type: string;
}

export default function SearchBar({ onSelectLocation }: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<NominatimResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const searchTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (query.trim().length < 3) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    if (searchTimeoutRef.current) {
      clearTimeout(searchTimeoutRef.current);
    }

    setIsLoading(true);
    searchTimeoutRef.current = setTimeout(async () => {
      try {
        const url = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(
          query
        )}&limit=5`;
        const res = await fetch(url, {
          headers: {
            Accept: 'application/json',
          },
        });
        if (res.ok) {
          const data = await res.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch (err) {
        console.warn('Geocoding error:', err);
      } finally {
        setIsLoading(false);
      }
    }, 450);

    return () => {
      if (searchTimeoutRef.current) clearTimeout(searchTimeoutRef.current);
    };
  }, [query]);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleSelect = (item: NominatimResult) => {
    const lat = parseFloat(item.lat);
    const lng = parseFloat(item.lon);
    onSelectLocation({ lat, lng }, item.display_name);
    setQuery(item.display_name.split(',')[0]);
    setIsOpen(false);
  };

  return (
    <div ref={containerRef} className="relative w-full">
      <div className="relative flex items-center rounded-2xl strava-card focus-within:border-[#fc4c02] transition overflow-hidden">
        <div className="pl-3.5 pr-2 text-slate-400">
          {isLoading ? (
            <Loader2 className="w-4 h-4 animate-spin text-[#fc4c02]" />
          ) : (
            <Search className="w-4 h-4" />
          )}
        </div>

        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => {
            if (results.length > 0) setIsOpen(true);
          }}
          placeholder="Cari lokasi lari (misal: GBK, Monas, UI)..."
          className="w-full py-2.5 pr-8 bg-transparent text-xs font-medium text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 focus:outline-none"
        />

        {query && (
          <button
            onClick={() => {
              setQuery('');
              setResults([]);
              setIsOpen(false);
            }}
            className="absolute right-2.5 p-1 text-slate-400 hover:text-slate-800 dark:hover:text-white"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        )}
      </div>

      {isOpen && results.length > 0 && (
        <div className="absolute left-0 right-0 top-12 mt-1 rounded-2xl strava-card overflow-hidden z-50 animate-in fade-in slide-in-from-top-2">
          <ul className="py-1 divide-y divide-slate-100 dark:divide-slate-800">
            {results.map((res) => (
              <li key={res.place_id}>
                <button
                  onClick={() => handleSelect(res)}
                  className="w-full text-left px-3.5 py-2.5 hover:bg-orange-50/70 dark:hover:bg-slate-800 flex items-start gap-2.5 transition text-xs group"
                >
                  <MapPin className="w-4 h-4 text-[#fc4c02] shrink-0 mt-0.5 group-hover:scale-110 transition" />
                  <span className="text-slate-700 dark:text-slate-200 group-hover:text-slate-950 dark:group-hover:text-white font-medium leading-snug line-clamp-2">
                    {res.display_name}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}
