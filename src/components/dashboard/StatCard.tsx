import React from 'react';

interface StatCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: 'orange' | 'emerald' | 'slate' | 'amber' | 'red';
}

export function StatCard({ label, value, subtext, icon: Icon, tone = 'orange' }: StatCardProps) {
  const toneClasses = {
    orange: 'bg-orange-50 dark:bg-orange-950/40 text-orange-600 dark:text-orange-400',
    emerald: 'bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400',
    slate: 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300',
    amber: 'bg-amber-50 dark:bg-amber-950/40 text-amber-600 dark:text-amber-400',
    red: 'bg-red-50 dark:bg-red-950/40 text-red-600 dark:text-red-400',
  }[tone];

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl p-5 flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400 truncate">{label}</p>
        <p className="text-2xl font-extrabold text-slate-950 dark:text-white font-mono tabular-nums mt-1.5">
          {value}
        </p>
        {subtext && (
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 truncate">{subtext}</p>
        )}
      </div>
      <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${toneClasses}`}>
        <Icon className="w-5 h-5" />
      </div>
    </div>
  );
}
