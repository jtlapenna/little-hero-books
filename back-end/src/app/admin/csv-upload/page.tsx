'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { AlertTriangle, CheckCircle, Loader2, Upload } from 'lucide-react';

type Snapshot = Readonly<{ file: File; workflowTest: boolean }>;
interface UploadResult {
  success: true;
  summary: { total_rows: number; matched: number; created: number; pending: number; errors: number };
  details: {
    matched_orders: string[]; created_orders: string[]; pending_orders: string[];
    w0_triggered?: string[]; w0_skipped?: Array<{ orderId: string; reason: string }>;
    errors: Array<{ row: number; orderId: string | null; error: string }>;
  };
  selection: { bookId: string; formatId: string; configVersion: number; title: string };
  timestamp: string;
}
function record(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function isUploadResult(value: unknown): value is UploadResult {
  const count = (v: unknown) => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;
  const strings = (v: unknown) => Array.isArray(v) && v.every(item => typeof item === 'string');
  if (!record(value) || value.success !== true || !record(value.summary) || !record(value.details) || !record(value.selection)) return false;
  const { summary, details, selection } = value;
  return ['total_rows', 'matched', 'created', 'pending', 'errors'].every(key => count(summary[key])) &&
    ['matched_orders', 'created_orders', 'pending_orders'].every(key => strings(details[key])) &&
    Array.isArray(details.errors) && details.errors.every(item => record(item) && count(item.row) &&
      (item.orderId === null || typeof item.orderId === 'string') && typeof item.error === 'string') &&
    (details.w0_triggered === undefined || strings(details.w0_triggered)) &&
    (details.w0_skipped === undefined || (Array.isArray(details.w0_skipped) && details.w0_skipped.every(item =>
      record(item) && typeof item.orderId === 'string' && typeof item.reason === 'string'))) &&
    selection.bookId === 'book-finding-our-inner-voice' && selection.formatId === 'amazon' &&
    typeof selection.configVersion === 'number' && Number.isSafeInteger(selection.configVersion) && selection.configVersion >= 2 &&
    typeof selection.title === 'string' && selection.title.trim().length > 0 &&
    typeof value.timestamp === 'string' && Number.isFinite(Date.parse(value.timestamp));
}

export default function CsvUploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [workflowTest, setWorkflowTest] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [retryable, setRetryable] = useState(false);
  const [submission, setSubmission] = useState<Snapshot | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const resultsHeading = useRef<HTMLHeadingElement>(null);
  const browseButton = useRef<HTMLButtonElement>(null);
  const inFlight = useRef(false);
  const retrySnapshot = useRef<Snapshot | null>(null);
  const requestSequence = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const resetFocus = useRef(false);
  useEffect(() => () => { requestSequence.current++; controller.current?.abort(); }, []);
  useEffect(() => {
    if (result) resultsHeading.current?.focus();
    else if (!file && resetFocus.current) { resetFocus.current = false; browseButton.current?.focus(); }
  }, [file, result]);

  const chooseFile = (selected: File) => {
    if (inFlight.current) return;
    retrySnapshot.current = null;
    setFile(null); setRetryable(false); setResult(null); setSubmission(null);
    if (!/\.(csv|txt)$/i.test(selected.name)) { setError('Choose an Amazon CSV or tab-separated order report.'); return; }
    if (selected.size > 10 * 1024 * 1024) { setError('The file exceeds the 10 MB limit.'); return; }
    setFile(selected); setError(null);
  };
  const reset = () => {
    if (inFlight.current) return;
    resetFocus.current = true;
    retrySnapshot.current = null;
    setFile(null); setResult(null); setError(null); setRetryable(false); setSubmission(null);
    if (fileInput.current) fileInput.current.value = '';
  };
  const upload = async () => {
    if (!file || inFlight.current) return;
    const saved = retrySnapshot.current;
    const snapshot = retryable && saved?.file === file && saved.workflowTest === workflowTest
      ? saved : Object.freeze({ file, workflowTest });
    retrySnapshot.current = snapshot;
    inFlight.current = true;
    const sequence = ++requestSequence.current;
    const abort = new AbortController(); controller.current = abort;
    setSubmission(snapshot); setUploading(true); setError(null); setResult(null); setRetryable(false);
    try {
      const form = new FormData(); form.append('file', snapshot.file);
      if (snapshot.workflowTest) form.append('admin_workflow_test', 'true');
      const response = await fetch('/api/admin/amazon-orders/upload-csv', { method: 'POST', body: form, signal: abort.signal });
      const body: unknown = await response.json();
      if (sequence !== requestSequence.current) return;
      if (!response.ok) throw new Error(record(body) && typeof body.error === 'string' ? body.error : 'The upload could not be completed.');
      if (!isUploadResult(body)) throw new Error('The upload result could not be confirmed. Check Orders before retrying this file.');
      setResult(body);
    } catch (cause) {
      if (sequence !== requestSequence.current || abort.signal.aborted) return;
      setError(cause instanceof Error && !(cause instanceof TypeError) ? cause.message : 'The upload could not be confirmed. Check Orders before retrying this file.'); setRetryable(true);
    } finally {
      if (sequence === requestSequence.current) { inFlight.current = false; setUploading(false); controller.current = null; }
    }
  };
  const orderIds = result ? [...new Set([...result.details.created_orders, ...result.details.matched_orders, ...result.details.pending_orders])] : [];
  return <div className="min-h-screen bg-gray-50"><main className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8 [overflow-wrap:anywhere]">
    <div className="mb-8 flex flex-wrap items-start justify-between gap-4"><div>
      <h1 className="text-3xl font-bold text-gray-900">CSV Upload</h1>
      <p className="mt-2 text-gray-600">Import an Amazon order report. The book is identified from its SKU or ASIN.</p>
    </div><Link href="/" className="text-sm text-gray-600 hover:text-gray-900">← Back to Home</Link></div>
    <p role="status" aria-live="polite" className="sr-only">{uploading ? `Uploading ${submission?.file.name}` : result ? `CSV intake finished with ${result.summary.errors} row errors.` : ''}</p>
    {!result && <section aria-label="Upload an order report" className="mb-6 rounded-lg bg-white p-6 shadow-md sm:p-8">
      <p className="mb-5 text-sm text-gray-700">Recognized Finding Our Inner Voice orders use the current published edition. Unrecognized listings need correction before import.</p>
      <label className="mb-2 flex items-start gap-3 text-sm font-medium text-gray-900"><input type="checkbox" checked={workflowTest} disabled={uploading} aria-describedby="workflow-test-help"
        className="mt-0.5 h-4 w-4 rounded border-gray-400" onChange={event => { if (!inFlight.current) { setWorkflowTest(event.target.checked); retrySnapshot.current = null; setRetryable(false); setError(null); } }} />Run a workflow test</label>
      <p id="workflow-test-help" className="mb-6 text-sm text-gray-600">Use one new order with quantity one. Generate and review the book normally, suppress customer messages, and pause printing for your separate approval.</p>
      <div onDragOver={event => event.preventDefault()} onDrop={event => { event.preventDefault(); if (event.dataTransfer.files[0]) chooseFile(event.dataTransfer.files[0]); }} className="rounded-lg border-2 border-dashed border-gray-300 p-8 text-center">
        <Upload aria-hidden="true" className="mx-auto mb-3 h-10 w-10 text-gray-400" />
        <p className="font-medium text-gray-900">{file?.name ?? 'Drag and drop your order report here or browse for a file.'}</p>
        {file && <><p className="mt-1 text-sm text-gray-600">{(file.size / 1024).toFixed(2)} KB · Book identified on upload</p>
          <button type="button" onClick={reset} disabled={uploading} className="mt-4 text-sm text-gray-700 disabled:opacity-50">Remove file</button></>}
        <input ref={fileInput} type="file" accept=".csv,.txt" className="hidden" aria-label="Amazon order report" disabled={uploading} onChange={event => { if (event.target.files?.[0]) chooseFile(event.target.files[0]); }} />
        {!file && <button ref={browseButton} type="button" onClick={() => fileInput.current?.click()} disabled={uploading} className="mt-4 rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900">Browse Files</button>}
      </div>
      {error && <div role="alert" className="mt-4 flex gap-3 rounded-md border border-red-200 bg-red-50 p-4 text-sm text-red-800"><AlertTriangle aria-hidden="true" className="h-5 w-5 shrink-0" /><p>{error}</p></div>}
      {file && <div className="mt-6 flex justify-end"><button type="button" onClick={() => void upload()} disabled={uploading} className="inline-flex items-center gap-2 rounded-md bg-blue-600 px-6 py-3 font-medium text-white hover:bg-blue-700 disabled:opacity-50">
        {uploading ? <Loader2 aria-hidden="true" className="h-5 w-5 animate-spin" /> : <Upload aria-hidden="true" className="h-5 w-5" />}{uploading ? 'Uploading…' : retryable ? 'Retry upload' : 'Upload CSV'}</button></div>}
    </section>}
    {result && <section className="space-y-5 rounded-lg bg-white p-6 shadow-md">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 ref={resultsHeading} tabIndex={-1} className="text-xl font-semibold text-gray-900">Upload Results</h2><button type="button" onClick={reset} className="text-sm text-gray-700">Upload Another File</button></div>
      <p className="text-sm text-gray-700">{submission?.file.name} · {result.selection.title} · Amazon · v{result.selection.configVersion}</p>
      {submission?.workflowTest && result.summary.created > 0 && <p className="text-sm text-gray-700">Workflow test · Customer messages suppressed · Printing requires separate approval</p>}
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-5">{([['Rows', result.summary.total_rows], ['Created', result.summary.created], ['Updated', result.summary.matched], ['Pending', result.summary.pending], ['Errors', result.summary.errors]] as const).map(([label, count]) => <div key={label} className="rounded-md bg-gray-50 p-3"><dt className="text-sm text-gray-600">{label}</dt><dd className="text-2xl font-semibold text-gray-900">{count}</dd></div>)}</dl>
      {!!result.details.w0_triggered?.length && <p className="flex gap-2 text-sm text-green-800"><CheckCircle aria-hidden="true" className="h-5 w-5 shrink-0" />W0 started for {result.details.w0_triggered.length} order(s). It creates the 1-manifest before W2A is routed.</p>}
      {!!result.details.errors.length && <div role="alert" className="rounded-md bg-red-50 p-4 text-sm text-red-800"><h3 className="font-medium">Rows needing attention</h3><ul className="mt-2 space-y-2">{result.details.errors.map((item, index) => <li key={index}>Row {item.row}{item.orderId ? ` · ${item.orderId}` : ''}: {item.error}</li>)}</ul></div>}
      {!!result.details.w0_skipped?.length && <div role="alert" className="rounded-md bg-amber-50 p-4 text-sm text-amber-900"><h3 className="font-medium">W0 handoffs needing attention</h3><ul className="mt-2 space-y-2">{result.details.w0_skipped.map((item, index) => <li key={index}>{item.orderId}: {item.reason}</li>)}</ul></div>}
      {!!orderIds.length && <div><h3 className="font-medium text-gray-900">Orders</h3><ul className="mt-2 space-y-2">{orderIds.map(id => <li key={id}><Link href={`/orders/${encodeURIComponent(id)}`} className="text-blue-700 underline">{id}</Link></li>)}</ul></div>}
    </section>}
    <aside className="mt-6 text-sm text-gray-600"><p>Use the original Amazon report with order IDs, shipping details, listing identifiers, and customization links. Include every item and quantity for each order.</p><p className="mt-2">A CSV upload starts W0 automatically. The workflow router starts W2A after the 1-manifest is ready.</p></aside>
  </main></div>;
}
