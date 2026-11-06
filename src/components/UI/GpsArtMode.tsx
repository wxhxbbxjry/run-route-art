'use client';

import React from 'react';
import { LatLng, GpsShapeKey, RouteData } from '@/lib/types';
import { GPS_SHAPES } from '@/lib/shapes';
import {
  Heart,
  Star,
  Box,
  Footprints,
  Sparkles,
  RotateCw,
  Maximize,
  Compass,
  Crosshair,
  Zap,
} from 'lucide-react';

interface GpsArtModeProps {
  selectedShape: GpsShapeKey;
  onSelectShape: (shape: GpsShapeKey) => void;
  centerLocation: LatLng | null;
  onUseMyLocation: () => void;
  scaleKm: number;
  onScaleChange: (scale: number) => void;
  rotationDeg: number;
  onRotationChange: (rot: number) => void;
  showBlueprint: boolean;
  onToggleBlueprint: (show: boolean) => void;
  snapToRoads: boolean;
  onToggleSnap: (snap: boolean) => void;
  onGenerateArt: () => void;
  routeData: RouteData | null;
  isLoading: boolean;
}

const SHAPE_ICONS: Record<GpsShapeKey, React.ReactNode> = {
  heart: <Heart className="w-5 h-5" />,
  star: <Star className="w-5 h-5" />,
  cube: <Box className="w-5 h-5" />,
  cat: <Footprints className="w-5 h-5" />,
  dog: <Footprints className="w-5 h-5" />,
  crown: <Sparkles className="w-5 h-5" />,
};

export default function GpsArtMode({
  selectedShape,
  onSelectShape,
  centerLocation,
  onUseMyLocation,
  scaleKm,
  onScaleChange,
  rotationDeg,
  onRotationChange,
  showBlueprint,
  onToggleBlueprint,
  snapToRoads,
  onToggleSnap,
  onGenerateArt,
  routeData,
  isLoading,
}: GpsArtModeProps) {
  const currentShape = GPS_SHAPES[selectedShape];

  return (
    <div className="space-y-4">
      {routeData && (
        <div className="text-xs text-slate-300 bg-slate-950/70 p-2.5 rounded-xl border border-slate-800 flex items-center justify-between">
          <span className="text-slate-400">Jarak Rute GPS Art:</span>
          <span className="font-mono text-cyan-300 font-bold">{routeData.distanceKm.toFixed(2)} KM</span>
        </div>
      )}
      {/* Center Point Location Info */}
      <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-700/60 space-y-2">
        <div className="flex items-center justify-between text-xs">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5">
            <Compass className="w-4 h-4 text-cyan-400" /> Pusat Gambar GPS Art
          </span>
          <button
            onClick={onUseMyLocation}
            className="text-[11px] font-medium text-cyan-400 hover:text-cyan-300 flex items-center gap-1 transition"
          >
            <Crosshair className="w-3.5 h-3.5" /> Pakai Lokasi Saya
          </button>
        </div>

        <div className="text-xs bg-slate-950/70 p-2.5 rounded-lg border border-slate-800">
          {centerLocation ? (
            <p className="font-mono text-slate-200">
              Lat: {centerLocation.lat.toFixed(5)}, Lng: {centerLocation.lng.toFixed(5)}
            </p>
          ) : (
            <p className="text-cyan-400/90 italic">
              Klik peta untuk menentukan titik tengah gambar GPS art Anda.
            </p>
          )}
        </div>
      </div>

      {/* Shape Selector Grid */}
      <div className="space-y-2">
        <label className="text-xs font-semibold text-slate-300 block">
          Pilih Karakter / Bentuk GPS Art:
        </label>
        <div className="grid grid-cols-3 gap-2">
          {Object.values(GPS_SHAPES).map((shape) => {
            const isSelected = selectedShape === shape.id;
            return (
              <button
                key={shape.id}
                onClick={() => onSelectShape(shape.id)}
                className={`p-2.5 rounded-xl border flex flex-col items-center justify-center gap-1.5 transition text-center ${
                  isSelected
                    ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_14px_rgba(6,182,212,0.35)]'
                    : 'bg-slate-900/60 border-slate-800 text-slate-300 hover:bg-slate-800/80'
                }`}
              >
                <div className={isSelected ? 'text-cyan-400' : 'text-slate-400'}>
                  {SHAPE_ICONS[shape.id]}
                </div>
                <span className="text-[11px] font-bold leading-tight truncate w-full">
                  {shape.name}
                </span>
              </button>
            );
          })}
        </div>
        <p className="text-[11px] text-slate-400 italic px-1">
          {currentShape?.description}
        </p>
      </div>

      {/* Scale & Rotation Sliders */}
      <div className="p-3.5 rounded-xl bg-slate-900/60 border border-slate-800 space-y-3.5">
        {/* Scale Slider */}
        <div className="space-y-1.5">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <Maximize className="w-3.5 h-3.5 text-cyan-400" /> Ukuran Gambar
            </span>
            <span className="font-mono font-bold text-cyan-300 text-xs">
              {scaleKm.toFixed(1)} KM
            </span>
          </div>
          <input
            type="range"
            min="0.8"
            max="12"
            step="0.2"
            value={scaleKm}
            onChange={(e) => onScaleChange(parseFloat(e.target.value))}
            className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex justify-between text-[10px] text-slate-500 font-mono">
            <span>0.8 KM (Kelurahan)</span>
            <span>5 KM (Kecamatan)</span>
            <span>12 KM (Kota)</span>
          </div>
        </div>

        {/* Rotation Slider */}
        <div className="space-y-1.5 pt-1 border-t border-slate-800">
          <div className="flex justify-between items-center text-xs">
            <span className="text-slate-300 font-medium flex items-center gap-1.5">
              <RotateCw className="w-3.5 h-3.5 text-cyan-400" /> Rotasi Arah Gambar
            </span>
            <span className="font-mono font-bold text-cyan-300 text-xs">
              {rotationDeg}&deg;
            </span>
          </div>
          <input
            type="range"
            min="0"
            max="360"
            step="5"
            value={rotationDeg}
            onChange={(e) => onRotationChange(parseInt(e.target.value, 10))}
            className="w-full accent-cyan-400 bg-slate-800 h-2 rounded-lg cursor-pointer"
          />
          <div className="flex gap-1.5 justify-end text-[10px]">
            {[0, 45, 90, 180].map((deg) => (
              <button
                key={deg}
                onClick={() => onRotationChange(deg)}
                className={`px-2 py-0.5 rounded font-mono ${
                  rotationDeg === deg
                    ? 'bg-cyan-500/30 text-cyan-300'
                    : 'bg-slate-800 text-slate-400 hover:text-slate-200'
                }`}
              >
                {deg}&deg;
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Overlays & Snapping Toggles */}
      <div className="space-y-2">
        {/* Blueprint Toggle */}
        <div className="p-2.5 rounded-xl bg-slate-900/60 border border-slate-800 flex items-center justify-between">
          <div className="text-xs">
            <p className="font-semibold text-slate-200">Tampilkan Blueprint Garis</p>
            <p className="text-[11px] text-slate-400">Garis putus-putus neon cyan bentuk asli</p>
          </div>
          <button
            onClick={() => onToggleBlueprint(!showBlueprint)}
            className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
              showBlueprint ? 'bg-cyan-500' : 'bg-slate-700'
            }`}
          >
            <span
              className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-slate-950 shadow transition ${
                showBlueprint ? 'translate-x-4' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {/* Route Snapping Mode Selector */}
        <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-2">
          <p className="text-xs font-semibold text-slate-200">Presisi Bentuk Jalur Lari:</p>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => onToggleSnap(false)}
              className={`p-2.5 rounded-xl border text-left transition ${
                !snapToRoads
                  ? 'bg-cyan-500/20 border-cyan-400 text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.3)]'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <p className="font-bold text-[11px] leading-tight">Presisi 100% (Murni)</p>
              <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                Rekomendasi Strava Art: Gambar sempurna tanpa distorsi jalan.
              </p>
            </button>
            <button
              type="button"
              onClick={() => onToggleSnap(true)}
              className={`p-2.5 rounded-xl border text-left transition ${
                snapToRoads
                  ? 'bg-lime-500/20 border-lime-400 text-lime-300 shadow-[0_0_10px_rgba(163,230,53,0.3)]'
                  : 'bg-slate-950/60 border-slate-800 text-slate-400 hover:text-white'
              }`}
            >
              <p className="font-bold text-[11px] leading-tight">Snap Jalan Raya</p>
              <p className="text-[10px] text-slate-400 font-normal mt-0.5">
                Mengikuti jalan raya terdekat via OSRM.
              </p>
            </button>
          </div>
        </div>
      </div>

      {/* Generate Button */}
      <button
        onClick={onGenerateArt}
        disabled={!centerLocation || isLoading}
        className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 shadow-[0_0_20px_rgba(6,182,212,0.4)] transition active:scale-[0.98] disabled:opacity-40 disabled:pointer-events-none"
      >
        {isLoading ? (
          <Zap className="w-4 h-4 animate-spin" />
        ) : (
          <Sparkles className="w-4 h-4" />
        )}
        <span>{isLoading ? 'Menghitung Rute GPS Art...' : 'Rancang Rute GPS Art'}</span>
      </button>
    </div>
  );
}
