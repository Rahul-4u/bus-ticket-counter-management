import React, { useMemo, useState } from 'react';
import { ChevronLeft, ChevronRight, Search } from 'lucide-react';

export interface ColumnDef<T> {
  key: string;
  header: string;
  align?: 'left' | 'right';
  render: (row: T) => React.ReactNode;
}

interface DataTableProps<T> {
  title?: string;
  data: T[];
  columns: ColumnDef<T>[];
  searchPlaceholder?: string;
  searchPredicate?: (row: T, query: string) => boolean;
  filterOptions?: { label: string; value: string }[];
  filterPredicate?: (row: T, filterValue: string) => boolean;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  actionSlot?: React.ReactNode;
  pageSize?: number;
}

export function DataTable<T>({
  title,
  data,
  columns,
  searchPlaceholder = 'Search records...',
  searchPredicate,
  filterOptions,
  filterPredicate,
  loading = false,
  emptyTitle = 'No records found',
  emptyDescription = 'Records will appear here once created.',
  actionSlot,
  pageSize = 8,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [filterVal, setFilterVal] = useState('all');
  const [page, setPage] = useState(1);

  const filtered = useMemo(() => {
    let list = data;
    if (filterOptions && filterPredicate && filterVal !== 'all') {
      list = list.filter((row) => filterPredicate(row, filterVal));
    }
    if (search.trim() && searchPredicate) {
      const q = search.trim().toLowerCase();
      list = list.filter((row) => searchPredicate(row, q));
    }
    return list;
  }, [data, filterOptions, filterPredicate, filterVal, search, searchPredicate]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice((safePage - 1) * pageSize, safePage * pageSize);

  return (
    <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl overflow-hidden">
      {/* Toolbar */}
      <div className="p-4 sm:p-5 border-b border-slate-200 dark:border-slate-800 flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          {title && <h3 className="text-base font-bold text-slate-950 dark:text-white font-display">{title}</h3>}
          {searchPredicate && (
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                  setPage(1);
                }}
                placeholder={searchPlaceholder}
                className="h-9 pl-8 pr-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-orange-500/30"
              />
            </div>
          )}
          {filterOptions && (
            <select
              value={filterVal}
              onChange={(e) => {
                setFilterVal(e.target.value);
                setPage(1);
              }}
              className="h-9 px-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-xs font-medium text-slate-800 dark:text-slate-200"
            >
              <option value="all">All Statuses</option>
              {filterOptions.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          )}
        </div>

        {actionSlot && <div className="shrink-0">{actionSlot}</div>}
      </div>

      {/* Table */}
      {loading ? (
        <div className="p-6 space-y-3">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-10 rounded-lg bg-slate-100 dark:bg-slate-800 animate-pulse" />
          ))}
        </div>
      ) : pageRows.length === 0 ? (
        <div className="p-10 text-center">
          <p className="text-sm font-bold text-slate-900 dark:text-white">{emptyTitle}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{emptyDescription}</p>
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 text-[11px] font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={`px-4 py-3 whitespace-nowrap ${col.align === 'right' ? 'text-right' : 'text-left'}`}
                  >
                    {col.header}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800 text-xs">
              {pageRows.map((row, idx) => (
                <tr key={idx} className="hover:bg-slate-50/80 dark:hover:bg-slate-800/40 transition-colors">
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`px-4 py-3 whitespace-nowrap text-slate-700 dark:text-slate-200 ${
                        col.align === 'right' ? 'text-right' : 'text-left'
                      }`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Pagination */}
      {filtered.length > pageSize && (
        <div className="px-4 py-3 border-t border-slate-200 dark:border-slate-800 flex items-center justify-between text-xs text-slate-500 dark:text-slate-400">
          <span className="tabular-nums">
            Showing {(safePage - 1) * pageSize + 1}-{Math.min(safePage * pageSize, filtered.length)} of {filtered.length}
          </span>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={safePage <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <span className="px-2 font-mono tabular-nums">
              {safePage}/{totalPages}
            </span>
            <button
              type="button"
              disabled={safePage >= totalPages}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-700 disabled:opacity-40 cursor-pointer"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
