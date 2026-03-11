'use client';

import { useEffect, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';

import { AnalyticsFiltersState } from '@/app/admin/analytics/page';

type DistributionItem = { value: string; count: number; percentage: number };

interface CustomizationData {
  metadata: {
    query: Record<string, string | null | undefined>;
    generatedAt: string;
    recordCount: number;
  };
  distributions: {
    age: DistributionItem[];
    pronouns: DistributionItem[];
    skinTone: DistributionItem[];
    hairColor: DistributionItem[];
    hairStyle: DistributionItem[];
    favoriteColor: DistributionItem[];
    animalGuide: DistributionItem[];
    clothingStyle: DistributionItem[];
    hometown: DistributionItem[];
  };
}

export default function CustomizationsTab({ filters }: { filters: AnalyticsFiltersState }) {
  const [data, setData] = useState<CustomizationData | null>(null);
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

        const response = await fetch(`/api/admin/analytics/customizations?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch');
        setData(await response.json());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Failed to load customization data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  if (loading) {
    return <div className="flex h-64 items-center justify-center text-gray-500">Loading customization insights...</div>;
  }

  if (error) {
    return <div className="flex h-64 items-center justify-center text-red-500">Error: {error}</div>;
  }

  if (!data) {
    return <div className="flex h-64 items-center justify-center text-gray-500">No data available</div>;
  }

  const primarySections = [
    { title: 'Skin tone', description: 'Most common skin tone selections in the filtered set.', data: data.distributions.skinTone },
    { title: 'Hair style', description: 'High-signal hairstyle preference mix.', data: data.distributions.hairStyle },
    { title: 'Hair color', description: 'Hair color distribution for current product usage.', data: data.distributions.hairColor },
    { title: 'Animal guide', description: 'Which animal guides customers choose most often.', data: data.distributions.animalGuide },
    { title: 'Pronouns', description: 'Pronoun mix captured in character specs.', data: data.distributions.pronouns },
    { title: 'Favorite color', description: 'Color preference distribution for current orders.', data: data.distributions.favoriteColor },
  ];

  const secondarySections = [
    { title: 'Clothing style', data: data.distributions.clothingStyle },
    { title: 'Hometown', data: data.distributions.hometown },
    { title: 'Age', data: data.distributions.age },
  ];

  return (
    <div className="space-y-8">
      <section className="rounded-2xl border border-slate-200 bg-gradient-to-br from-amber-50 via-white to-teal-50 p-6 shadow-sm">
        <div className="flex flex-col gap-2 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-2xl font-semibold text-slate-900">Customization insights</h2>
            <p className="text-sm text-slate-600">
              Product-preference view for the current analytics filters. This tab is secondary to the operations dashboard.
            </p>
          </div>
          <div className="text-sm text-slate-500">{data.metadata.recordCount} rows in scope</div>
        </div>

        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-3">
          {primarySections.slice(0, 3).map((section) => (
            <TopChoiceCard key={section.title} title={section.title} item={section.data[0] || null} />
          ))}
        </div>
      </section>

      <section className="grid grid-cols-1 gap-6 xl:grid-cols-2">
        {primarySections.map((section) => (
          <div key={section.title} className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">{section.title}</h3>
            <p className="mb-4 text-sm text-slate-600">{section.description}</p>
            <DistributionChart data={section.data} />
          </div>
        ))}
      </section>

      <section className="rounded-2xl border border-slate-200 bg-slate-50 p-5">
        <div className="mb-4">
          <h3 className="text-lg font-semibold text-slate-900">Lower-signal traits</h3>
          <p className="text-sm text-slate-600">
            These remain available for reference, but they are intentionally demoted from the primary research surface.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-6 xl:grid-cols-3">
          {secondarySections.map((section) => (
            <div key={section.title} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
              <h4 className="mb-3 text-base font-semibold text-slate-900">{section.title}</h4>
              <DistributionList data={section.data} />
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

function TopChoiceCard({
  title,
  item,
}: {
  title: string;
  item: DistributionItem | null;
}) {
  return (
    <div className="rounded-2xl border border-white bg-white/80 p-4 shadow-sm backdrop-blur">
      <div className="text-sm font-medium uppercase tracking-wide text-slate-500">{title}</div>
      {item ? (
        <>
          <div className="mt-2 text-2xl font-semibold text-slate-900">{item.value}</div>
          <div className="mt-1 text-sm text-slate-600">
            {item.count} selections · {item.percentage}%
          </div>
        </>
      ) : (
        <div className="mt-2 text-sm text-slate-500">No data available</div>
      )}
    </div>
  );
}

function DistributionChart({ data }: { data: DistributionItem[] }) {
  if (data.length === 0) {
    return <div className="py-16 text-center text-sm text-slate-500">No data available</div>;
  }

  const chartData = data.slice(0, Math.min(8, data.length));
  const chartHeight = Math.max(280, chartData.length * 48);

  return (
    <ResponsiveContainer width="100%" height={chartHeight}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" />
        <XAxis type="number" />
        <YAxis dataKey="value" type="category" width={110} />
        <Tooltip
          formatter={(value: number, _name: string, props: { payload?: { percentage?: number } }) => [
            `${value} (${props.payload?.percentage ?? 0}%)`,
            'Count',
          ]}
        />
        <Bar dataKey="count" fill="#0f766e" radius={[0, 6, 6, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}

function DistributionList({ data }: { data: DistributionItem[] }) {
  if (data.length === 0) {
    return <div className="py-8 text-center text-sm text-slate-500">No data available</div>;
  }

  return (
    <div className="max-h-80 space-y-2 overflow-y-auto pr-1">
      {data.map((item) => (
        <div
          key={item.value}
          className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-3 py-2"
        >
          <span className="text-sm text-slate-700">{item.value}</span>
          <span className="text-sm font-semibold text-slate-900">
            {item.count} · {item.percentage}%
          </span>
        </div>
      ))}
    </div>
  );
}
