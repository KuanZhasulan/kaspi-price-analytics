'use client';

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { Badge } from '@/components/ui/badge';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { PricePoint } from '@/app/api/prices/route';

// Use literal colors for SVG / Recharts (CSS vars don't resolve in SVG attributes)
const C = {
  teal: '#2dd4bf',
  tealDim: 'rgba(45,212,191,0.15)',
  green: '#4ade80',
  red: '#f87171',
  grid: 'rgba(255,255,255,0.05)',
  axis: 'rgb(100,116,139)',
};

interface Props {
  data: PricePoint[];
  total: number;
  parsed: number;
}

function fmt(n: number) {
  return new Intl.NumberFormat('ru-RU').format(n) + ' ₸';
}

function fmtDate(s: string) {
  const [y, m] = s.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function ChartTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PricePoint;
  return (
    <div className="rounded-xl border border-border bg-card px-4 py-3 shadow-2xl space-y-0.5">
      <p className="text-xs text-muted-foreground">{fmtDate(p.date)}</p>
      <p className="text-base font-bold" style={{ color: C.teal }}>{fmt(p.price)}</p>
      {p.shop && <p className="text-xs text-muted-foreground">{p.shop}</p>}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  valueClass = '',
}: {
  label: string;
  value: string;
  sub?: string;
  valueClass?: string;
}) {
  return (
    <div className="rounded-xl border border-border bg-card p-4 space-y-1">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-lg font-bold tabular-nums leading-tight ${valueClass}`}>{value}</p>
      {sub && <p className={`text-xs opacity-70 ${valueClass}`}>{sub}</p>}
    </div>
  );
}

export default function PriceChart({ data, total, parsed }: Props) {
  const prices = data.map((d) => d.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const firstPrice = data[0]?.price ?? 0;
  const lastPrice = data[data.length - 1]?.price ?? 0;
  const change = lastPrice - firstPrice;
  const changePct = firstPrice > 0 ? ((change / firstPrice) * 100).toFixed(1) : '0';
  const hasShops = data.some((d) => d.shop);

  const TrendIcon = change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const trendClass =
    change > 0 ? 'text-red-400' : change < 0 ? 'text-green-400' : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard label="Lowest price" value={fmt(minPrice)} valueClass="text-green-400" />
        <StatCard label="Highest price" value={fmt(maxPrice)} valueClass="text-red-400" />
        <StatCard label="First recorded" value={fmt(firstPrice)} />
        <div className="rounded-xl border border-border bg-card p-4 space-y-1">
          <p className="text-xs text-muted-foreground">Total change</p>
          <div className={`flex items-center gap-1.5 ${trendClass}`}>
            <TrendIcon className="w-4 h-4 shrink-0" />
            <p className="text-lg font-bold tabular-nums leading-tight">
              {change >= 0 ? '+' : ''}{fmt(change)}
            </p>
          </div>
          <p className={`text-xs opacity-70 ${trendClass}`}>
            {change >= 0 ? '+' : ''}{changePct}%
          </p>
        </div>
      </div>

      {/* Chart card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <p className="text-sm font-semibold">Price over time</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {parsed} data point{parsed !== 1 ? 's' : ''} from {total} archive snapshot{total !== 1 ? 's' : ''}
            </p>
          </div>
          <Badge variant="secondary" className="text-xs">KZT</Badge>
        </div>
        <div className="p-4 pt-6">
          <ResponsiveContainer width="100%" height={360}>
            <AreaChart data={data} margin={{ top: 10, right: 8, left: 4, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor={C.teal} stopOpacity={0.2} />
                  <stop offset="95%" stopColor={C.teal} stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke={C.grid} />
              <XAxis
                dataKey="date"
                tick={{ fill: C.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtDate}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: C.axis, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`
                }
                domain={['auto', 'auto']}
                width={50}
              />
              <Tooltip
                content={<ChartTooltip />}
                cursor={{ stroke: 'rgba(255,255,255,0.08)', strokeWidth: 1 }}
              />
              <ReferenceLine
                y={minPrice}
                stroke={C.green}
                strokeDasharray="4 4"
                strokeOpacity={0.4}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke={C.teal}
                strokeWidth={2}
                fill="url(#priceGrad)"
                dot={{ fill: C.teal, r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#fff', stroke: C.teal, strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="px-5 py-4 border-b border-border">
          <p className="text-sm font-semibold">All price points</p>
        </div>
        <div className="max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-card">
              <tr className="border-b border-border">
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Date</th>
                <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Price</th>
                {hasShops && (
                  <th className="px-5 py-3 text-left text-xs font-medium text-muted-foreground">Shop</th>
                )}
              </tr>
            </thead>
            <tbody>
              {data.map((point) => (
                <tr
                  key={point.timestamp}
                  className="border-b border-border/50 hover:bg-accent/50 transition-colors"
                >
                  <td className="px-5 py-3 text-muted-foreground">{fmtDate(point.date)}</td>
                  <td className="px-5 py-3 font-medium tabular-nums" style={{ color: C.teal }}>
                    {fmt(point.price)}
                  </td>
                  {hasShops && (
                    <td className="px-5 py-3 text-muted-foreground">{point.shop ?? '—'}</td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
