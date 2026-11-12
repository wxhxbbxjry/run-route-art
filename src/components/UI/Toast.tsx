'use client';

import React from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

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
      className="fixed top-[76px] right-[68px] md:top-auto md:bottom-5 md:right-5 z-50 flex flex-col gap-2 max-w-xs w-[calc(100%-5.25rem)] md:w-80 pointer-events-none"
    >
      {toasts.map((toast) => {
        const accentStripe =
          toast.type === 'success'
            ? 'border-l-emerald-500 border-emerald-200 dark:border-emerald-700/70'
            : toast.type === 'error'
            ? 'border-l-rose-500 border-rose-200 dark:border-rose-700/70'
            : toast.type === 'warning'
            ? 'border-l-amber-500 border-amber-200 dark:border-amber-700/70'
            : 'border-l-[#fc4c02] border-orange-200 dark:border-orange-700/70';

        const barColor =
          toast.type === 'success'
            ? 'bg-emerald-500'
            : toast.type === 'error'
            ? 'bg-rose-500'
            : toast.type === 'warning'
            ? 'bg-amber-500'
            : 'bg-[#fc4c02]';

        return (
          <div
            key={toast.id}
            className={`pointer-events-auto relative overflow-hidden p-3.5 rounded-2xl cockpit-card border border-l-4 flex items-start gap-3 ui-toast-enter ui-toast-card ${accentStripe}`}
          >
            <div className="mt-0.5 shrink-0" aria-hidden="true">
              {toast.type === 'success' && (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
              )}
              {toast.type === 'error' && (
                <AlertTriangle className="w-5 h-5 text-rose-600 dark:text-rose-400" />
              )}
              {toast.type === 'warning' && (
                <AlertTriangle className="w-5 h-5 text-amber-600 dark:text-amber-400" />
              )}
              {toast.type === 'info' && <Info className="w-5 h-5 text-[#fc4c02]" />}
            </div>

            <div className="flex-1 text-xs min-w-0">
              <h4 className="font-extrabold text-[var(--text-primary)] leading-tight">
                {toast.title}
              </h4>
              {toast.description && (
                <p className="text-[var(--text-secondary)] mt-0.5 leading-relaxed">
                  {toast.description}
                </p>
              )}
            </div>

            <button
              type="button"
              aria-label="Tutup notifikasi"
              onClick={() => onDismiss(toast.id)}
              className="w-7 h-7 flex items-center justify-center text-[var(--text-muted)] hover:text-[var(--text-primary)] rounded-lg hover:bg-[var(--surface-well)] shrink-0 ui-btn-secondary ui-focus-ring"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>

            <span
              aria-hidden="true"
              className={`absolute bottom-0 left-0 right-0 h-[2px] opacity-80 ui-toast-progress ${barColor}`}
            />
          </div>
        );
      })}
    </div>
  );
}
