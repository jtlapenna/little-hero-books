'use client';

import { type ReactNode, useEffect, useState } from 'react';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { AnalyticsFiltersState } from '@/app/admin/analytics/page';

interface OverviewData {
  metadata: {
    query: Record<string, string | null | undefined>;
    generatedAt: string;
    recordCount: number;
  };
  summary: {
    totalOrders: number;
    testOrders: number;
    productionOrders: number;
    productionCustomerOrders: number;
    unknownOrders: number;
  };
  kpis: {
    totalProductionOrders: number;
    productionCustomerOrders: number;
    activeLiveOrders: number;
    awaitingApproval: number;
    inPrint: number;
    shippedDelivered: number;
    attentionNeeded: number;
  };
  workflowFunnel: Array<{ stage: string; count: number }>;
  approvalFunnel: Array<{ stage: string; count: number }>;
  fulfillmentSummary: {
    submitted: number;
    shipped: number;
    delivered: number;
    canceledOrFailed: number;
  };
  attentionSummary: {
    errorOrders: number;
    retryingOrders: number;
    fulfillmentExceptions: number;
    topErrors: Array<{ label: string; count: number }>;
  };
  platformBreakdown: Array<{ platform: string; count: number }>;
  siblingSummary: {
    siblingRows: number;
    multiItemBookCount: number;
    multiItemOrderCount: number;
    singleItemOrderCount: number;
    averageBooksPerMultiItemOrder: number;
    largestMultiItemOrderSize: number;
    splitLifecycleRoots: number;
    uniqueRootOrders: number;
  };
  multiItemSummary: {
    siblingRows: number;
    multiItemBookCount: number;
    multiItemOrderCount: number;
    singleItemOrderCount: number;
    averageBooksPerMultiItemOrder: number;
    largestMultiItemOrderSize: number;
    splitLifecycleRoots: number;
    uniqueRootOrders: number;
  };
  provenanceSummary: {
    canonicalProductionOrders: number;
    canonicalCustomerOrders: number;
    dedupedLiveArchiveOverlaps: number;
    unknownClassificationRows: number;
  };
  totalsBySource: {
    liveRows: number;
    archivedRows: number;
    bothSources: number;
    rootOrders: number;
  };
  statusBreakdown: Record<string, number>;
  timeSeries: Array<{
    date: string;
    orders: number;
    test: number;
    production: number;
    amazon: number;
    d2c: number;
  }>;
}

const PIE_COLORS = ['#0f766e', '#0891b2', '#16a34a', '#f59e0b', '#e11d48', '#6366f1'];

export default function OverviewTab({ filters }: { filters: AnalyticsFiltersState }) {
  const [data, setData] = useState<OverviewData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchData = async () => {
      setLoading(true);
      setError(null);

      try {
        const params = new URLSearchParams();
        params.append('startDate', filters.startDate);
        params.append('endDate', filters.endDate);
        if (filters.isTest !== 'all') {
          params.append('isTest', filters.isTest === 'test' ? 'true' : 'false');
        }
        if (filters.bookId) {
          params.append('bookId', filters.bookId);
        }
        params.append('historyScope', filters.historyScope);
        params.append('groupBy', filters.groupBy);

        const response = await fetch(`/api/admin/analytics/overview?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch');
        setData(await response.json());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load overview data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-gray-500">Loading operations dashboard...</div>;
  }

  if (error) {
    return <div className="flex h-64 items-center justify-center text-red-500">Error: {error}</div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center text-gray-500">No data available</div>;
  }

  const statusData = Object.entries(data.statusBreakdown).map(([name, value]) => ({ name, value }));
  const fulfillmentData = [
    { label: 'Submitted', value: data.fulfillmentSummary.submitted },
    { label: 'Shipped', value: data.fulfillmentSummary.shipped },
    { label: 'Delivered', value: data.fulfillmentSummary.delivered },
    { label: 'Canceled / failed', value: data.fulfillmentSummary.canceledOrFailed },
  ];
  const platformData = data.platformBreakdown.filter((item) => item.count > 0);
  const topErrors = data.attentionSummary.topErrors;

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-teal-100 bg-gradient-to-br from-teal-50 via-white to-amber-50 p-6">
        <div className="mb-5 flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Operations snapshot</h2>
            <p className="text-sm text-slate-600">
              {filters.historyScope === 'all'
                ? 'Historical production view across live and archived books.'
                : filters.historyScope === 'archived'
                  ? 'Archived production books only.'
                  : 'Live production books only.'}
            </p>
          </div>
          <div className="text-sm text-slate-500">
            {data.metadata.recordCount} canonical books in scope · {data.totalsBySource.liveRows} live-only ·{' '}
            {data.totalsBySource.archivedRows} archived-only · {data.totalsBySource.bothSources} deduped overlap
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-7">
          <MetricCard title="Production books" value={data.kpis.totalProductionOrders} tone="teal" />
          <MetricCard title="Customer orders" value={data.kpis.productionCustomerOrders} tone="emerald" />
          <MetricCard title="Active live books" value={data.kpis.activeLiveOrders} tone="blue" />
          <MetricCard title="Awaiting approval" value={data.kpis.awaitingApproval} tone="amber" />
          <MetricCard title="In print" value={data.kpis.inPrint} tone="sky" />
          <MetricCard title="Shipped / delivered" value={data.kpis.shippedDelivered} tone="green" />
          <MetricCard title="Attention needed" value={data.kpis.attentionNeeded} tone="rose" />
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        <Panel
          title="Pipeline health"
          subtitle="How far orders have progressed through intake, image generation, pages, and print."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.workflowFunnel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#0f766e" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Approval funnel"
          subtitle="Customer approval outcomes for the filtered books that actually carry approval data."
        >
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={data.approvalFunnel}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="stage" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="count" fill="#d97706" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-3">
        <Panel
          title="Fulfillment health"
          subtitle="Lulu and shipping progress across the filtered slice."
        >
          <ResponsiveContainer width="100%" height={260}>
            <BarChart data={fulfillmentData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="label" angle={-20} textAnchor="end" height={70} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#0284c7" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Attention and risk"
          subtitle="Orders currently surfacing errors, retries, or fulfillment exceptions."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <MiniStat label="Errors" value={data.attentionSummary.errorOrders} tone="rose" />
            <MiniStat label="Retries" value={data.attentionSummary.retryingOrders} tone="amber" />
            <MiniStat
              label="Fulfillment exceptions"
              value={data.attentionSummary.fulfillmentExceptions}
              tone="slate"
            />
          </div>

          <div className="mt-5 space-y-2">
            <h4 className="text-sm font-semibold uppercase tracking-wide text-slate-600">Top error types</h4>
            {topErrors.length > 0 ? (
              topErrors.map((item) => (
                <div
                  key={item.label}
                  className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                >
                  <span className="text-sm text-slate-700">{item.label}</span>
                  <span className="text-sm font-semibold text-slate-900">{item.count}</span>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-4 text-sm text-emerald-800">
                No error types in the current filtered view.
              </div>
            )}
          </div>
        </Panel>

        <Panel
          title="Sibling integrity"
          subtitle="Multi-book order grouping and lightweight lifecycle mismatch indicators."
        >
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <MiniStat label="Multi-item books" value={data.multiItemSummary.multiItemBookCount} tone="teal" />
            <MiniStat label="Multi-item orders" value={data.multiItemSummary.multiItemOrderCount} tone="blue" />
            <MiniStat
              label="Split lifecycle roots"
              value={data.multiItemSummary.splitLifecycleRoots}
              tone="rose"
            />
            <MiniStat label="Largest order size" value={data.multiItemSummary.largestMultiItemOrderSize} tone="amber" />
            <MiniStat label="Single-item orders" value={data.multiItemSummary.singleItemOrderCount} tone="slate" />
            <MiniStat label="Root orders in scope" value={data.totalsBySource.rootOrders} tone="slate" />
          </div>
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[2fr,1fr]">
        <Panel
          title="Orders over time"
          subtitle="Volume trend plus platform split over the selected grouping period."
        >
          <ResponsiveContainer width="100%" height={320}>
            <LineChart data={data.timeSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="date" />
              <YAxis />
              <Tooltip />
              <Legend />
              <Line type="monotone" dataKey="orders" stroke="#0f766e" strokeWidth={2} name="Total rows" />
              <Line
                type="monotone"
                dataKey="amazon"
                stroke="#0284c7"
                strokeWidth={2}
                name="Amazon"
              />
              <Line type="monotone" dataKey="d2c" stroke="#d97706" strokeWidth={2} name="D2C" />
              {filters.isTest === 'all' && (
                <Line
                  type="monotone"
                  dataKey="production"
                  stroke="#16a34a"
                  strokeWidth={2}
                  strokeDasharray="5 5"
                  name="Production"
                />
              )}
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Platform mix"
          subtitle="Current slice of the filtered dataset."
        >
          {platformData.length > 0 ? (
            <ResponsiveContainer width="100%" height={320}>
              <PieChart>
                <Pie
                  data={platformData}
                  dataKey="count"
                  nameKey="platform"
                  cx="50%"
                  cy="50%"
                  outerRadius={95}
                  label={({ platform, percent }) => `${platform}: ${((percent ?? 0) * 100).toFixed(0)}%`}
                >
                  {platformData.map((entry, index) => (
                    <Cell key={entry.platform} fill={PIE_COLORS[index % PIE_COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip />
              </PieChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-[320px] items-center justify-center text-sm text-slate-500">
              No platform data available.
            </div>
          )}
        </Panel>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-[1.2fr,1fr]">
        <Panel
          title="Status distribution"
          subtitle="Execution and order statuses in the current filtered view."
        >
          <ResponsiveContainer width="100%" height={320}>
            <BarChart data={statusData}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" angle={-25} textAnchor="end" height={90} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#475569" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel
          title="Context"
          subtitle="Quick reading of the current filter scope."
        >
          <div className="space-y-4">
            <ContextRow
              label="Filtered rows"
              value={`${data.metadata.recordCount}`}
              detail="Includes the selected date range, history scope, and data view."
            />
            <ContextRow
              label="Production books"
              value={`${data.summary.productionOrders}`}
              detail="Canonical production book rows after live/archive dedupe."
            />
            <ContextRow
              label="Customer orders"
              value={`${data.summary.productionCustomerOrders}`}
              detail="Distinct grouped customer orders. Multi-item orders count once here."
            />
            <ContextRow
              label="Deduped overlaps"
              value={`${data.provenanceSummary.dedupedLiveArchiveOverlaps}`}
              detail="Canonical orders found in both live and archived sources."
            />
            <ContextRow
              label="Unknown rows"
              value={`${data.provenanceSummary.unknownClassificationRows}`}
              detail="Excluded from production totals until they have stronger classification evidence."
            />
          </div>
        </Panel>
      </section>
    </div>
  );
}

function Panel({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-slate-900">{title}</h3>
        <p className="text-sm text-slate-600">{subtitle}</p>
      </div>
      {children}
    </div>
  );
}

function MetricCard({
  title,
  value,
  tone,
}: {
  title: string;
  value: number;
  tone: 'teal' | 'emerald' | 'blue' | 'amber' | 'sky' | 'green' | 'rose';
}) {
  const toneClasses = {
    teal: 'border-teal-200 bg-white text-teal-700',
    emerald: 'border-emerald-200 bg-white text-emerald-700',
    blue: 'border-blue-200 bg-white text-blue-700',
    amber: 'border-amber-200 bg-white text-amber-700',
    sky: 'border-sky-200 bg-white text-sky-700',
    green: 'border-green-200 bg-white text-green-700',
    rose: 'border-rose-200 bg-white text-rose-700',
  };

  return (
    <div className={`rounded-2xl border p-4 shadow-sm ${toneClasses[tone]}`}>
      <div className="text-sm font-medium text-slate-600">{title}</div>
      <div className="mt-2 text-3xl font-semibold text-slate-900">{value}</div>
    </div>
  );
}

function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: 'teal' | 'blue' | 'rose' | 'amber' | 'slate';
}) {
  const toneClasses = {
    teal: 'bg-teal-50 text-teal-900',
    blue: 'bg-blue-50 text-blue-900',
    rose: 'bg-rose-50 text-rose-900',
    amber: 'bg-amber-50 text-amber-900',
    slate: 'bg-slate-100 text-slate-900',
  };

  return (
    <div className={`rounded-xl px-4 py-3 ${toneClasses[tone]}`}>
      <div className="text-xs font-semibold uppercase tracking-wide opacity-70">{label}</div>
      <div className="mt-1 text-2xl font-semibold">{value}</div>
    </div>
  );
}

function ContextRow({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center justify-between gap-4">
        <span className="text-sm font-medium text-slate-700">{label}</span>
        <span className="text-lg font-semibold text-slate-900">{value}</span>
      </div>
      <p className="mt-1 text-sm text-slate-500">{detail}</p>
    </div>
  );
}
