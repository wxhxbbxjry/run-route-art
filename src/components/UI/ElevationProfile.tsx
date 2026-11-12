'use client';

import React, { useState, useRef, useId } from 'react';
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
  const rawGradId = useId();
  const gradId = `elev-grad-${rawGradId.replace(/:/g, '')}`;

  if (!profile || profile.length < 2) {
    return (
      <div className="p-3 text-center text-xs text-slate-600 dark:text-slate-400 strava-card rounded-2xl font-medium">
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

  // Handle interactive scrubbing
  const handleMouseMove = (e: React.MouseEvent<SVGSVGElement>) => {
    if (!svgRef.current || distanceKm <= 0) return;
    const rect = svgRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const ratio = Math.max(0, Math.min(1, clientX / rect.width));
    const distAtCursor = ratio * distanceKm;

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

  const hoverY = hoverData
    ? height - paddingY - ((hoverData.elevationM - minEle) / eleSpan) * (height - 2 * paddingY)
    : 0;

  return (
    <div className="strava-card p-3.5 rounded-2xl space-y-2.5 text-slate-900 dark:text-slate-100">
      {/* Header with stats */}
      <div className="flex items-center justify-between text-xs gap-2">
        <div className="flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-100 min-w-0">
          <Mountain className="w-4 h-4 text-[#fc4c02] shrink-0" />
          <span className="whitespace-nowrap">Profil Elevasi</span>
          {hoverData && (
            <span className="text-[10px] text-[#c93b00] dark:text-orange-300 font-mono font-bold bg-orange-50 dark:bg-orange-950/60 px-2 py-0.5 rounded-lg border border-orange-200 dark:border-orange-500/40 tabular-nums whitespace-nowrap ui-fade-slide-up">
              {displayDist(hoverData.distKm)} &bull; {displayElevation(hoverData.elevationM)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-2 text-[11px] shrink-0 tabular-nums">
          <span className="flex items-center gap-0.5 text-emerald-700 dark:text-emerald-400 font-bold">
            <ArrowUpRight className="w-3.5 h-3.5" /> +{isMiles ? metersToFeet(gainM) + 'ft' : gainM + 'm'}
          </span>
          <span className="flex items-center gap-0.5 text-rose-600 dark:text-rose-400 font-bold">
            <ArrowDownRight className="w-3.5 h-3.5" /> -{isMiles ? metersToFeet(lossM) + 'ft' : lossM + 'm'}
          </span>
          <span className="text-slate-500 dark:text-slate-400 font-mono hidden sm:inline">
            {displayElevation(minEle)}&ndash;{displayElevation(maxEle)}
          </span>
        </div>
      </div>

      {/* Interactive Strava-Style Elevation Chart */}
      <div className="relative w-full overflow-hidden rounded-xl bg-slate-50 dark:bg-slate-800/80 p-1.5 border border-slate-200 dark:border-slate-700 hover:border-orange-300 dark:hover:border-orange-500/40 transition-colors duration-150 cursor-crosshair">
        <svg
          ref={svgRef}
          viewBox={`0 0 ${width} ${height}`}
          className="w-full h-20 overflow-visible"
          preserveAspectRatio="none"
          onMouseMove={handleMouseMove}
          onMouseLeave={handleMouseLeave}
        >
          <defs>
            <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#fc4c02" stopOpacity="0.34" />
              <stop offset="100%" stopColor="#fc4c02" stopOpacity="0.03" />
            </linearGradient>
          </defs>

          {/* Area fill */}
          <path d={areaD} fill={`url(#${gradId})`} />

          {/* Line stroke */}
          <path
            d={pathD}
            fill="none"
            stroke="#fc4c02"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          />

          {/* Vertical scrubber line on hover */}
          {hoverData && (
            <>
              <line
                x1={hoverData.x}
                y1={0}
                x2={hoverData.x}
                y2={height}
                className="stroke-slate-700 dark:stroke-slate-200"
                strokeWidth="1.25"
                strokeDasharray="3,3"
              />
              <circle
                cx={hoverData.x}
                cy={hoverY}
                r="8"
                fill="#fc4c02"
                fillOpacity="0.22"
              />
              <circle
                cx={hoverData.x}
                cy={hoverY}
                r="4.5"
                fill="#fc4c02"
                stroke="#ffffff"
                strokeWidth="2"
              />
            </>
          )}

          {/* Distance baseline */}
          <line
            x1={paddingX}
            y1={height - 2}
            x2={width - paddingX}
            y2={height - 2}
            className="stroke-slate-300 dark:stroke-slate-700"
            strokeWidth="1"
          />
        </svg>

        <div className="flex justify-between text-[10px] text-slate-500 dark:text-slate-400 font-mono font-medium px-1.5 mt-1 tabular-nums">
          <span>0 {unitSystem} (Start)</span>
          <span>{displayDist(distanceKm / 2)}</span>
          <span>{displayDist(distanceKm)} (Finish)</span>
        </div>
      </div>
    </div>
  );
}
