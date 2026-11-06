'use client';

import { useState, useRef, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, X, Loader2 } from 'lucide-react';
import Link from 'next/link';
import Papa from 'papaparse';
import { canonicalCsvCustomizationIdentity, readCsvItemSelectionRows } from '@/lib/csv-upload-helpers';
import type { CsvItemBookChoice } from '@/lib/csv-book-selection';

type ItemBookId = CsvItemBookChoice['bookId'];
type PreviewItem = { key: string; rootOrderId: string; source: CsvItemBookChoice['source']; rowNumber: number; title: string; sku: string; quantity: number };
type UploadSnapshot = { file: File; fileName: string; bookId: string; items?: readonly CsvItemBookChoice[]; itemJson?: string };
function itemSelectionKey(item: Pick<CsvItemBookChoice, 'rootOrderId' | 'source'>): string {
  return JSON.stringify([item.rootOrderId, item.source.kind, item.source.value]);
}
function isConfirmedItemSelection(value: unknown): value is CsvItemBookChoice & { configVersion: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const item = value as Record<string, unknown>;
  if (Object.keys(item).length !== 5 || !['rootOrderId', 'source', 'bookId', 'formatId', 'configVersion'].every(key => Object.hasOwn(item, key)) ||
      typeof item.rootOrderId !== 'string' || !item.rootOrderId || item.rootOrderId !== item.rootOrderId.trim() ||
      !item.source || typeof item.source !== 'object' || Array.isArray(item.source) || item.formatId !== 'amazon' ||
      typeof item.configVersion !== 'number' || !Number.isSafeInteger(item.configVersion)) return false;
  const source = item.source as Record<string, unknown>;
  if (Object.keys(source).length !== 2 || !['kind', 'value'].every(key => Object.hasOwn(source, key)) || typeof source.value !== 'string' || !source.value || source.value !== source.value.trim() ||
      !['order-item-id', 'customization-key'].includes(source.kind as string) ||
      (source.kind === 'customization-key' && !/^[a-f0-9]{12}$/.test(source.value))) return false;
  return item.bookId === 'book-mvp-simple-adventure' ? item.configVersion === 1 :
    item.bookId === 'book-finding-our-inner-voice' && item.configVersion >= 2;
}
async function previewSource(item: Record<string, unknown>): Promise<CsvItemBookChoice['source']> {
  if (typeof item.order_item_id === 'string' && item.order_item_id) return Object.freeze({ kind: 'order-item-id', value: item.order_item_id });
  if (typeof item.customization_url !== 'string' || !item.customization_url) throw new Error('Each item needs an order-item-id or customization link.');
  if (!globalThis.crypto?.subtle) throw new Error('Open this page over HTTPS to read items without an order-item-id.');
  const bytes = new TextEncoder().encode(canonicalCsvCustomizationIdentity(item.customization_url));
  const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
  const value = Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('').slice(0, 12);
  return Object.freeze({ kind: 'customization-key', value });
}

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
    w0_triggered?: string[];
    w0_skipped?: Array<{ orderId: string; reason: string }>;
    errors: Array<{
      row: number;
      orderId: string | null;
      error: string;
    }>;
  };
  selection?: { bookId: string; formatId: string; configVersion: number; title: string };
  itemSelections?: Array<CsvItemBookChoice & { configVersion: number }>;
  timestamp: string;
}

function isUploadResult(value: unknown): value is UploadResult {
  const record = (item: unknown): item is Record<string, unknown> =>
    item !== null && typeof item === 'object' && !Array.isArray(item);
  const count = (item: unknown) => typeof item === 'number' && Number.isSafeInteger(item) && item >= 0;
  const strings = (item: unknown): item is string[] =>
    Array.isArray(item) && item.every(entry => typeof entry === 'string');
  if (!record(value) || value.success !== true || !record(value.summary) || !record(value.details)) return false;
  const summary = value.summary, details = value.details;
  if (!['total_rows', 'matched', 'created', 'pending', 'errors'].every(key => count(summary[key]))) return false;
  if (!strings(details.matched_orders) || !strings(details.created_orders) || !strings(details.pending_orders)) return false;
  if (!Array.isArray(details.errors) || !details.errors.every(item => record(item) && count(item.row) &&
      (item.orderId === null || typeof item.orderId === 'string') && typeof item.error === 'string')) return false;
  if (details.w0_triggered !== undefined && !strings(details.w0_triggered)) return false;
  if (details.w0_skipped !== undefined && (!Array.isArray(details.w0_skipped) ||
      !details.w0_skipped.every(item => record(item) && typeof item.orderId === 'string' && typeof item.reason === 'string'))) return false;
  if (typeof value.timestamp !== 'string' || !Number.isFinite(Date.parse(value.timestamp))) return false;
  if (value.selection !== undefined && (!record(value.selection) || typeof value.selection.bookId !== 'string' ||
      typeof value.selection.formatId !== 'string' || !Number.isSafeInteger(value.selection.configVersion) ||
      typeof value.selection.title !== 'string' || value.selection.title.trim().length === 0)) return false;
  if (value.itemSelections !== undefined && (!Array.isArray(value.itemSelections) || !value.itemSelections.every(isConfirmedItemSelection))) return false;
  return true;
}

export default function CsvUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [bookId, setBookId] = useState('book-mvp-simple-adventure');
  const [submission, setSubmission] = useState<{ fileName: string; bookId: string } | null>(null);
  const inFlight = useRef<number | null>(null);
  const sequence = useRef(0);
  const bookTitle = bookId === 'per-item' ? 'Choose books by item' : bookId === 'book-finding-our-inner-voice' ? 'Finding Our Inner Voice' : 'Adventure Compass';
  const [previewItems, setPreviewItems] = useState<PreviewItem[]>([]);
  const [previewFile, setPreviewFile] = useState<File | null>(null);
  const [itemBooks, setItemBooks] = useState<Record<string, ItemBookId | ''>>({});
  const [knownVersions, setKnownVersions] = useState<Record<string, CsvItemBookChoice & { configVersion: number }>>({});
  const [previewLoading, setPreviewLoading] = useState(false);
  const previewSequence = useRef(0);
  const retrySnapshot = useRef<UploadSnapshot | null>(null);
  useEffect(() => {
    const request = ++previewSequence.current;
    setPreviewItems([]); setPreviewFile(null); setItemBooks({}); setKnownVersions({}); setPreviewLoading(false);
    if (!file || bookId !== 'per-item') return;
    setPreviewLoading(true);
    void (async () => {
      const text = await file.text();
      const delimiter = text.split('\n')[0].includes('\t') ? '\t' : ',';
      const parsed = Papa.parse<string[]>(text, { header: false, skipEmptyLines: true, delimiter,
        transformHeader: header => header.trim() });
      if (parsed.errors.length || !parsed.data.length) throw new Error('The file could not be read as CSV or tab-separated text.');
      const headers = parsed.data[0].map(value => String(value).trim());
      const rows = readCsvItemSelectionRows(headers, parsed.data.slice(1));
      const items = await Promise.all(rows.map(async row => {
        const source = await previewSource(row.lineItem);
        return { key: itemSelectionKey({ rootOrderId: row.rootOrderId, source }), rootOrderId: row.rootOrderId,
          source, rowNumber: row.rowNumber, title: String(row.lineItem.product_name ?? 'Source item'),
          sku: String(row.lineItem.sku ?? ''), quantity: row.lineItem.quantity as number };
      }));
      const keys = new Set<string>(), quantities = new Map<string, number>();
      for (const item of items) {
        if (keys.has(item.key)) throw new Error('The file repeats a source item. Correct it before choosing books.');
        keys.add(item.key);
        const quantity = (quantities.get(item.rootOrderId) ?? 0) + item.quantity;
        if (quantity > 200) throw new Error('An Amazon order cannot exceed 200 books in this upload.');
        quantities.set(item.rootOrderId, quantity);
      }
      if (previewSequence.current === request) { setPreviewItems(items); setPreviewFile(file); setError(null); }
    })().catch(error => {
      if (previewSequence.current === request) { setError(error instanceof Error ? error.message : 'The file could not be read.'); setRetryable(false); }
    }).finally(() => { if (previewSequence.current === request) setPreviewLoading(false); });
    return () => { if (previewSequence.current === request) previewSequence.current++; };
  }, [file, bookId]);
  const choicesComplete = bookId !== 'per-item' || (!previewLoading && previewFile === file && previewItems.length > 0 &&
    previewItems.every(item => itemBooks[item.key] === 'book-mvp-simple-adventure' || itemBooks[item.key] === 'book-finding-our-inner-voice'));


  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const resetFocusRequested = useRef(false);
  useEffect(() => {
    if (result) resultsHeading.current?.focus();
    else if (resetFocusRequested.current && file === null) {
      browseButton.current?.focus();
      resetFocusRequested.current = false;
    }
  }, [file, result]);

  const handleFileSelect = (selectedFile: File) => {
    if (inFlight.current !== null) return;
    setRetryable(false);
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

    retrySnapshot.current = null; setKnownVersions({});
    setRetryable(false); setSubmission(null);
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
    if (inFlight.current === null) fileInputRef.current?.click();
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile) {
      handleFileSelect(selectedFile);
    }
  };

  const handleUpload = async () => {
    if (!file || inFlight.current !== null || previewLoading || !choicesComplete) return;
    let snapshot: UploadSnapshot;
    try {
      const saved = retryable ? retrySnapshot.current : null;
      if (saved && saved.file === file && saved.bookId === bookId) snapshot = saved;
      else {
        if (!['book-mvp-simple-adventure', 'book-finding-our-inner-voice', 'per-item'].includes(bookId)) throw new Error('Choose a supported book.');
        const items = bookId === 'per-item' ? Object.freeze(previewItems.map(item => {
          const selected = itemBooks[item.key];
          if (selected !== 'book-mvp-simple-adventure' && selected !== 'book-finding-our-inner-voice') throw new Error('Choose a book for every source item.');
          const known = knownVersions[item.key];
          const configVersion = known?.bookId === selected && known.formatId === 'amazon' ? known.configVersion : undefined;
          return Object.freeze({ rootOrderId: item.rootOrderId, source: item.source, bookId: selected, formatId: 'amazon' as const,
            ...(configVersion !== undefined ? { configVersion } : {}) });
        })) : undefined;
        snapshot = { file, fileName: file.name, bookId, ...(items ? { items, itemJson: JSON.stringify({ schemaVersion: 1, items }) } : {}) };
      }
    } catch (error) { setError(error instanceof Error ? error.message : 'Book choices could not be read.'); return; }
    retrySnapshot.current = snapshot;
    const requestNumber = ++sequence.current;
    inFlight.current = requestNumber;
    const submitted = { fileName: snapshot.fileName, bookId: snapshot.bookId };
    setSubmission(submitted);

    console.log('[CSV Upload UI] Starting upload...');
    console.log('[CSV Upload UI] File:', file.name, file.size, 'bytes');
    
    setUploading(true);
    setError(null);
    setResult(null);

    try {
      const formData = new FormData();
      formData.append('file', snapshot.file);
      if (submitted.bookId === 'per-item') {
        if (!snapshot.itemJson) throw new Error('Missing source item book choices.');
        formData.append('itemBookSelections', snapshot.itemJson);
      } else if (submitted.bookId === 'book-finding-our-inner-voice') {
        formData.append('bookId', submitted.bookId);
        formData.append('formatId', 'amazon');
      }
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

      const data: unknown = await response.json();
      console.log('[CSV Upload UI] Success response:', data);
      if (!isUploadResult(data)) {
        throw new Error('The server returned an incomplete upload result. Keep the file and try again.');
      }
      if (submitted.bookId === 'per-item') {
        if (data.selection || !snapshot.items || !data.itemSelections || data.itemSelections.length !== snapshot.items.length) {
          throw new Error('The server did not confirm every source item book. Keep the file and try again.');
        }
        const expected = new Map(snapshot.items.map(item => [itemSelectionKey(item), item]));
        const confirmed = new Map<string, CsvItemBookChoice & { configVersion: number }>();
        for (const item of data.itemSelections) {
          const key = itemSelectionKey(item), original = expected.get(key);
          if (!original || confirmed.has(key) || item.bookId !== original.bookId || item.formatId !== original.formatId ||
              (original.configVersion !== undefined && original.configVersion !== item.configVersion)) {
            throw new Error('The server returned different source item selections. Keep the file and try again.');
          }
          confirmed.set(key, item);
        }
        if (confirmed.size !== expected.size) throw new Error('The server returned incomplete source item selections.');
        // Pin verified server versions when reviewing a partially processed file.
        const pinned = Object.freeze(snapshot.items.map(item => Object.freeze({ ...item, configVersion: confirmed.get(itemSelectionKey(item))!.configVersion })));
        if (inFlight.current === requestNumber) {
          setKnownVersions(previous => { const updated = { ...previous }; for (const [key, item] of confirmed) updated[key] = item; return updated; });
          retrySnapshot.current = { ...snapshot, items: pinned, itemJson: JSON.stringify({ schemaVersion: 1, items: pinned }) };
        }
      } else if (data.itemSelections !== undefined) {
        throw new Error('The server returned unexpected per-item selections. Keep the file and try again.');
      }
      if (submitted.bookId === 'book-finding-our-inner-voice' &&
          (!data.selection || data.selection.bookId !== submitted.bookId || data.selection.formatId !== 'amazon' ||
           !Number.isSafeInteger(data.selection.configVersion) || data.selection.configVersion < 2)) {
        throw new Error('The server did not confirm the selected book. Keep the file and try again.');
      }
      if (submitted.bookId !== 'book-finding-our-inner-voice' && data.selection) {
        throw new Error('The server returned a different book selection. Keep the file and try again.');
      }
      if (inFlight.current === requestNumber) setResult(data);
    } catch (err: any) {
      console.error('[CSV Upload UI] Exception during upload:', err);
      console.error('[CSV Upload UI] Error message:', err.message);
      console.error('[CSV Upload UI] Error stack:', err.stack);
      if (inFlight.current === requestNumber) {
        setError(err.message || 'Failed to upload CSV file');
        setRetryable(true);
      }
    } finally {
      if (inFlight.current === requestNumber) {
        inFlight.current = null;
        setUploading(false);
      }
      console.log('[CSV Upload UI] Upload finished');
    }
  };

  const handleReset = () => {
    if (inFlight.current !== null) return;
    resetFocusRequested.current = true;
    retrySnapshot.current = null; setKnownVersions({});
    setSubmission(null);
    setRetryable(false);
    setFile(null);
    setResult(null);
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 [overflow-wrap:anywhere]">
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

        <p role="status" aria-live="polite" className="sr-only">
          {uploading ? `Uploading ${submission?.fileName ?? 'file'}` : result
            ? `CSV intake finished. ${result.summary.errors} row errors; ${result.details.w0_skipped?.length ?? 0} workflow handoffs skipped.` : ''}
        </p>

        {/* Upload Area */}
        {!result && (
          <div className="bg-white rounded-lg shadow-md p-8 mb-6">
            <div className="mb-5">
              <label htmlFor="csv-book" className="block text-sm font-medium text-gray-900">Book in this file</label>
              <select id="csv-book" value={bookId} disabled={uploading}
                onChange={event => { if (inFlight.current === null) { retrySnapshot.current = null; setKnownVersions({}); setBookId(event.target.value); setError(null); setRetryable(false); } }}
                className="mt-2 w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:opacity-60">
                <option value="book-mvp-simple-adventure">Adventure Compass</option>
                <option value="book-finding-our-inner-voice">Finding Our Inner Voice</option>
                <option value="per-item">Choose for each item</option>
              </select>
              <p className="mt-2 text-sm text-gray-600">Use one book for the file only when every item is that book. Otherwise choose for each item. Include every item and quantity for each Amazon order.</p>
              {bookId === 'book-finding-our-inner-voice' && (
                <p className="mt-2 text-sm text-gray-600">Each item needs an order-item-id or customization link. New orders need a working customization link containing the child's name and age.</p>
              )}
            </div>
            <div
              aria-disabled={uploading}
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
                    <p className="text-sm text-gray-700">{bookTitle}</p>
                    <p className="text-sm text-gray-500 mt-1">
                      {(file.size / 1024).toFixed(2)} KB
                    </p>
                  </div>
                  <button
                    onClick={handleReset}
                    disabled={uploading}
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
                    ref={browseButton}
                    onClick={handleBrowseClick}
                    disabled={uploading}
                    className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Upload className="h-4 w-4 mr-2" />
                    Browse Files
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    disabled={uploading}
                    accept=".csv,.txt"
                    onChange={handleFileInputChange}
                    className="hidden"
                  />
                </div>
              )}
            </div>

            {file && bookId === 'per-item' && (
              <section className="mt-6 space-y-3" aria-label="Books by source item">
                <h2 className="text-lg font-semibold text-gray-900">Choose each item's book</h2>
                {previewLoading && <p role="status" className="text-sm text-gray-600">Reading file items...</p>}
                {(previewFile === file ? previewItems : []).map(item => (
                  <div key={item.key} className="rounded-md border border-gray-200 p-4 space-y-2">
                    <p className="font-medium text-gray-900">{item.title}</p>
                    <p className="text-sm text-gray-600">{item.rootOrderId} · Item {item.source.value} · CSV row {item.rowNumber} · Quantity {item.quantity}{item.sku ? ` · ${item.sku}` : ''}</p>
                    {knownVersions[item.key] && knownVersions[item.key].bookId === itemBooks[item.key] && <p className="text-sm text-gray-600">Retained Amazon v{knownVersions[item.key].configVersion}</p>}
                    <label htmlFor={`item-book-${item.rowNumber}`} className="block text-sm font-medium text-gray-900">Book for CSV row {item.rowNumber}</label>
                    <select id={`item-book-${item.rowNumber}`} value={itemBooks[item.key] ?? ''} disabled={uploading || previewLoading}
                      onChange={event => { if (inFlight.current === null) { const value = event.target.value as ItemBookId | ''; setItemBooks(previous => ({ ...previous, [item.key]: value })); setKnownVersions(previous => { const updated = { ...previous }; delete updated[item.key]; return updated; }); setError(null); setRetryable(false); retrySnapshot.current = null; } }}
                      className="w-full rounded-md border border-gray-300 bg-white px-3 py-2 text-gray-900 disabled:opacity-60">
                      <option value="">Choose book</option>
                      <option value="book-mvp-simple-adventure">Adventure Compass</option>
                      <option value="book-finding-our-inner-voice">Finding Our Inner Voice</option>
                    </select>
                  </div>
                ))}
              </section>
            )}

            {error && (
              <div role="alert" className="mt-4 bg-red-50 border border-red-200 rounded-md p-4">
                <div className="flex">
                  <AlertTriangle className="h-5 w-5 text-red-400 mr-3 shrink-0" />
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-red-800">Upload Error</h3>
                    <p className="mt-1 text-sm text-red-700">{error}</p>
                  </div>
                </div>
              </div>
            )}

            {file && (!error || retryable) && (
              <div className="mt-6 flex justify-end">
                <button
                  onClick={handleUpload}
                  disabled={uploading || previewLoading || !choicesComplete}
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
                      {retryable ? 'Retry upload' : 'Upload CSV'}
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
              <div className="flex items-center justify-between mb-4 flex-wrap gap-3">
                <h2 ref={resultsHeading} tabIndex={-1} className="text-xl font-semibold text-gray-900">Upload Results</h2>
                <button
                  onClick={handleReset}
                  disabled={uploading}
                  className="text-sm text-gray-600 hover:text-gray-900 shrink-0"
                >
                  Upload Another File
                </button>
              </div>

              <p className="mb-4 text-sm text-gray-700">
                {submission?.fileName} · {submission?.bookId === 'per-item' ? 'Books selected by item' : result.selection?.title ?? 'Adventure Compass'}
                {result.selection ? ` · Amazon · v${result.selection.configVersion}` : ''}
              </p>
              {result.itemSelections && (
                <details className="mb-4 text-sm text-gray-700">
                  <summary className="cursor-pointer font-medium">Item book selections ({result.itemSelections.length})</summary>
                  <ul className="mt-2 space-y-2">
                    {result.itemSelections.map(item => <li key={itemSelectionKey(item)}>{item.rootOrderId} · {item.source.value} · {item.bookId === 'book-finding-our-inner-voice' ? 'Finding Our Inner Voice' : 'Adventure Compass'} · Amazon v{item.configVersion}</li>)}
                  </ul>
                </details>
              )}
              {result.summary.errors > 0 && submission?.bookId === 'per-item' && (
                <button onClick={() => { if (inFlight.current === null) { setResult(null); setError(null); setRetryable(true); } }}
                  className="mb-4 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900">Review same file</button>
              )}
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

            <section className="bg-white rounded-lg shadow-md p-6" aria-label="Workflow handoff">
              <h3 className="text-lg font-semibold text-gray-900">Workflow handoff</h3>
              <p className="mt-2 text-sm text-gray-700">{result.details.w0_triggered?.length ?? 0} accepted; {result.details.w0_skipped?.length ?? 0} skipped. Saving a row does not complete book generation.</p>
              {(result.details.w0_skipped?.length ?? 0) > 0 && (
                <ul className="mt-3 space-y-2 text-sm text-red-700">
                  {result.details.w0_skipped!.map((item, index) => <li key={`${item.orderId}-${index}`}>{item.orderId}: {item.reason}</li>)}
                </ul>
              )}
            </section>

            {/* Created Orders */}
            {result.details.created_orders && result.details.created_orders.length > 0 && (
              <div className="bg-white rounded-lg shadow-md p-6">
                <div className="flex items-center mb-4">
                  <CheckCircle className="h-5 w-5 text-blue-600 mr-2 shrink-0" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Created Orders ({result.details.created_orders.length})
                  </h3>
                </div>
                <div className="bg-blue-50 rounded-md p-4">
                  <p className="text-sm text-blue-800 mb-2">
                    Successfully created the following orders from CSV data:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.details.created_orders.filter(orderId => typeof orderId === 'string' && orderId.trim()).map((orderId) => (
                      <Link
                        key={orderId}
                        href={`/orders/${encodeURIComponent(orderId)}`}
                        className="inline-block px-3 py-1 bg-blue-100 text-blue-800 rounded text-sm hover:bg-blue-200 max-w-full min-w-0"
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
                  <CheckCircle className="h-5 w-5 text-green-600 mr-2 shrink-0" />
                  <h3 className="text-lg font-semibold text-gray-900">
                    Matched Orders ({result.details.matched_orders.length})
                  </h3>
                </div>
                <div className="bg-green-50 rounded-md p-4">
                  <p className="text-sm text-green-800 mb-2">
                    Successfully updated the following orders with customer data:
                  </p>
                  <div className="flex flex-wrap gap-2">
                    {result.details.matched_orders.filter(orderId => typeof orderId === 'string' && orderId.trim()).map((orderId) => (
                      <Link
                        key={orderId}
                        href={`/orders/${encodeURIComponent(orderId)}`}
                        className="inline-block px-3 py-1 bg-green-100 text-green-800 rounded text-sm hover:bg-green-200 max-w-full min-w-0"
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
                  <AlertTriangle className="h-5 w-5 text-yellow-600 mr-2 shrink-0" />
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
                        className="inline-block px-3 py-1 bg-yellow-100 text-yellow-800 rounded text-sm max-w-full min-w-0"
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
                  <AlertTriangle className="h-5 w-5 text-red-600 mr-2 shrink-0" />
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
            {result.summary.errors === 0 && result.summary.pending === 0 && (result.details.w0_skipped?.length ?? 0) === 0 && (
              <div className="bg-green-50 border border-green-200 rounded-md p-4">
                <div className="flex">
                  <CheckCircle className="h-5 w-5 text-green-400 mr-3" />
                  <div>
                    <h3 className="text-sm font-medium text-green-800">CSV intake saved</h3>
                    <p className="mt-1 text-sm text-green-700">
                      {result.summary.created + result.summary.matched > 0
                        ? `${result.summary.created} rows created; ${result.summary.matched} updated. Generation continues separately.`
                        : 'No order rows found in this file.'}
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

