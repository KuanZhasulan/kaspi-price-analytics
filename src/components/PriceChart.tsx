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
import type { PricePoint } from '@/app/api/prices/route';

interface Props {
  data: PricePoint[];
  total: number;
  parsed: number;
}

function fmt(price: number): string {
  return new Intl.NumberFormat('ru-RU').format(price) + ' ₸';
}

function fmtDate(dateStr: string): string {
  const [y, m] = dateStr.split('-');
  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${months[parseInt(m) - 1]} ${y}`;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload }: any) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload as PricePoint;
  return (
    <div className="bg-slate-800 border border-slate-600 rounded-lg p-3 shadow-2xl">
      <p className="text-slate-400 text-xs mb-1">{fmtDate(p.date)}</p>
      <p className="text-teal-300 font-bold text-base">{fmt(p.price)}</p>
      {p.shop && <p className="text-slate-300 text-xs mt-1">{p.shop}</p>}
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

  return (
    <div className="space-y-4">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Lowest', value: fmt(minPrice), color: 'text-green-400' },
          { label: 'Highest', value: fmt(maxPrice), color: 'text-red-400' },
          { label: 'First recorded', value: fmt(firstPrice), color: 'text-slate-200' },
          {
            label: 'Change',
            value: `${change >= 0 ? '+' : ''}${fmt(change)}`,
            sub: `${change >= 0 ? '+' : ''}${changePct}%`,
            color: change > 0 ? 'text-red-400' : change < 0 ? 'text-green-400' : 'text-slate-200',
          },
        ].map((s) => (
          <div key={s.label} className="bg-slate-900 border border-slate-800 rounded-xl p-4">
            <p className="text-slate-500 text-xs mb-1">{s.label}</p>
            <p className={`font-semibold text-sm ${s.color}`}>{s.value}</p>
            {s.sub && <p className={`text-xs ${s.color} opacity-70`}>{s.sub}</p>}
          </div>
        ))}
      </div>

      {/* Chart */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-6">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-white font-semibold">Price over time</h2>
          <span className="text-slate-500 text-xs">
            {parsed} data point{parsed !== 1 ? 's' : ''} from {total} archive{total !== 1 ? 's' : ''}
          </span>
        </div>
        <ResponsiveContainer width="100%" height={380}>
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
            <defs>
              <linearGradient id="grad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#2dd4bf" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#2dd4bf" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
            <XAxis
              dataKey="date"
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              tickFormatter={fmtDate}
              interval="preserveStartEnd"
            />
            <YAxis
              tick={{ fill: '#64748b', fontSize: 11 }}
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) =>
                v >= 1_000_000
                  ? `${(v / 1_000_000).toFixed(1)}M`
                  : `${(v / 1_000).toFixed(0)}K`
              }
              domain={['auto', 'auto']}
              width={52}
            />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine
              y={minPrice}
              stroke="#4ade80"
              strokeDasharray="4 4"
              strokeOpacity={0.4}
            />
            <Area
              type="monotone"
              dataKey="price"
              stroke="#2dd4bf"
              strokeWidth={2}
              fill="url(#grad)"
              dot={{ fill: '#2dd4bf', r: 4, strokeWidth: 0 }}
              activeDot={{ r: 6, fill: '#fff', stroke: '#2dd4bf', strokeWidth: 2 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Table */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-800">
          <h3 className="text-white font-semibold text-sm">All price points</h3>
        </div>
        <div className="overflow-x-auto max-h-72 overflow-y-auto">
          <table className="w-full text-sm">
            <thead className="sticky top-0 bg-slate-900">
              <tr className="text-slate-500 text-left text-xs">
                <th className="px-5 py-3 font-medium">Date</th>
                <th className="px-5 py-3 font-medium">Price</th>
                {hasShops && <th className="px-5 py-3 font-medium">Shop</th>}
              </tr>
            </thead>
            <tbody>
              {data.map((point, i) => (
                <tr
                  key={point.timestamp}
                  className={`border-t border-slate-800 hover:bg-slate-800/40 transition-colors ${
                    i % 2 === 0 ? '' : 'bg-slate-900/40'
                  }`}
                >
                  <td className="px-5 py-3 text-slate-400">{fmtDate(point.date)}</td>
                  <td className="px-5 py-3 text-teal-300 font-medium tabular-nums">
                    {fmt(point.price)}
                  </td>
                  {hasShops && (
                    <td className="px-5 py-3 text-slate-400">{point.shop ?? '—'}</td>
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
