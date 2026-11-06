'use client';

import React, { useState, useRef } from 'react';
import { ElevationPoint, UnitSystem } from '@/lib/types';
import { Mountain, ArrowUpRight, ArrowDownRight } from 'lucide-react';
import { kmToMiles, metersToFeet } from '@/lib/geo';

interface ElevationProfileProps {
  profile: ElevationPoint[];
  gainM: number;
  lossM: number;
  distanceKm: number;
  unitSystem?: UnitSystem;
  onHoverDistance?: (distKm: number | null) => void;
}

export default function ElevationProfile({
  profile,
  gainM,
  lossM,
  distanceKm,
  unitSystem = 'km',
  onHoverDistance,
}: ElevationProfileProps) {
  const [hoverData, setHoverData] = useState<{
    x: number;
    distKm: number;
    elevationM: number;
  } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);

  if (!profile || profile.length < 2) {
    return (
      <div className="p-3 text-center text-xs text-slate-400 glass-panel rounded-xl">
        Tambahkan waypoint untuk melihat profil elevasi rute.
      </div>
    );
  }

  // Find min and max elevation for SVG scaling
  const elevations = profile.map((p) => p.elevationM);
  const minEle = Math.min(...elevations);
  const maxEle = Math.max(...elevations);
  const eleSpan = Math.max(10, maxEle - minEle);

  // SVG dimensions
  const width = 360;
  const height = 90;
  const paddingX = 10;
  const paddingY = 10;

  // Build SVG path
  const points = profile.map((pt) => {
    const x = paddingX + (pt.distanceKm / (distanceKm || 1)) * (width - 2 * paddingX);
    const y =
      height - paddingY - ((pt.elevationM - minEle) / eleSpan) * (height - 2 * paddingY);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const pathD = `M ${points.join(' L ')}`;
  const areaD = `${pathD} L ${width - paddingX},${height} L ${paddingX},${height} Z`;

  // Handle interactive scrubbing (OnTheGoMap style)
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || distanceKm <= 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));
    const distAtCursor = ratio * distanceKm;

    // Find closest elevation point
    let closest = profile[0];
    let minDiff = Math.abs(profile[0].distanceKm - distAtCursor);

    for (let i = 1; i < profile.length; i++) {
      const diff = Math.abs(profile[i].distanceKm - distAtCursor);
      if (diff < minDiff) {
        minDiff = diff;
        closest = profile[i];
      }
    }

    const svgX = paddingX + (closest.distanceKm / (distanceKm || 1)) * (width - 2 * paddingX);
    setHoverData({
      x: svgX,
      distKm: closest.distanceKm,
      elevationM: closest.elevationM,
    });

    onHoverDistance?.(closest.distanceKm);
  };

  const handleMouseLeave = () => {
    setHoverData(null);
    onHoverDistance?.(null);
  };

  const isMiles = unitSystem === 'mi';
  const displayDist = (km: number) =>
    isMiles ? `${kmToMiles(km).toFixed(2)} mi` : `${km.toFixed(2)} km`;
  const displayElevation = (m: number) =>
    isMiles ? `${metersToFeet(m)} ft` : `${m} m`;

  return (
    <div className="glass-panel p-3.5 rounded-2xl border border-slate-700/60 shadow-xl space-y-2.5">
      {/* Header with stats */}
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 font-semibold text-slate-200">
          <Mountain className="w-4 h-4 text-emerald-400" />
          <span>Profil Elevasi</span>
          {hoverData && (
            <span className="text-[10px] text-lime-400 font-mono font-bold bg-lime-500/10 px-2 py-0.5 rounded border border-lime-500/30">
              {displayDist(hoverData.distKm)} &bull; {displayElevation(hoverData.elevationM)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3 text-[11px]">
          <span className="flex items-center gap-0.5 text-emerald-400 font-medium">
            <ArrowUpRight className="w-3.5 h-3.5" /> +{isMiles ? metersToFeet(gainM) + 'ft' : gainM + 'm'}
          </span>
          <span className="flex items-center gap-0.5 text-rose-400 font-medium">
            <ArrowDownRight className="w-3.5 h-3.5" /> -{isMiles ? metersToFeet(lossM) + 'ft' : lossM + 'm'}
          </span>
          <span className="text-slate-400">
            {displayElevation(minEle)} &ndash; {displayElevation(maxEle)}
          </span>
        </div>
      </div>

      {/* Interactive SVG Chart */}
      <div className="relative w-full overflow-hidden rounded-xl bg-slate-950/60 p-1 border border-slate-800/80 cursor-crosshair">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-20 overflow-visible"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id="elevationGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.45" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0.0" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill="url(#elevationGrad)" />

          {/* Line stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="#10b981"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Vertical scrubber line on hover (OnTheGoMap feature) */}
          {hoverData && (
            <>
              <line
                x1={hoverData.x}
                y1={0}
                x2={hoverData.x}
                y2={height}
                stroke="#a3e635"
                strokeWidth="2"
                strokeDasharray="3,3"
              />
              <circle
                cx={hoverData.x}
                cy={
                  height -
                  paddingY -
                  ((hoverData.elevationM - minEle) / eleSpan) * (height - 2 * paddingY)
                }
                r="4.5"
                fill="#a3e635"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </>
          )}

          {/* Distance tick marks */}
          <line
            x1={paddingX}
            y1={height - 2}
            x2={width - paddingX}
            y2={height - 2}
            stroke="#334155"
            strokeWidth="1"
          />
        </svg>

        <div className="flex justify-between text-[10px] text-slate-500 px-2 mt-1">
          <span>0 {unitSystem} (Start)</span>
          <span>{displayDist(distanceKm / 2)}</span>
          <span>{displayDist(distanceKm)} (Finish)</span>
        </div>
      </div>
    </div>
  );
}
