'use client';

import React from 'react';
import { X } from 'lucide-react';

export interface ToastMessage {
  id: string;
  type: 'success' | 'warning' | 'info' | 'error';
  title: string;
  description?: string;
}

interface ToastProps {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: ToastProps) {
  if (toasts.length === 0) return null;

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed top-[76px] left-3 right-[64px] md:top-auto md:bottom-4 md:left-auto md:right-4 z-50 flex flex-col items-start md:items-end gap-1.5 pointer-events-none"
    >
      {toasts.map((toast) => {
        const dotColor =
          toast.type === 'success'
            ? 'bg-emerald-400'
            : toast.type === 'error'
            ? 'bg-rose-400'
            : toast.type === 'warning'
            ? 'bg-amber-400'
            : 'bg-[#fc4c02]';

        return (
          <div
            key={toast.id}
            className="pointer-events-auto cockpit-card flex items-center gap-2.5 w-fit max-w-[min(340px,100%)] px-3 py-2 rounded-xl border border-[var(--border-strong)] shadow-[0_8px_24px_rgba(0,0,0,0.55)] ui-toast-enter"
          >
            <span
              aria-hidden="true"
              className={`w-2 h-2 rounded-full shrink-0 ${dotColor}`}
            />

            <div className="min-w-0 text-xs">
              <p className="font-bold text-slate-100 leading-tight truncate">
                {toast.title}
              </p>
              {toast.description && (
                <p className="text-[11px] text-slate-400 leading-snug mt-0.5 line-clamp-2">
                  {toast.description}
                </p>
              )}
            </div>

            <button
              type="button"
              aria-label="Tutup notifikasi"
              onClick={() => onDismiss(toast.id)}
              className="w-6 h-6 -mr-0.5 flex items-center justify-center text-slate-400 hover:text-slate-100 rounded-lg hover:bg-slate-800/80 shrink-0 transition-colors ui-focus-ring"
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
