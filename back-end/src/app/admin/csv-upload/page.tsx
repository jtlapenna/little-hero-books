'use client';

import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';
import Link from 'next/link';

interface UploadResult {
  success: boolean;
  summary: {
    total_rows: number;
    matched: number;
    created: number;
    pending: number;
    errors: number;
  };
  details: {
    matched_orders: string[];
    created_orders: string[];
    pending_orders: string[];
    errors: Array<{
      row: number;
      orderId: string | null;
      error: string;
    }>;
  };
  timestamp: string;
}

export default function CsvUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (selectedFile: File) => {
    // Validate file type
    const fileName = selectedFile.name.toLowerCase();
    if (!fileName.endsWith('.csv') && !fileName.endsWith('.txt')) {
      setError('Invalid file type. Only .csv and .txt files are allowed.');
      return;
    }

    // Validate file size (10MB)
    const maxSize = 10 * 1024 * 1024;
    if (selectedFile.size > maxSize) {
      setError(`File too large. Maximum size is ${maxSize / 1024 / 1024}MB.`);
      return;
    }

    setFile(selectedFile);
    setError(null);
    setResult(null);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    const droppedFile = e.dataTransfer.files[0];
    if (droppedFile) {
      handleFileSelect(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
  };

  const handleBrowseClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    console.log('[CSV Upload UI] Starting upload...');
    console.log('[CSV Upload UI] File:', file.name, file.size, 'bytes');
    
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', file);
      console.log('[CSV Upload UI] FormData created, sending request to /api/admin/amazon-orders/upload-csv');

      const response = await fetch('/api/admin/amazon-orders/upload-csv', {
        method: 'POST',
        body: formData,
      });

      console.log('[CSV Upload UI] Response received:', response.status, response.statusText);
      console.log('[CSV Upload UI] Response headers:', Object.fromEntries(response.headers.entries()));

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ error: 'Failed to parse error response' }));
        console.error('[CSV Upload UI] Error response:', errorData);
        throw new Error(errorData.error || `Upload failed: ${response.statusText}`);
      }

      const data = await response.json();
      console.log('[CSV Upload UI] Success response:', data);
      setResult(data);
    } catch (err: any) {
      console.error('[CSV Upload UI] Exception during upload:', err);
      console.error('[CSV Upload UI] Error message:', err.message);
      console.error('[CSV Upload UI] Error stack:', err.stack);
      setError(err.message || 'Failed to upload CSV file');
    } finally {
      setUploading(false);
      console.log('[CSV Upload UI] Upload finished');
    }
  };

  const handleReset = () => {
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900">CSV Upload</h1>
              <p className="mt-2 text-gray-600">
                Upload Amazon order CSV to populate customer shipping information
              </p>
            </div>
            <Link
              href="/"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              ← Back to Home
            </Link>
          </div>
        </div>

        {/* Upload Area */}
        {!result && (
          <div className="bg-white rounded-lg shadow-md p-8 mb-6">
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              className={`border-2 border-dashed rounded-lg p-12 text-center transition-colors ${
                file
                  ? 'border-green-300 bg-green-50'
                  : 'border-gray-300 hover:border-gray-400'
              }`}
            >
              {file ? (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <FileText className="h-12 w-12 text-green-600" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-900">{file.name}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    className="inline-flex items-center px-3 py-2 text-sm text-gray-600 hover:text-gray-900"
                  >
                    <X className="h-4 w-4 mr-1" />
                    Remove file
                  </button>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-center">
                    <Upload className="h-12 w-12 text-gray-400" />
                  </div>
                  <div>
                    <p className="text-lg font-medium text-gray-900">
                      Drag and drop your CSV file here
                    </p>
                    <p className="text-sm text-gray-500 mt-1">
                      or click to browse
                    </p>
                  </div>
                  <button
                    onClick={handleBrowseClick}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Browse Files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".csv,.txt"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {error && (
              <div className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <AlertTriangle className="h-5 w-5 text-red-400 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {file && !error && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={uploading}
                  className="inline-flex items-center px-6 py-3 border border-transparent rounded-md shadow-sm text-base font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {uploading ? (
                    <>
                      <Loader2 className="h-5 w-5 mr-2 animate-spin" />
                      Uploading...
                    </>
                  ) : (
                    <>
                      <Upload className="h-5 w-5 mr-2" />
                      Upload CSV
                    </>
                  )}
                </button>
              </div>
            )}
          </div>
        )}

        {/* Results */}
        {result && (
          <div className="space-y-6">
            {/* Summary Card */}
            <div className="bg-white rounded-lg shadow-md p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-xl font-semibold text-gray-900">Upload Results</h2>
                <button
                  onClick={handleReset}
                  className="text-sm text-gray-600 hover:text-gray-900"
                >
                  Upload Another File
                </button>
              </div>

              <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="text-sm text-gray-600">Total Rows</div>
                  <div className="text-2xl font-bold text-gray-900 mt-1">
                    {result.summary.total_rows}
                  </div>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <div className="text-sm text-green-600">Matched</div>
                  <div className="text-2xl font-bold text-green-700 mt-1">
                    {result.summary.matched}
                  </div>
                </div>
                <div className="bg-blue-50 rounded-lg p-4">
                  <div className="text-sm text-blue-600">Created</div>
                  <div className="text-2xl font-bold text-blue-700 mt-1">
                    {result.summary.created || 0}
                  </div>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <div className="text-sm text-yellow-600">Pending</div>
                  <div className="text-2xl font-bold text-yellow-700 mt-1">
                    {result.summary.pending}
                  </div>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <div className="text-sm text-red-600">Errors</div>
                  <div className="text-2xl font-bold text-red-700 mt-1">
                    {result.summary.errors}
                  </div>
                </div>
              </div>

              <div className="text-sm text-gray-500">
                Processed at: {new Date(result.timestamp).toLocaleString()}
              </div>
            </div>

            {/* Created Orders */}
            {result.details.created_orders && result.details.created_orders.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center mb-4">
                  <CheckCircle className="h-5 w-5 text-blue-600 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Created Orders ({result.details.created_orders.length})
                  </h3>
                </div>
                <div className="bg-blue-50 rounded-md p-4">
                  <p className="text-sm text-blue-800 mb-2">
                    Successfully created the following orders from CSV data:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.details.created_orders.map((orderId) => (
                      <Link
                        key={orderId}
                        href={`/orders/${orderId}`}
                        className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm hover:bg-blue-200"
                      >
                        {orderId}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Matched Orders */}
            {result.details.matched_orders.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center mb-4">
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Matched Orders ({result.details.matched_orders.length})
                  </h3>
                </div>
                <div className="bg-green-50 rounded-md p-4">
                  <p className="text-sm text-green-800 mb-2">
                    Successfully updated the following orders with customer data:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.details.matched_orders.map((orderId) => (
                      <Link
                        key={orderId}
                        href={`/orders/${orderId}`}
                        className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded text-sm hover:bg-green-200"
                      >
                        {orderId}
                      </Link>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Pending Orders */}
            {result.details.pending_orders.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center mb-4">
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Pending Orders ({result.details.pending_orders.length})
                  </h3>
                </div>
                <div className="bg-yellow-50 rounded-md p-4">
                  <p className="text-sm text-yellow-800 mb-2">
                    These orders were not found in the system. They may not have arrived via API yet:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.details.pending_orders.map((orderId) => (
                      <span
                        key={orderId}
                        className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm"
                      >
                        {orderId}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Errors */}
            {result.details.errors.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center mb-4">
                  <AlertTriangle className="h-5 w-5 text-red-600 mr-2" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Errors ({result.details.errors.length})
                  </h3>
                </div>
                <div className="bg-red-50 rounded-md p-4">
                  <p className="text-sm text-red-800 mb-3">
                    The following rows had errors during processing:
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {result.details.errors.map((err, index) => (
                      <div
                        key={index}
                        className="bg-white rounded p-3 border border-red-200"
                      >
                        <div className="text-sm font-medium text-gray-900">
                          Row {err.row}
                          {err.orderId && (
                            <span className="text-gray-500 ml-2">
                              (Order: {err.orderId})
                            </span>
                          )}
                        </div>
                        <div className="text-sm text-red-700 mt-1">{err.error}</div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {/* Success Message */}
            {result.summary.errors === 0 && result.summary.pending === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-green-800">Upload Complete</h3>
                    <p className="mt-1 text-sm text-green-700">
                      {result.summary.created > 0 && result.summary.matched > 0
                        ? `All orders were successfully processed: ${result.summary.created} created, ${result.summary.matched} updated.`
                        : result.summary.created > 0
                        ? `All orders were successfully created from CSV data.`
                        : `All orders were successfully matched and updated.`}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Instructions */}
        {!result && (
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
            <h3 className="text-lg font-semibold text-blue-900 mb-3">Instructions</h3>
            <ol className="list-decimal list-inside space-y-2 text-sm text-blue-800">
              <li>Download the order report CSV from Amazon Seller Central</li>
              <li>Ensure the CSV contains the following columns:
                <ul className="list-disc list-inside ml-6 mt-1 space-y-1">
                  <li>amazon-order-id (or amazon_order_id)</li>
                  <li>buyer-name or recipient-name</li>
                  <li>ship-address-1</li>
                  <li>ship-city</li>
                  <li>ship-state</li>
                  <li>ship-postal-code</li>
                </ul>
              </li>
              <li>Upload the CSV file using the area above</li>
              <li>Review the results to see which orders were matched and updated</li>
            </ol>
          </div>
        )}
      </div>
    </div>
  );
}

