'use client';

import { useState, useEffect } from 'react';
import { AnalyticsFiltersState } from '@/app/admin/analytics/page';
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from 'recharts';

interface CustomizationData {
  metadata: {
    query: any;
    generatedAt: string;
    recordCount: number;
  };
  distributions: {
    age: Array<{ value: string; count: number; percentage: number }>;
    pronouns: Array<{ value: string; count: number; percentage: number }>;
    skinTone: Array<{ value: string; count: number; percentage: number }>;
    hairColor: Array<{ value: string; count: number; percentage: number }>;
    hairStyle: Array<{ value: string; count: number; percentage: number }>;
    favoriteColor: Array<{ value: string; count: number; percentage: number }>;
    animalGuide: Array<{ value: string; count: number; percentage: number }>;
    clothingStyle: Array<{ value: string; count: number; percentage: number }>;
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

        const response = await fetch(`/api/admin/analytics/customizations?${params.toString()}`);
        if (!response.ok) throw new Error('Failed to fetch');
        const result = await response.json();
        setData(result);
      } catch (err: any) {
        setError(err.message || 'Failed to load customization data');
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [filters]);

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">Loading customization data...</div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-red-500">Error: {error}</div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-gray-500">No data available</div>
      </div>
    );
  }

  const CustomizationChart = ({ 
    title, 
    data: chartData 
  }: { 
    title: string; 
    data: Array<{ value: string; count: number; percentage: number }> 
  }) => (
    <div className="bg-gray-50 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">{title}</h3>
      {chartData.length === 0 ? (
        <div className="text-gray-500 text-center py-8">No data available</div>
      ) : (
        <ResponsiveContainer width="100%" height={300}>
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" />
            <XAxis type="number" />
            <YAxis dataKey="value" type="category" width={100} />
            <Tooltip 
              formatter={(value: number, name: string, props: any) => [
                `${value} (${props.payload.percentage}%)`,
                'Count'
              ]}
            />
            <Bar dataKey="count" fill="#3b82f6" />
          </BarChart>
        </ResponsiveContainer>
      )}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <CustomizationChart title="Age Distribution" data={data.distributions.age} />
        <CustomizationChart title="Pronouns Distribution" data={data.distributions.pronouns} />
        <CustomizationChart title="Skin Tone Distribution" data={data.distributions.skinTone} />
        <CustomizationChart title="Hair Color Distribution" data={data.distributions.hairColor} />
        <CustomizationChart title="Hair Style Distribution" data={data.distributions.hairStyle} />
        <CustomizationChart title="Favorite Color Distribution" data={data.distributions.favoriteColor} />
        <CustomizationChart title="Animal Guide Distribution" data={data.distributions.animalGuide} />
        <CustomizationChart title="Clothing Style Distribution" data={data.distributions.clothingStyle} />
      </div>
    </div>
  );
}

