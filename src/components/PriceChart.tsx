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
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Separator } from '@/components/ui/separator';
import { TrendingDown, TrendingUp, Minus } from 'lucide-react';
import type { PricePoint } from '@/app/api/prices/route';

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
    <Card className="shadow-2xl border-border/80 py-3 px-4 gap-1">
      <p className="text-xs text-muted-foreground">{fmtDate(p.date)}</p>
      <p className="text-base font-bold text-primary">{fmt(p.price)}</p>
      {p.shop && <p className="text-xs text-muted-foreground">{p.shop}</p>}
    </Card>
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

  const TrendIcon =
    change > 0 ? TrendingUp : change < 0 ? TrendingDown : Minus;
  const trendColor =
    change > 0 ? 'text-destructive' : change < 0 ? 'text-green-400' : 'text-muted-foreground';

  return (
    <div className="space-y-4">
      {/* Stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Lowest price</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold text-green-400 tabular-nums">{fmt(minPrice)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Highest price</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold text-destructive tabular-nums">{fmt(maxPrice)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">First recorded</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <p className="text-lg font-bold tabular-nums">{fmt(firstPrice)}</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-1 pt-4 px-4">
            <CardDescription className="text-xs">Total change</CardDescription>
          </CardHeader>
          <CardContent className="px-4 pb-4">
            <div className="flex items-center gap-1.5">
              <TrendIcon className={`w-4 h-4 ${trendColor}`} />
              <p className={`text-lg font-bold tabular-nums ${trendColor}`}>
                {change >= 0 ? '+' : ''}{fmt(change)}
              </p>
            </div>
            <p className={`text-xs mt-0.5 ${trendColor} opacity-70`}>
              {change >= 0 ? '+' : ''}{changePct}%
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Chart */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Price over time</CardTitle>
              <CardDescription className="text-xs mt-0.5">
                {parsed} data point{parsed !== 1 ? 's' : ''} extracted from {total} archive
                snapshot{total !== 1 ? 's' : ''}
              </CardDescription>
            </div>
            <Badge variant="secondary" className="text-xs">KZT</Badge>
          </div>
        </CardHeader>
        <Separator className="opacity-50" />
        <CardContent className="pt-6 pr-4 pl-2 pb-4">
          <ResponsiveContainer width="100%" height={380}>
            <AreaChart data={data} margin={{ top: 10, right: 10, left: 10, bottom: 0 }}>
              <defs>
                <linearGradient id="priceGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="var(--primary)" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="var(--primary)" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(1 0 0 / 6%)" />
              <XAxis
                dataKey="date"
                tick={{ fill: 'oklch(0.55 0 0)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={fmtDate}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fill: 'oklch(0.55 0 0)', fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                tickFormatter={(v: number) =>
                  v >= 1_000_000 ? `${(v / 1_000_000).toFixed(1)}M` : `${(v / 1_000).toFixed(0)}K`
                }
                domain={['auto', 'auto']}
                width={50}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'oklch(1 0 0 / 10%)' }} />
              <ReferenceLine
                y={minPrice}
                stroke="var(--chart-green, oklch(0.70 0.17 150))"
                strokeDasharray="4 4"
                strokeOpacity={0.5}
              />
              <Area
                type="monotone"
                dataKey="price"
                stroke="var(--primary)"
                strokeWidth={2}
                fill="url(#priceGrad)"
                dot={{ fill: 'var(--primary)', r: 3, strokeWidth: 0 }}
                activeDot={{ r: 5, fill: '#fff', stroke: 'var(--primary)', strokeWidth: 2 }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      {/* Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">All price points</CardTitle>
        </CardHeader>
        <Separator className="opacity-50" />
        <div className="max-h-72 overflow-y-auto">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="text-xs">Date</TableHead>
                <TableHead className="text-xs">Price</TableHead>
                {hasShops && <TableHead className="text-xs">Shop</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((point) => (
                <TableRow key={point.timestamp}>
                  <TableCell className="text-sm text-muted-foreground">
                    {fmtDate(point.date)}
                  </TableCell>
                  <TableCell className="text-sm font-medium text-primary tabular-nums">
                    {fmt(point.price)}
                  </TableCell>
                  {hasShops && (
                    <TableCell className="text-sm text-muted-foreground">
                      {point.shop ?? '—'}
                    </TableCell>
                  )}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </Card>
    </div>
  );
}
