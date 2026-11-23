import React, { createContext, useCallback, useContext, useState } from 'react';
import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react';

type ToastKind = 'success' | 'error' | 'info';

interface ToastItem {
  id: string;
  title: string;
  description?: string;
  kind: ToastKind;
}

interface ToastContextValue {
  notify: (title: string, kind?: ToastKind, description?: string) => void;
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined);

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);

  const remove = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const notify = useCallback(
    (title: string, kind: ToastKind = 'info', description?: string) => {
      const id = `${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      setItems((prev) => [...prev.slice(-3), { id, title, description, kind }]);
      window.setTimeout(() => remove(id), 4500);
    },
    [remove]
  );

  return (
    <ToastContext.Provider value={{ notify }}>
      {children}
      <div className="fixed bottom-5 right-5 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0">
        {items.map((item) => (
          <div
            key={item.id}
            className={`pointer-events-auto flex items-start gap-3 p-4 rounded-xl border shadow-lg bg-white dark:bg-slate-900 transition-all ${
              item.kind === 'success'
                ? 'border-emerald-200 dark:border-emerald-800'
                : item.kind === 'error'
                  ? 'border-red-200 dark:border-red-800'
                  : 'border-slate-200 dark:border-slate-800'
            }`}
          >
            {item.kind === 'success' && <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />}
            {item.kind === 'error' && <AlertCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />}
            {item.kind === 'info' && <Info className="w-5 h-5 text-orange-600 shrink-0 mt-0.5" />}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.title}</p>
              {item.description && (
                <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">{item.description}</p>
              )}
            </div>
            <button
              type="button"
              onClick={() => remove(item.id)}
              className="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
              aria-label="Dismiss notification"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx;
}
