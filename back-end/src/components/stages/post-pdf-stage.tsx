'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import {
  CheckCircle,
  Play,
  Download,
  Flag,
  Loader2,
  AlertCircle,
  ChevronLeft,
  ChevronRight,
  Clipboard,
  Printer,
  X,
} from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';
import { AssetGrid } from '@/components/assets/asset-grid';
import { formatDate } from '@/lib/utils';

const PDFJS_VERSION = '5.4.394';
let pdfjsLibSingleton: typeof import('pdfjs-dist') | null = null;
let pdfjsLibPromise: Promise<typeof import('pdfjs-dist')> | null = null;

async function loadPdfjs(workerOverride?: string) {
  if (pdfjsLibSingleton) {
    if (workerOverride && typeof window !== 'undefined') {
      pdfjsLibSingleton.GlobalWorkerOptions.workerSrc = workerOverride;
    }
    return pdfjsLibSingleton;
  }

  if (typeof window === 'undefined') {
    throw new Error('PDF.js can only be loaded in the browser');
  }

  if (!pdfjsLibPromise) {
    pdfjsLibPromise = import('pdfjs-dist').then((lib) => {
      const workerSrc =
        workerOverride ??
        `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;

      lib.GlobalWorkerOptions.workerSrc = workerSrc;
      pdfjsLibSingleton = lib;
      return lib;
    });
  }

  const lib = await pdfjsLibPromise;

  if (workerOverride && typeof window !== 'undefined') {
    lib.GlobalWorkerOptions.workerSrc = workerOverride;
}

  return lib;
}

interface FinalApprovalStateProps {
  previewUrl: string;
  token: string;
  requestedAt?: string;
  tokenCreated?: boolean;
  notification?: {
    attempted: boolean;
    sent: boolean;
    reason?: string;
    response?: unknown;
  };
}

interface PostPdfStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: (nextStatus: 'approved' | 'pending') => void;
  onInitiateWorkflow: () => void;
  onRefresh?: () => void;
  finalApprovalResult?: FinalApprovalStateProps | null;
  finalApprovalError?: string | null;
  finalApprovalLoading?: boolean;
  onSendToPrint?: () => Promise<void> | void;
  onOrderUpdate?: (updates: Partial<Order>) => void;
}

interface PageData {
  pageNumber: number;
  previewImageUrl: string;
  cloudflareImageId?: string;
  r2Key?: string;
}

interface CoverData {
  fullImageUrl: string;
  isFrontCover?: boolean; // true for front cover (right half), false for back cover (left half)
  isBackCover?: boolean;
}

interface SpreadData {
  spreadNumber: number;
  leftPage?: PageData;
  rightPage?: PageData;
  coverData?: CoverData; // For cover spreads
  isCover: boolean;
  isBackCover: boolean;
}

// Asset interface for AssetGrid component
interface Asset {
  id: string;
  name: string;
  url: string;
  isFlagged: boolean;
  hasTransparentBackground?: boolean;
  isMissing?: boolean;
  status?: string;
  reviewReason?: string;
  attempts?: number;
  comparisonMode?: 'reference' | 'background' | null;
  comparisonImageUrl?: string;
  comparisonLabel?: string;
  poseNumber?: number;
  pageNumber?: number;
  onFlip?: () => void;
  isFlipping?: boolean;
  r2Key?: string; // R2 key for replacement operations
}

// Create spreads from pages, including cover pages if cover image is available
function createSpreads(pages: PageData[], coverImageUrl?: string): SpreadData[] {
  const spreads: SpreadData[] = [];
  
  // Add front cover spread (blank left, cover right half) if cover is available
  if (coverImageUrl) {
    spreads.push({
      spreadNumber: 0,
      leftPage: undefined, // Blank inside cover
      rightPage: undefined,
      coverData: {
        fullImageUrl: coverImageUrl,
        isFrontCover: true,
        isBackCover: false
      },
      isCover: true,
      isBackCover: false
    });
  }
  
  // Find dedication page (page 0) and story pages (pages 1-15)
  const dedicationPage = pages.find(p => p.pageNumber === 0);
  const storyPages = pages.filter(p => p.pageNumber >= 1).sort((a, b) => a.pageNumber - b.pageNumber);
  
  // Add dedication spread (blank left, page00 right)
  if (dedicationPage) {
    spreads.push({
      spreadNumber: spreads.length,
      leftPage: undefined, // Blank inside cover
      rightPage: dedicationPage,
      isCover: false,
      isBackCover: false
    });
  }
  
  // Interior spreads: pair story pages (1-2, 3-4, 5-6, etc.)
  for (let i = 0; i < storyPages.length; i += 2) {
    spreads.push({
      spreadNumber: spreads.length,
      leftPage: storyPages[i],
      rightPage: storyPages[i + 1] || undefined, // Last spread might have only left page (page 15)
      isCover: false,
      isBackCover: false
    });
  }
  
  // Add back cover spread (cover left half, blank right) if cover is available
  if (coverImageUrl) {
    spreads.push({
      spreadNumber: spreads.length,
      leftPage: undefined,
      rightPage: undefined, // Blank inside back cover
      coverData: {
        fullImageUrl: coverImageUrl,
        isFrontCover: false,
        isBackCover: true
      },
      isCover: false,
      isBackCover: true
    });
  }
  
  return spreads;
}

export function PostPdfStage({
  orderId,
  order,
  isApproved,
  onApprove,
  onInitiateWorkflow,
  onRefresh,
  finalApprovalResult,
  finalApprovalError,
  finalApprovalLoading,
  onSendToPrint,
  onOrderUpdate,
}: PostPdfStageProps) {
  const [approveStageConfirmed, setApproveStageConfirmed] = useState(!!isApproved);
  
  // Update approveStageConfirmed when isApproved prop changes
  useEffect(() => {
    setApproveStageConfirmed(!!isApproved);
  }, [isApproved]);

  const [pdfAsset, setPdfAsset] = useState({
    id: 'compiled-pdf',
    name: 'Compiled PDF',
    url: '',
    isFlagged: false,
    exists: false,
    loading: true,
    error: null as string | null
  });

  const [pages, setPages] = useState<PageData[]>([]);
  const [spreads, setSpreads] = useState<SpreadData[]>([]);
  const [currentSpreadIndex, setCurrentSpreadIndex] = useState(0);
  const [loadingPages, setLoadingPages] = useState(false);
  const [pagesError, setPagesError] = useState<string | null>(null);
  const [pageAssets, setPageAssets] = useState<Asset[]>([]);
  const [isReplacing, setIsReplacing] = useState<string | null>(null);
  // Track pages that the user has manually unflagged (persist across re-renders)
  const manuallyUnflaggedRef = useRef<Set<string>>(new Set());
  // Track pages that the user has manually flagged (persist across re-renders)
  const manuallyFlaggedRef = useRef<Set<string>>(new Set());
  // Track if we're using fallback URLs (images not in manifest yet)
  const [usingFallbackUrls, setUsingFallbackUrls] = useState(false);
  const [imageLoading, setImageLoading] = useState({ left: true, right: true });
  const [imageError, setImageError] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageLoading, setCoverImageLoading] = useState(false);
  const [coverImageDataUrl, setCoverImageDataUrl] = useState<string | null>(null); // Legacy: previously used for PDFs converted to images (now unused, cover PNG used directly)
  const coverCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const [copied, setCopied] = useState(false);
  const [sendingToPrint, setSendingToPrint] = useState(false);

  const previewUrl =
    finalApprovalResult?.previewUrl || order.customerPreview?.url || null;
  const previewToken = finalApprovalResult?.token || order.customerPreview?.token;
  const previewRequestedAt =
    finalApprovalResult?.requestedAt ||
    order.customerPreview?.requestedAt ||
    order.customerApprovalRequestedAt;
  const previewExpiresAt = order.customerPreview?.expiresAt;
  const hasExistingPreview = Boolean(order.customerPreview?.url);
  const previewJustSent = Boolean(finalApprovalResult?.previewUrl);
  const customerApprovalStatus = order.customerApprovalStatus ?? '';
  const orderStatus = order.status ?? '';
  const revisionCount = typeof order.revisionCount === 'number' ? order.revisionCount : 0;
  const customerRevisionUsed = revisionCount >= 1;

  // Button logic:
  // - First Review (revisionCount === 0): After Send for Customer Approval → Show "Send Proof" button
  // - Second Review (revisionCount >= 1): After Send for Customer Approval → Show "Send to Print" button
  // 
  // Show "Send to Print" only if:
  // 1. Stage is approved
  // 2. We're in second review (revisionCount >= 1)
  // This ensures we show "Send to Print" after customer has used their revision
  // On first approval (revisionCount === 0), show "Send Proof" instead
  const showPrintAction = isApproved && customerRevisionUsed;
  const finalApprovalIsLoading = Boolean(finalApprovalLoading);

  const pdfPath = `book-mvp-simple-adventure/orders/${orderId}/complete_book_${orderId}.pdf`;
  const pdfUrl = `/api/pdf/${pdfPath}`;

  // Check if workflow 3 has completed
  // Workflow 3 is complete if manifest3Url exists or workflowStep is 'book_assembly_completed'
  const workflow3Completed = !!(
    order.manifest3Url ||
    order.workflowStep === 'book_assembly_completed'
  );

  // Track if images have been successfully loaded from manifest (stop polling once found)
  const imagesFoundRef = useRef(false);
  // Track last loaded pages data to prevent unnecessary re-renders
  const lastPagesDataRef = useRef<string>('');
  // Track if pages have been loaded (to prevent loading state during polling)
  const pagesLoadedRef = useRef(false);
  // Store loadPages function in ref so it can be called from handlePageReplace
  const loadPagesRef = useRef<(() => Promise<void>) | null>(null);
  // Track spreads length for keyboard navigation to avoid stale closures
  const spreadsLengthRef = useRef(0);
  // Track last spread index to prevent unnecessary loading state resets
  const lastSpreadIndexRef = useRef<number | null>(null);
  // Track last spread key to detect if current spread actually changed
  const lastSpreadKeyRef = useRef<string>('');
  // Track previous spreads to detect actual content changes
  const previousSpreadsRef = useRef<SpreadData[]>([]);
  // Track if ref callback has already handled cached image to prevent multiple calls
  const coverImageRefHandledRef = useRef<{ 
    front: boolean; 
    back: boolean; 
    lastFrontCoverUrl?: string;
    lastBackCoverUrl?: string;
  }>({ front: false, back: false });
  // Track preloaded images to keep them in browser cache
  const preloadedImagesRef = useRef<Set<string>>(new Set());

  useEffect(() => {
    setCopied(false);
  }, [previewUrl]);

  useEffect(() => {
    if (finalApprovalResult && typeof onRefresh === 'function') {
      onRefresh();
    }
  }, [finalApprovalResult, onRefresh]);

  // Reset ref and spread index when orderId changes
  useEffect(() => {
    imagesFoundRef.current = false;
    lastPagesDataRef.current = '';
    pagesLoadedRef.current = false;
    spreadsLengthRef.current = 0;
    lastSpreadIndexRef.current = null;
    lastSpreadKeyRef.current = '';
    previousSpreadsRef.current = [];
    setCoverImageUrl(null);
    setCoverImageDataUrl(null);
    preloadedImagesRef.current.clear(); // Clear preloaded images when order changes
    setCurrentSpreadIndex(0); // Always start at first spread when viewing a new order
  }, [orderId]);

  // Helper function to convert PDF to image using PDF.js
  // Use useCallback to prevent function recreation on every render
  const convertPdfToImage = useCallback(async (pdfUrl: string): Promise<string> => {
    if (typeof window === 'undefined') {
      throw new Error('PDF to image conversion requires a browser environment');
    }

    const attemptConversion = async (workerUrl?: string): Promise<string> => {
      const pdfjsLib = await loadPdfjs(workerUrl);
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1);
      
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not get canvas context');
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      await page
        .render({
        canvas: canvas,
        canvasContext: context,
          viewport,
        })
        .promise;
      
      return canvas.toDataURL('image/jpeg', 0.85);
    };
    
    try {
      console.log('[Pages] Converting PDF to image:', pdfUrl);
      const dataUrl = await attemptConversion();
      console.log('[Pages] ✓ PDF converted to image successfully');
      return dataUrl;
    } catch (error: any) {
      const errorMessage = error?.message || String(error);
      const isWorkerError =
        typeof window !== 'undefined' &&
        ['worker', 'Failed to fetch', 'NetworkError', '404'].some((fragment) =>
          errorMessage.includes(fragment)
        );
      
      if (isWorkerError) {
        const cdnUrl = `https://unpkg.com/pdfjs-dist@${PDFJS_VERSION}/build/pdf.worker.min.mjs`;
        console.warn('[Pages] Worker error detected, retrying with CDN worker:', cdnUrl);
        return attemptConversion(cdnUrl);
      }

      console.error('[Pages] Error converting PDF to image:', error);
      throw error;
    }
  }, []);

  // Load preview images from 3-manifest or construct directly from R2
  useEffect(() => {
    let isMounted = true;
    let intervalId: NodeJS.Timeout | null = null;

    const loadPages = async () => {
      if (!isMounted) return;

      // Don't reload if we already have images from the manifest
      if (imagesFoundRef.current) {
        console.log('[Pages] Images already found, skipping reload');
        // Make sure loading state is false if we're skipping
        setLoadingPages(false);
        return;
      }

      // Prevent loading state from resetting during polling when pages/images already exist
      // Use ref to avoid stale closure issues
      if (pagesLoadedRef.current) {
        console.log('[Pages] Pages already loaded, skipping loading state during polling');
        setLoadingPages(false);
        return;
      }

      // Only set loading if we're actually going to load new data
      setLoadingPages(true);
      setPagesError(null);

      try {
        // Try 3-manifest first (has preview images with correct URLs)
        const manifest3Key = `book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`;
        // Add cache-busting to ensure we get the latest manifest after image replacements
        const cacheBuster = `?v=${Date.now()}`;
        const manifest3Url = `/api/manifests/${manifest3Key}${cacheBuster}`; // Use relative URL with cache-busting
        
        let pageData: PageData[] = [];
        let foundInManifest = false;
        let manifest3: any = null; // Store at function scope for reuse
        
        try {
          console.log('[Pages] Fetching manifest from:', manifest3Url);
          const manifest3Res = await fetch(manifest3Url, {
            cache: 'no-store', // Ensure we don't use cached manifest
          });
          
          if (manifest3Res.ok) {
            const manifest3Raw = await manifest3Res.json();
            
            console.log('[Pages] Raw manifest response type:', Array.isArray(manifest3Raw) ? 'array' : 'object');
            console.log('[Pages] Raw manifest keys (first 20):', manifest3Raw ? Object.keys(manifest3Raw).slice(0, 20) : 'null');
            
            // Handle array response (manifest might be wrapped in array)
            // If array, unwrap it - the first element should have the data
            manifest3 = Array.isArray(manifest3Raw) ? manifest3Raw[0] : manifest3Raw;
            
            // If the unwrapped object has a nested 'manifest' property, use that instead
            // This handles cases where the structure is: [{ manifest: {...}, pagePreviewImages: [...] }]
            if (manifest3?.manifest && typeof manifest3.manifest === 'object') {
              // Merge manifest properties with top-level properties (pagePreviewImages might be at top level)
              manifest3 = {
                ...manifest3.manifest,
                // Preserve top-level properties that might not be in manifest
                pagePreviewImages: manifest3.pagePreviewImages || manifest3.manifest.pagePreviewImages,
                orderId: manifest3.orderId,
                characterHash: manifest3.characterHash || manifest3.manifest.characterHash,
              };
            }
            
            console.log('[Pages] Processed manifest type:', Array.isArray(manifest3Raw) ? 'array[0]' : 'object');
            console.log('[Pages] Processed manifest keys (first 20):', manifest3 ? Object.keys(manifest3).slice(0, 20) : 'null');
            
            // Check multiple possible locations for pagePreviewImages
            // Try top-level first (most common), then nested in manifest, then bookAssembly
            let previewImages = manifest3?.pagePreviewImages 
              || manifest3?.manifest?.pagePreviewImages
              || manifest3?.bookAssembly?.pagePreviewImages 
              || [];
            
            // Fallback: Build from pngGeneration.pages (R2 keys stored as strings: pages.p01 = "r2/key/path")
            if (!previewImages || previewImages.length === 0) {
              const pagesObj = manifest3?.pngGeneration?.pages 
                || manifest3?.manifest?.pngGeneration?.pages 
                || {};
              
              if (pagesObj && typeof pagesObj === 'object' && Object.keys(pagesObj).length > 0) {
                console.log('[Pages] Building pagePreviewImages from pngGeneration.pages');
                // Convert pages object (p01: "r2/key", p02: "r2/key", etc.) to array format
                // IMPORTANT: Deduplicate page 0 entries (p00 and p00_dedication both map to pageNumber 0)
                const allEntries = Object.entries(pagesObj).map(([key, r2Key]: [string, any]) => {
                  // Parse page number from key: p00_dedication -> 0, p00 -> 0, p01 -> 1, p02 -> 2, etc.
                  let pageNumber = 0;
                  if (key === 'p00_dedication' || key === 'p00') {
                    pageNumber = 0;
                  } else if (key.startsWith('p')) {
                    const numStr = key.substring(1);
                    const num = parseInt(numStr, 10);
                    if (!isNaN(num)) {
                      pageNumber = num;
                    }
                  }
                  
                  return {
                    pageNumber,
                    originalKey: key, // Keep track of original key for deduplication
                    r2Key: typeof r2Key === 'string' ? r2Key : null,
                    imageUrl: typeof r2Key === 'string' ? `/api/assets/${r2Key}` : null, // Construct URL immediately for R2 fallback
                    filename: null
                  };
                });
                
                // Deduplicate: for page 0, prefer p00_dedication over p00; for other pages, keep first occurrence
                const pageMap = new Map<number, any>(); // Map pageNumber -> entry
                
                // Debug: Log all entries before deduplication
                const page0Entries = allEntries.filter((e: any) => e.pageNumber === 0);
                if (page0Entries.length > 1) {
                  console.log('[Pages] ⚠️ Found multiple page 0 entries before deduplication:', page0Entries.map((e: any) => e.originalKey));
                }
                
                // First pass: collect all entries, preferring p00_dedication for page 0
                for (const img of allEntries) {
                  // Filter out entries without r2Key (except page 0)
                  if (img.pageNumber !== 0 && !img.r2Key) {
                    continue;
                  }
                  
                  const existing = pageMap.get(img.pageNumber);
                  if (!existing) {
                    // First time seeing this page number
                    pageMap.set(img.pageNumber, img);
                  } else if (img.pageNumber === 0) {
                    // Special case for page 0: ALWAYS prefer p00_dedication over p00
                    if (img.originalKey === 'p00_dedication') {
                      // p00_dedication always wins, replace whatever is there
                      pageMap.set(0, img);
                      console.log('[Pages] ✅ Replaced page 0 entry with p00_dedication');
                    } else if (img.originalKey === 'p00' && existing.originalKey !== 'p00_dedication') {
                      // Only keep p00 if we don't already have p00_dedication
                      // (This case shouldn't happen if p00_dedication exists, but handle it)
                      console.log('[Pages] ⚠️ Keeping p00 (p00_dedication not found)');
                    }
                    // If existing is p00_dedication and this is p00, skip it (already have better one)
                  }
                  // For other pages, keep first occurrence (already in map)
                }
                
                // Convert map back to array
                previewImages = Array.from(pageMap.values());
                
                // Debug: Verify deduplication worked
                const finalPage0Entries = previewImages.filter((e: any) => e.pageNumber === 0);
                if (finalPage0Entries.length > 1) {
                  console.error('[Pages] ❌ ERROR: Still have multiple page 0 entries after deduplication:', finalPage0Entries.map((e: any) => e.originalKey));
                } else if (finalPage0Entries.length === 1) {
                  console.log('[Pages] ✅ Page 0 deduplication successful, using:', finalPage0Entries[0].originalKey);
                }
                
                console.log(`[Pages] Built ${previewImages.length} pages from pngGeneration.pages (after deduplication)`);
              }
            }
            
            // Fallback: Build from pngGeneration.storyImages if pagePreviewImages still doesn't exist
            if (!previewImages || previewImages.length === 0) {
              const storyImages = manifest3?.pngGeneration?.storyImages 
                || manifest3?.manifest?.pngGeneration?.storyImages 
                || [];
              if (storyImages && storyImages.length > 0) {
                console.log('[Pages] Building pagePreviewImages from pngGeneration.storyImages');
                previewImages = storyImages.map((img: any) => ({
                  pageNumber: img.pageNumber || 0,
                  r2Key: img.r2Key || null,
                  imageUrl: img.imageUrl || null,
                  filename: img.filename || null
                }));
              }
            }
            
            // Get Cloudflare Images data from pagesWithCloudflare if available
            const pagesWithCloudflare = manifest3?.manifest?.pngGeneration?.pagesWithCloudflare 
              || manifest3?.pngGeneration?.pagesWithCloudflare 
              || {};
            
            // Debug: Log Cloudflare Images data location
            console.log('[Pages] Cloudflare Images check:', {
              hasManifestNested: !!manifest3?.manifest?.pngGeneration?.pagesWithCloudflare,
              hasPngGenTopLevel: !!manifest3?.pngGeneration?.pagesWithCloudflare,
              pagesWithCloudflareKeys: Object.keys(pagesWithCloudflare),
              pagesWithCloudflareCount: Object.keys(pagesWithCloudflare).length,
              samplePage: pagesWithCloudflare['p01'] || pagesWithCloudflare['p00_dedication'] || null
            });
            
            console.log('[Pages] Manifest check:', {
              isArray: Array.isArray(manifest3Raw),
              hasPagePreviewImages: !!manifest3?.pagePreviewImages,
              hasManifestPagePreviewImages: !!manifest3?.manifest?.pagePreviewImages,
              hasBookAssemblyPagePreviewImages: !!manifest3?.bookAssembly?.pagePreviewImages,
              hasPngGenerationStoryImages: !!(manifest3?.pngGeneration?.storyImages || manifest3?.manifest?.pngGeneration?.storyImages),
              previewImagesCount: previewImages.length,
              pagesWithCloudflareCount: Object.keys(pagesWithCloudflare).length,
              manifestStructure: Object.keys(manifest3 || {}).slice(0, 10),
              samplePagePreviewImage: previewImages[0] || null
            });
            
            // Debug: Log the actual manifest structure if pagePreviewImages is not found
            if (!previewImages || previewImages.length === 0) {
              console.warn('[Pages] ⚠️ pagePreviewImages not found in manifest. Available keys:', {
                topLevel: Object.keys(manifest3 || {}),
                manifestKeys: manifest3?.manifest ? Object.keys(manifest3.manifest) : null,
                pngGenKeys: manifest3?.pngGeneration ? Object.keys(manifest3.pngGeneration) : null,
                manifestPngGenKeys: manifest3?.manifest?.pngGeneration ? Object.keys(manifest3.manifest.pngGeneration) : null
              });
              
              // Log what's actually in pngGeneration
              if (manifest3?.pngGeneration) {
                console.log('[Pages] pngGeneration structure:', {
                  keys: Object.keys(manifest3.pngGeneration),
                  pages: manifest3.pngGeneration.pages ? Object.keys(manifest3.pngGeneration.pages).slice(0, 5) : null,
                  storyImages: manifest3.pngGeneration.storyImages ? `Array(${manifest3.pngGeneration.storyImages.length})` : null,
                  pagesWithCloudflare: manifest3.pngGeneration.pagesWithCloudflare ? Object.keys(manifest3.pngGeneration.pagesWithCloudflare).slice(0, 5) : null
                });
              }
              
              // Check if top-level 'pages' contains the data
              if (manifest3?.pages) {
                console.log('[Pages] Top-level pages structure:', {
                  type: Array.isArray(manifest3.pages) ? 'array' : typeof manifest3.pages,
                  keys: typeof manifest3.pages === 'object' && !Array.isArray(manifest3.pages) ? Object.keys(manifest3.pages).slice(0, 10) : null,
                  length: Array.isArray(manifest3.pages) ? manifest3.pages.length : null
                });
              }
            }
            
            if (previewImages && Array.isArray(previewImages) && previewImages.length > 0) {
              foundInManifest = true;
              // Use preview images from manifest
              pageData = previewImages
                .sort((a: any, b: any) => a.pageNumber - b.pageNumber)
                .map((img: any) => {
                  const pageNum = Number(img.pageNumber || 0);
                  const pageKey = pageNum === 0 ? 'p00_dedication' : (pageNum < 10 ? `p0${pageNum}` : `p${pageNum}`);
                  
                  // Get Cloudflare Images data from pagesWithCloudflare if not in pagePreviewImages
                  // For page 0, check both p00_dedication and p00 keys
                  const cfData = pageNum === 0 
                    ? (pagesWithCloudflare['p00_dedication'] || pagesWithCloudflare['p00'] || null)
                    : (pagesWithCloudflare[pageKey] || null);
                  const cloudflareImageUrl = img.cloudflareImageUrl || cfData?.cloudflareImageUrl || null;
                  const cloudflareImageId = img.cloudflareImageId || cfData?.cloudflareImageId || null;
                  
                  // Debug: Log if Cloudflare data exists for this page
                  if (cfData) {
                    console.log(`[Pages] Page ${img.pageNumber} (${pageKey}): Found Cloudflare data:`, {
                      hasId: !!cfData.cloudflareImageId,
                      hasUrl: !!cfData.cloudflareImageUrl,
                      url: cfData.cloudflareImageUrl?.substring(0, 60) + '...' || null
                    });
                  }
                  
                  // Helper to validate Cloudflare Images URL
                  const isValidCloudflareUrl = (url: string | null): boolean => {
                    if (!url || typeof url !== 'string') return false;
                    // Must be a valid Cloudflare Images URL: https://imagedelivery.net/{accountHash}/{imageId}/{variant}
                    return url.startsWith('https://imagedelivery.net/') && url.split('/').length >= 5;
                  };
                  
                  // Priority 1: Use Cloudflare Images if available and valid (fastest, WebP, CDN)
                  // IMPORTANT: Frontend should always use Cloudflare Images WebP for display (not R2 PNG)
                  let imageUrl: string;
                  if (cloudflareImageUrl && isValidCloudflareUrl(cloudflareImageUrl)) {
                    imageUrl = cloudflareImageUrl;
                    console.log(`[Pages] Page ${img.pageNumber}: ✅ Using Cloudflare Images WebP URL:`, cloudflareImageUrl.substring(0, 80) + '...');
                  }
                  // Priority 2: Use imageUrl if already constructed (from pngGeneration.pages fallback)
                  // Only use this if it's NOT a Cloudflare Images URL (shouldn't happen, but safety check)
                  else if (img.imageUrl && img.imageUrl.startsWith('/api/assets/') && !img.imageUrl.includes('imagedelivery.net')) {
                    imageUrl = img.imageUrl;
                    console.warn(`[Pages] Page ${img.pageNumber}: ⚠️ Using R2 URL (Cloudflare Images not available):`, img.imageUrl);
                  }
                  // Priority 3: Use R2 proxy URL (fallback - only if Cloudflare Images not available)
                  else if (img.r2Key) {
                    // Use relative URL so it works with any deployment (production or preview)
                    imageUrl = `/api/assets/${img.r2Key}`;
                    if (cloudflareImageUrl && !isValidCloudflareUrl(cloudflareImageUrl)) {
                      console.warn(`[Pages] Page ${img.pageNumber}: ⚠️ Invalid Cloudflare Images URL, using R2 fallback:`, cloudflareImageUrl);
                    } else if (!cloudflareImageUrl) {
                      console.warn(`[Pages] Page ${img.pageNumber}: ⚠️ No Cloudflare Images URL found, using R2 fallback:`, imageUrl);
                  } else {
                      console.warn(`[Pages] Page ${img.pageNumber}: ⚠️ Using R2 fallback (unexpected)`);
                    }
                  }
                  // Priority 4: Try to extract r2Key from imageUrl if it's an absolute URL
                  else {
                    const fallbackUrl = img.imageUrl || '';
                    const r2KeyMatch = fallbackUrl.match(/\/api\/assets\/(.+)$/);
                    if (r2KeyMatch) {
                      imageUrl = `/api/assets/${r2KeyMatch[1]}`;
                      console.log(`[Pages] Page ${img.pageNumber}: Using extracted R2 key from imageUrl`);
                    } else {
                      // Last resort: construct from page number using new format (p00.png, p01.png, etc.)
                      const pageNum = img.pageNumber ?? 0;
                      const filename = `p${String(pageNum).padStart(2, '0')}.png`;
                      imageUrl = `/api/assets/book-mvp-simple-adventure/orders/${orderId}/preview-images/${filename}`;
                      console.log(`[Pages] Page ${img.pageNumber}: Using constructed fallback URL`);
                    }
                  }
                  
                  // Log final URL type for debugging
                  const isCloudflareUrl = imageUrl.startsWith('https://imagedelivery.net/');
                  const isR2Url = imageUrl.startsWith('/api/assets/');
                  console.log(`[Pages] Page ${img.pageNumber}: Final URL type:`, {
                    type: isCloudflareUrl ? 'Cloudflare Images (WebP)' : isR2Url ? 'R2 (PNG)' : 'Unknown',
                    hasCloudflareUrl: !!cloudflareImageUrl,
                    hasR2Key: !!img.r2Key,
                    hasImageUrl: !!img.imageUrl,
                    finalUrl: imageUrl.substring(0, 80) + '...',
                    isUsingCloudflare: isCloudflareUrl
                  });
                  
                  // Ensure r2Key is always set (for download/replace operations)
                  // Extract r2Key from imageUrl if not already present
                  let r2Key = img.r2Key;
                  if (!r2Key && imageUrl) {
                    // Try to extract from /api/assets/ path (remove query params if present)
                    const urlWithoutQuery = imageUrl.split('?')[0]; // Remove query params
                    const r2KeyMatch = urlWithoutQuery.match(/\/api\/assets\/(.+)$/);
                    if (r2KeyMatch) {
                      r2Key = r2KeyMatch[1];
                    } else {
                      // Fallback: construct from page number
                      // This handles Cloudflare Images URLs or other formats
                      const pageNum = img.pageNumber ?? 0;
                      const pageKey = pageNum === 0 ? 'p00' : (pageNum < 10 ? `p0${pageNum}` : `p${pageNum}`);
                      r2Key = `book-mvp-simple-adventure/orders/${orderId}/preview-images/${pageKey}.png`;
                    }
                  }
                  
                  return {
                    pageNumber: img.pageNumber,
                    previewImageUrl: imageUrl,
                    cloudflareImageId: cloudflareImageId || undefined,
                    r2Key: r2Key || undefined
                  };
                });
              
              console.log('[Pages] ✓ Loaded preview images from 3-manifest:', pageData.length);
              console.log('[Pages] First page URL:', pageData[0]?.previewImageUrl);
              
              // Ensure page 0 (dedication) is always included
              const hasPage0 = pageData.some(p => p.pageNumber === 0);
              if (!hasPage0) {
                console.log('[Pages] Page 0 (dedication) missing from manifest, adding it');
                const page0Filename = 'p00.png';
                const page0R2Key = `book-mvp-simple-adventure/orders/${orderId}/preview-images/${page0Filename}`;
                const page0Data: PageData = {
                  pageNumber: 0,
                  previewImageUrl: `/api/assets/${page0R2Key}`
                };
                // Insert at the beginning to maintain order
                pageData = [page0Data, ...pageData];
                console.log('[Pages] Added page 0 (dedication) to pageData');
              }
            }
          }
        } catch (e) {
          console.log('[Pages] 3-manifest fetch error:', e);
        }
        
        // Fallback: Construct image URLs directly from R2 path pattern
        // This means images aren't in manifest yet (workflow 3 hasn't completed)
        if (pageData.length === 0) {
          console.warn('[Pages] ⚠️ No pagePreviewImages found in manifest, using fallback R2 path pattern');
          console.warn('[Pages] This means either: 1) Workflow 3 hasn\'t completed, or 2) Manifest structure is unexpected');
          setUsingFallbackUrls(true); // Mark that we're using fallback URLs (images not available yet)
          // Images are stored at: book-mvp-simple-adventure/orders/{orderId}/preview-images/p{pageNumber}.png
          // Format: p00.png (dedication), p01.png (page 1), p02.png (page 2), ..., p15.png (page 15)
          // NOTE: Using NEW format (p01.png), NOT old format (page-01_preview.png)
          pageData = Array.from({ length: 16 }, (_, i) => {
            const pageNum = i; // 0-15 (0 is dedication, 1-15 are story pages)
            const filename = `p${String(pageNum).padStart(2, '0')}.png`; // NEW format: p01.png
            const r2Key = `book-mvp-simple-adventure/orders/${orderId}/preview-images/${filename}`;
            return {
              pageNumber: pageNum,
              previewImageUrl: `/api/assets/${r2Key}`, // Use relative URL
              r2Key: r2Key // Include r2Key for replacement operations
            };
          });
          console.log('[Pages] Fallback: Constructed', pageData.length, 'page URLs using format p00.png, p01.png, etc.');
        } else {
          // Images found in manifest - clear fallback flag
          setUsingFallbackUrls(false);
          console.log('[Pages] ✓ Successfully loaded', pageData.length, 'pages from manifest');
        }
        
        if (!isMounted) return;
        
        // Extract cover PNG from manifest we already loaded (reuse manifest3 from pages loading above)
        // Cover PDF is now generated in W4, not available at preview time - use PNG from W3 manifest
        // W3 structure: cover is in an array with pageNumber: -1, pageType: "cover-spread"
        let coverUrlFromManifest: string | null = coverImageUrl || null; // Use existing if already loaded
        
        // Extract cover from manifest3 if we have it (from pages loading above)
        if (manifest3) {
          const pngGen = manifest3?.pngGeneration || manifest3?.manifest?.pngGeneration || {};

          // Log the full manifest structure to understand where cover-spread might be
          console.log('[Cover] Extracting cover from manifest3:', {
            hasManifest3: !!manifest3,
            hasPngGen: !!pngGen,
            // W3 ACTUAL STRUCTURE (top-level fields):
            pngGenCoverCloudflareImageUrl: !!pngGen.coverCloudflareImageUrl,
            pngGenCoverCloudflareImageId: !!pngGen.coverCloudflareImageId,
            pngGenCoverSpreadImage: !!pngGen.coverSpreadImage,
            coverSpreadImageType: typeof pngGen.coverSpreadImage,
            coverSpreadImageValue: typeof pngGen.coverSpreadImage === 'string' ? pngGen.coverSpreadImage.substring(0, 80) : pngGen.coverSpreadImage,
            // Also check top-level (in case manifest structure is different)
            topLevelCoverCloudflare: !!manifest3?.coverCloudflareImageUrl,
            topLevelCoverPngR2Key: !!manifest3?.coverPngR2Key,
            // Check manifest keys
            manifest3TopLevelKeys: manifest3 ? Object.keys(manifest3).slice(0, 20) : [],
            pngGenKeys: pngGen ? Object.keys(pngGen).slice(0, 20) : []
          });
          
          // Also check if manifest3 itself is an array (might be wrapped)
          if (Array.isArray(manifest3)) {
            console.log('[Cover] ⚠️ manifest3 is an array, checking first element for cover-spread');
            const firstElement = manifest3[0];
            if (firstElement && Array.isArray(firstElement)) {
              console.log('[Cover] First element is also an array, checking for cover-spread entries');
              const coverInArray = firstElement.find((entry: any) => 
                entry?.pageNumber === -1 && entry?.pageType === 'cover-spread'
              );
              if (coverInArray) {
                console.log('[Cover] ✅ Found cover-spread in nested array structure');
              }
            }
          }
          
          // Priority 1: W3 ACTUAL STRUCTURE - Check top-level Cloudflare Images URL
          // W3 stores cover as: pngGeneration.coverCloudflareImageUrl (top-level field)
          // This is the PRIMARY source for cover Cloudflare Images URL
          let coverSpreadEntry = null;
          let coverSpreadLocation = null;
          
          // Check W3 structure: pngGeneration.coverCloudflareImageUrl (direct field)
          // NEW MANIFEST STRUCTURE: coverCloudflareImageUrl is stored directly in pngGeneration
          if (pngGen.coverCloudflareImageUrl) {
            // W3 stores cover Cloudflare URL directly, not in an array
            // Ensure URL has variant (add /public if missing)
            let coverUrl = pngGen.coverCloudflareImageUrl;
            if (coverUrl && !coverUrl.includes('/public') && !coverUrl.includes('/backend')) {
              coverUrl = coverUrl.endsWith('/') ? coverUrl + 'public' : coverUrl + '/public';
            }
            
            coverSpreadEntry = {
              cloudflareImageUrl: coverUrl,
              cloudflareImageId: pngGen.coverCloudflareImageId || null,
              pageNumber: -1, // Implicit for cover
              pageType: 'cover-spread'
            };
            coverSpreadLocation = 'pngGeneration.coverCloudflareImageUrl';
            console.log('[Cover] ✅ Found cover Cloudflare URL in W3 structure (pngGeneration.coverCloudflareImageUrl):', coverUrl.substring(0, 100) + '...');
          }
          
          // Also check top-level manifest3.coverCloudflareImageUrl (in case structure is different)
          if (!coverSpreadEntry && manifest3.coverCloudflareImageUrl) {
            coverSpreadEntry = {
              cloudflareImageUrl: manifest3.coverCloudflareImageUrl,
              cloudflareImageId: manifest3.coverCloudflareImageId || null,
              pageNumber: -1,
              pageType: 'cover-spread'
            };
            coverSpreadLocation = 'manifest3.coverCloudflareImageUrl';
            console.log('[Cover] ✅ Found cover Cloudflare URL at top-level (manifest3.coverCloudflareImageUrl)');
          }
          
          // Priority 2: Look for cover-spread in array structures (legacy/alternative formats)
          // Check multiple possible locations for array-based entries:
          // 1. pngGeneration.coverSpread array
          // 2. pngGeneration.pages array
          // 3. Top-level coverSpread array
          // 4. Top-level pages array
          
          // Check pngGeneration.coverSpread array
          if (Array.isArray(pngGen.coverSpread)) {
            console.log('[Cover] Checking pngGeneration.coverSpread array, length:', pngGen.coverSpread.length);
            coverSpreadEntry = pngGen.coverSpread.find((entry: any) => {
              const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
              if (matches) {
                coverSpreadLocation = 'pngGeneration.coverSpread';
              }
              return matches;
            });
            if (!coverSpreadEntry && pngGen.coverSpread.length > 0) {
              console.log('[Cover] pngGeneration.coverSpread entries:', pngGen.coverSpread.map((e: any) => ({
                pageNumber: e?.pageNumber,
                pageType: e?.pageType,
                hasCloudflareUrl: !!e?.cloudflareImageUrl
              })));
            }
          }
          // Check pngGeneration.pages array
          if (!coverSpreadEntry && Array.isArray(pngGen.pages)) {
            console.log('[Cover] Checking pngGeneration.pages array, length:', pngGen.pages.length);
            coverSpreadEntry = pngGen.pages.find((entry: any) => {
              const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
              if (matches) {
                coverSpreadLocation = 'pngGeneration.pages';
              }
              return matches;
            });
          }
          // Check top-level coverSpread array
          if (!coverSpreadEntry && Array.isArray(manifest3.coverSpread)) {
            console.log('[Cover] Checking top-level coverSpread array, length:', manifest3.coverSpread.length);
            coverSpreadEntry = manifest3.coverSpread.find((entry: any) => {
              const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
              if (matches) {
                coverSpreadLocation = 'manifest3.coverSpread';
              }
              return matches;
            });
          }
          // Check top-level pages array
          if (!coverSpreadEntry && Array.isArray(manifest3.pages)) {
            console.log('[Cover] Checking top-level pages array, length:', manifest3.pages.length);
            coverSpreadEntry = manifest3.pages.find((entry: any) => {
              const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
              if (matches) {
                coverSpreadLocation = 'manifest3.pages';
              }
              return matches;
            });
          }
          
          // Check pngGeneration.storyImages array (cover might be mixed in)
          if (!coverSpreadEntry && Array.isArray(pngGen.storyImages)) {
            console.log('[Cover] Checking pngGeneration.storyImages array, length:', pngGen.storyImages.length);
            coverSpreadEntry = pngGen.storyImages.find((entry: any) => {
              const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
              if (matches) {
                coverSpreadLocation = 'pngGeneration.storyImages';
              }
              return matches;
            });
          }
          
          // Check pngGeneration.coverSpreadImages array
          if (!coverSpreadEntry && Array.isArray(pngGen.coverSpreadImages)) {
            console.log('[Cover] Checking pngGeneration.coverSpreadImages array, length:', pngGen.coverSpreadImages.length);
            coverSpreadEntry = pngGen.coverSpreadImages.find((entry: any) => {
              const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
              if (matches) {
                coverSpreadLocation = 'pngGeneration.coverSpreadImages';
              }
              return matches;
                  });
          }
          
          // Check pagesWithCloudflare object for cover-spread entry
          // pagesWithCloudflare is an object mapping keys to Cloudflare data
          // Cover might be stored with key like 'cover-spread', 'coverSpread', 'cover_spread', etc.
          if (!coverSpreadEntry && pngGen.pagesWithCloudflare && typeof pngGen.pagesWithCloudflare === 'object') {
            console.log('[Cover] Checking pagesWithCloudflare object for cover keys');
            const coverKeys = ['cover-spread', 'coverSpread', 'cover_spread', 'cover', 'p-1', 'p_cover'];
            for (const key of coverKeys) {
              const entry = pngGen.pagesWithCloudflare[key];
              if (entry && (entry.pageNumber === -1 || entry.pageType === 'cover-spread')) {
                coverSpreadEntry = entry;
                coverSpreadLocation = `pngGeneration.pagesWithCloudflare.${key}`;
                console.log('[Cover] ✅ Found cover-spread in pagesWithCloudflare with key:', key);
                break;
              }
            }
            // Also check all keys in pagesWithCloudflare for entries with pageNumber: -1
            if (!coverSpreadEntry) {
              for (const [key, entry] of Object.entries(pngGen.pagesWithCloudflare)) {
                if (entry && typeof entry === 'object' && (entry as any).pageNumber === -1) {
                  coverSpreadEntry = entry as any;
                  coverSpreadLocation = `pngGeneration.pagesWithCloudflare.${key}`;
                  console.log('[Cover] ✅ Found cover-spread in pagesWithCloudflare with key:', key);
                  break;
                }
              }
            }
          }
          
          // Check if manifest3.manifest exists and has arrays
          if (!coverSpreadEntry && manifest3?.manifest) {
            const nestedManifest = manifest3.manifest;
            if (Array.isArray(nestedManifest.coverSpread)) {
              console.log('[Cover] Checking manifest3.manifest.coverSpread array');
              coverSpreadEntry = nestedManifest.coverSpread.find((entry: any) => {
                const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
                if (matches) {
                  coverSpreadLocation = 'manifest3.manifest.coverSpread';
                }
                return matches;
              });
            }
            if (!coverSpreadEntry && Array.isArray(nestedManifest.pages)) {
              console.log('[Cover] Checking manifest3.manifest.pages array');
              coverSpreadEntry = nestedManifest.pages.find((entry: any) => {
                const matches = entry?.pageNumber === -1 && entry?.pageType === 'cover-spread';
                if (matches) {
                  coverSpreadLocation = 'manifest3.manifest.pages';
                }
                return matches;
              });
            }
          }
          
          if (coverSpreadEntry) {
            console.log('[Cover] ✅ Found cover-spread entry in', coverSpreadLocation, ':', {
              pageNumber: coverSpreadEntry.pageNumber,
              pageType: coverSpreadEntry.pageType,
              hasCloudflareImageUrl: !!coverSpreadEntry.cloudflareImageUrl,
              cloudflareImageUrl: coverSpreadEntry.cloudflareImageUrl?.substring(0, 80) + '...',
              cloudflareImageId: coverSpreadEntry.cloudflareImageId
            });
          } else {
            console.warn('[Cover] ⚠️ No cover-spread entry found (pageNumber: -1, pageType: "cover-spread") in any checked location');
          }
          
          if (coverSpreadEntry?.cloudflareImageUrl) {
            // Ensure URL has variant (add /public if missing)
            let coverUrl = coverSpreadEntry.cloudflareImageUrl;
            if (coverUrl && !coverUrl.includes('/public') && !coverUrl.includes('/backend')) {
              coverUrl = coverUrl.endsWith('/') ? coverUrl + 'public' : coverUrl + '/public';
            }
            coverUrlFromManifest = coverUrl;
            if (!coverImageUrl && coverUrlFromManifest) {
              setCoverImageUrl(coverUrlFromManifest);
            }
            if (coverUrlFromManifest) {
              console.log('[Cover] ✅ Using Cloudflare Images URL from W3 cover-spread structure:', {
                pageNumber: coverSpreadEntry.pageNumber,
                pageType: coverSpreadEntry.pageType,
                cloudflareImageId: coverSpreadEntry.cloudflareImageId,
                url: coverUrlFromManifest.substring(0, 80) + '...'
              });
            }
          } else if (coverSpreadEntry) {
            console.warn('[Cover] ⚠️ Found cover-spread entry but missing cloudflareImageUrl:', coverSpreadEntry);
          }
          // Priority 2: Cloudflare Images cover URL (from manifest or top-level) - legacy fallback
          // BUT: Only use if it's NOT the dedication page URL
          if (!coverUrlFromManifest && (manifest3?.coverCloudflareImageUrl || pngGen.coverCloudflareImageUrl)) {
            const legacyCoverUrl = manifest3.coverCloudflareImageUrl || pngGen.coverCloudflareImageUrl;
            // Check if this URL matches the dedication page URL (which would be wrong)
            const dedicationPageUrl = pageData.find(p => p.pageNumber === 0)?.previewImageUrl;
            if (legacyCoverUrl && dedicationPageUrl && legacyCoverUrl === dedicationPageUrl) {
              console.warn('[Cover] ⚠️ Legacy cover URL matches dedication page URL, skipping legacy fallback');
            } else if (legacyCoverUrl) {
              coverUrlFromManifest = legacyCoverUrl;
              if (!coverImageUrl && coverUrlFromManifest) {
                setCoverImageUrl(coverUrlFromManifest);
              }
              if (coverUrlFromManifest) {
                console.log('[Cover] ✅ Using Cloudflare Images URL from manifest (legacy):', coverUrlFromManifest.substring(0, 80) + '...');
              }
            }
          }
          // Priority 3: R2 cover PNG key (from manifest or top-level) - fallback
          // If cover-spread entry not found, use direct R2 path as fallback
          if (!coverUrlFromManifest) {
            const coverR2Key = 
              manifest3?.coverPngR2Key ||  // Top-level from Build 3A Manifest output
              (typeof pngGen.coverSpreadImage === 'string' 
                ? pngGen.coverSpreadImage 
                : pngGen.coverSpreadImage?.r2Key) ||
              `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`; // Direct R2 path fallback
            
            if (coverR2Key) {
              coverUrlFromManifest = `/api/assets/${coverR2Key}`;
              if (!coverImageUrl) {
                setCoverImageUrl(coverUrlFromManifest);
              }
              console.log('[Cover] ✅ Using R2 cover PNG (direct path fallback):', coverR2Key);
            } else {
              console.warn('[Cover] ⚠️ No cover PNG found in manifest. Expected cover-spread entry (pageNumber: -1) or coverPngR2Key');
            }
          }
        } else {
          console.warn('[Cover] ⚠️ manifest3 is null, cannot extract cover');
        }
        
        // If cover wasn't found in manifest and not already loaded, try loading it separately
        if (!coverUrlFromManifest && !coverImageUrl && !coverImageDataUrl && !coverImageLoading) {
          setCoverImageLoading(true);
          try {
            // Fetch manifest again (fallback - should rarely happen)
            const coverManifestUrl = `/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json?v=${Date.now()}`;
            const manifest3Res = await fetch(coverManifestUrl, {
              cache: 'no-store',
            });
            if (manifest3Res.ok) {
              const manifest3Raw = await manifest3Res.json();
              const manifest3ForCover = Array.isArray(manifest3Raw) ? manifest3Raw[0] : manifest3Raw;
              const pngGen = manifest3ForCover?.pngGeneration || manifest3ForCover?.manifest?.pngGeneration || {};
              
              // First, try to find cover-spread entry in fallback fetch
              let coverSpreadEntry = null;
              const locationsToCheck = [
                { name: 'pngGen.coverSpread', arr: pngGen.coverSpread },
                { name: 'pngGen.pages', arr: pngGen.pages },
                { name: 'pngGen.storyImages', arr: pngGen.storyImages },
                { name: 'pngGen.coverSpreadImages', arr: pngGen.coverSpreadImages },
                { name: 'manifest3ForCover.coverSpread', arr: manifest3ForCover.coverSpread },
                { name: 'manifest3ForCover.pages', arr: manifest3ForCover.pages },
              ];
              
              for (const location of locationsToCheck) {
                if (Array.isArray(location.arr)) {
                  coverSpreadEntry = location.arr.find((entry: any) => 
                    entry?.pageNumber === -1 && entry?.pageType === 'cover-spread'
                  );
                  if (coverSpreadEntry) {
                    console.log('[Cover] ✅ Found cover-spread in fallback fetch at', location.name);
                    break;
                  }
                }
              }
              
              if (coverSpreadEntry?.cloudflareImageUrl) {
                // Ensure URL has variant (add /public if missing)
                let coverUrl = coverSpreadEntry.cloudflareImageUrl;
                if (coverUrl && !coverUrl.includes('/public') && !coverUrl.includes('/backend')) {
                  coverUrl = coverUrl.endsWith('/') ? coverUrl + 'public' : coverUrl + '/public';
                }
                coverUrlFromManifest = coverUrl;
                if (coverUrlFromManifest) {
                  setCoverImageUrl(coverUrlFromManifest);
                  console.log('[Cover] ✅ Using cover-spread Cloudflare Images URL from fallback fetch:', coverUrlFromManifest.substring(0, 80) + '...');
                    }
              } else {
                // Check legacy locations, but skip if it matches dedication page
                const dedicationPageUrl = pageData.find(p => p.pageNumber === 0)?.previewImageUrl;
                const legacyCoverUrl = manifest3ForCover?.coverCloudflareImageUrl || pngGen.coverCloudflareImageUrl;
                
                if (legacyCoverUrl && dedicationPageUrl && legacyCoverUrl === dedicationPageUrl) {
                  console.warn('[Cover] ⚠️ Legacy cover URL matches dedication page URL in fallback, skipping');
                } else if (legacyCoverUrl) {
                  // Ensure URL has variant (add /public if missing)
                  let coverUrl = legacyCoverUrl;
                  if (coverUrl && !coverUrl.includes('/public') && !coverUrl.includes('/backend')) {
                    coverUrl = coverUrl.endsWith('/') ? coverUrl + 'public' : coverUrl + '/public';
                  }
                  coverUrlFromManifest = coverUrl;
                  if (coverUrlFromManifest) {
                    setCoverImageUrl(coverUrlFromManifest);
                    console.log('[Cover] Using Cloudflare Images URL from manifest (fallback fetch):', coverUrlFromManifest.substring(0, 80) + '...');
                  }
                } else {
                  // Try R2 path directly as final fallback
                  const coverR2Key = 
                    manifest3ForCover?.coverPngR2Key ||
                    (typeof pngGen.coverSpreadImage === 'string' ? pngGen.coverSpreadImage : pngGen.coverSpreadImage?.r2Key) ||
                    `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`; // Direct R2 path fallback
                  
                  if (coverR2Key) {
                    coverUrlFromManifest = `/api/assets/${coverR2Key}`;
                    setCoverImageUrl(coverUrlFromManifest);
                    console.log('[Cover] Using R2 cover PNG from manifest (fallback fetch):', coverR2Key);
                }
                }
              }
            }
            setCoverImageLoading(false);
          } catch (e) {
            if (!isMounted) return;
            console.log('[Pages] Cover image not available:', e);
            setCoverImageLoading(false);
          }
        } else if (coverUrlFromManifest) {
          setCoverImageLoading(false);
        }
        
        // Final fallback: If still no cover found, use direct R2 path
        // This ensures we always have a cover URL even if manifest structure is unexpected
        if (!coverUrlFromManifest) {
          const directR2Path = `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover-spread.png`;
          coverUrlFromManifest = `/api/assets/${directR2Path}`;
          if (!coverImageUrl) {
            setCoverImageUrl(coverUrlFromManifest);
          }
          console.log('[Cover] ✅ Using direct R2 path fallback (final):', directR2Path);
        }
        
        // CRITICAL: Log if we have pageData before creating spreads
        console.log('[Pages] ⚠️ BEFORE spreads creation - pageData.length:', pageData.length, 'pageData sample:', pageData[0] || 'empty');
        
        // Check if pages have actually changed to prevent unnecessary re-renders
        const currentPagesData = JSON.stringify(pageData);
        const pagesChanged = currentPagesData !== lastPagesDataRef.current;
        const isInitialLoad = lastPagesDataRef.current === '';
        
        // Determine which cover URL to use (prefer coverUrlFromManifest from this load, then state, then legacy)
        const effectiveCoverUrl = coverUrlFromManifest || coverImageDataUrl || coverImageUrl || undefined;
        
        // Check if cover URL matches dedication page URL (which would be wrong)
        const dedicationPageUrl = pageData.find(p => p.pageNumber === 0)?.previewImageUrl;
        const coverMatchesDedication = effectiveCoverUrl && dedicationPageUrl && effectiveCoverUrl === dedicationPageUrl;
        
        // Log full URLs (not truncated) to see if they're malformed
        console.log('[Pages] About to create spreads:', {
          pageDataLength: pageData.length,
          hasCoverUrl: !!effectiveCoverUrl,
          coverUrlFromManifest: coverUrlFromManifest || null,
          coverImageUrl: coverImageUrl || null,
          effectiveCoverUrl: effectiveCoverUrl || null,
          dedicationPageUrl: dedicationPageUrl || null,
          coverMatchesDedication: coverMatchesDedication,
          coverUrlLength: coverUrlFromManifest?.length || 0,
          effectiveCoverUrlLength: effectiveCoverUrl?.length || 0,
          firstPage: pageData[0] ? {
            pageNumber: pageData[0].pageNumber,
            hasPreviewUrl: !!pageData[0].previewImageUrl,
            previewImageUrl: pageData[0].previewImageUrl || null
          } : null
        });
        
        if (coverMatchesDedication) {
          console.error('[Pages] ❌ ERROR: Cover URL matches dedication page URL! This is wrong. Cover should be from cover-spread entry.');
        }
        
        // Always create spreads with current data (pages + cover)
        const newSpreads = createSpreads(pageData, effectiveCoverUrl);
        
        console.log('[Pages] createSpreads returned:', {
          spreadsCount: newSpreads.length,
          firstSpread: newSpreads[0] ? {
            spreadNumber: newSpreads[0].spreadNumber,
            hasLeft: !!newSpreads[0].leftPage,
            hasRight: !!newSpreads[0].rightPage,
            isCover: newSpreads[0].isCover,
            hasCoverData: !!newSpreads[0].coverData,
            coverDataIsFrontCover: newSpreads[0].coverData?.isFrontCover,
            coverDataFullImageUrl: newSpreads[0].coverData?.fullImageUrl?.substring(0, 60)
          } : null,
          lastSpread: newSpreads[newSpreads.length - 1] ? {
            spreadNumber: newSpreads[newSpreads.length - 1].spreadNumber,
            isBackCover: newSpreads[newSpreads.length - 1].isBackCover,
            hasCoverData: !!newSpreads[newSpreads.length - 1].coverData,
            coverDataIsBackCover: newSpreads[newSpreads.length - 1].coverData?.isBackCover
          } : null
        });
        
        // Extract flagged pages from manifest (reuse manifest3 from earlier)
        let flaggedPagesSet = new Set<string>();
        if (manifest3) {
          try {
            // Check for flagged pages in pagesMetadata
            const pagesMetadata = manifest3?.pngGeneration?.pagesMetadata 
              || manifest3?.manifest?.pngGeneration?.pagesMetadata 
              || {};
            
            // Build set of flagged page IDs (e.g., "p01", "p02")
            // Also populate manuallyFlaggedRef to restore persisted flags
            Object.keys(pagesMetadata).forEach((pageKey) => {
              const metadata = pagesMetadata[pageKey];
              if (metadata?.isFlagged || metadata?.needsReview) {
                flaggedPagesSet.add(pageKey);
                // Populate manuallyFlaggedRef to restore flags that were persisted to manifest
                // Only add if not already in manuallyUnflaggedRef (user explicitly unflagged it)
                if (!manuallyUnflaggedRef.current.has(pageKey)) {
                  manuallyFlaggedRef.current.add(pageKey);
                }
              }
            });
            
            console.log('[Pages] Found flagged pages:', Array.from(flaggedPagesSet));
          } catch (e) {
            console.log('[Pages] Could not extract flagged pages from manifest:', e);
          }
        }
        
        // Only update pages state if pages actually changed
        if (pagesChanged || isInitialLoad) {
          // Update pages first
          setPages(pageData);
          
          // Transform pages to assets for AssetGrid
          const assets = transformPagesToAssets(pageData, flaggedPagesSet);
          setPageAssets(assets);
          console.log('[Pages] Transformed', pageData.length, 'pages to', assets.length, 'assets');
          
          // Mark pages as loaded to prevent loading state during polling
          if (pageData.length > 0) {
            pagesLoadedRef.current = true;
          }
          
          // Store the current pages data to prevent re-renders
          lastPagesDataRef.current = currentPagesData;
          
          // Always start at the first spread (index 0) when pages are first loaded
          // This ensures we start with the first available page, not blank placeholders
          if (isInitialLoad) {
            // First time loading pages - always start at first spread
            setCurrentSpreadIndex(0);
          } else {
            // Refreshing pages - preserve current spread index, but clamp to valid range
            const maxIndex = newSpreads.length > 0 ? newSpreads.length - 1 : 0;
            setCurrentSpreadIndex((prevIndex) => Math.min(prevIndex, maxIndex));
          }
          
          // Only set loading to false when pages actually change
          // This prevents the loading state from being reset when cover loads separately
          setLoadingPages(false);
        } else {
          // Even if pages haven't changed, update assets if flagged state might have changed
          const assets = transformPagesToAssets(pageData, flaggedPagesSet);
          setPageAssets(assets);
        }
        
        // Always update spreads (even if pages haven't changed, cover might have)
        // This ensures spreads are always in sync with current data
        setSpreads(newSpreads);
        spreadsLengthRef.current = newSpreads.length;
        
        console.log('[Pages] Created spreads:', {
          totalSpreads: newSpreads.length,
          spreadsWithPages: newSpreads.filter(s => s.leftPage || s.rightPage).length,
          firstSpread: newSpreads[0] ? {
            hasLeft: !!newSpreads[0].leftPage,
            hasRight: !!newSpreads[0].rightPage,
            isCover: newSpreads[0].isCover,
            leftPageNumber: newSpreads[0].leftPage?.pageNumber,
            rightPageNumber: newSpreads[0].rightPage?.pageNumber,
            leftPageUrl: newSpreads[0].leftPage?.previewImageUrl?.substring(0, 60),
            rightPageUrl: newSpreads[0].rightPage?.previewImageUrl?.substring(0, 60),
          } : null
        });
        
        // If we found images in the manifest, stop polling
        if (foundInManifest && pageData.length > 0) {
          imagesFoundRef.current = true;
          if (intervalId) {
            clearInterval(intervalId);
            intervalId = null;
            console.log('[Pages] Images found in manifest, stopping auto-refresh');
          }
        }
        
        // Check if PDF exists for download
        try {
          const pdfRes = await fetch(pdfUrl, { method: 'HEAD' });
          let pdfErrorMessage: string | null = null;

          if (pdfRes.ok) {
            const jsonRes = await fetch(`${pdfUrl}?format=json`);
            if (jsonRes.ok) {
              const data = await jsonRes.json();
              setPdfAsset(prev => ({
                ...prev,
                url: data.signedUrl || pdfUrl,
                exists: true,
                loading: false,
                error: null
              }));
            } else {
              const errorBody = await jsonRes.json().catch(() => null);
              pdfErrorMessage =
                (errorBody?.error as string | undefined) || 'PDF metadata unavailable';
            }
          } else {
            const jsonRes = await fetch(`${pdfUrl}?format=json`);
            if (jsonRes.ok) {
              const data = await jsonRes.json();
              setPdfAsset(prev => ({
                ...prev,
                url: data.signedUrl || pdfUrl,
                exists: true,
                loading: false,
                error: null
              }));
            } else {
              const errorBody = await jsonRes.json().catch(() => null);
              pdfErrorMessage =
                (errorBody?.error as string | undefined) || 'PDF not yet generated';
            }
          }

          if (pdfErrorMessage) {
            setPdfAsset(prev => ({
              ...prev,
              exists: false,
              loading: false,
              error: pdfErrorMessage
            }));
          }
        } catch (e: any) {
          console.error('[Pages] Error checking PDF:', e);
          setPdfAsset(prev => ({
            ...prev,
            exists: false,
            loading: false,
            error: e?.message || 'Failed to check PDF status'
          }));
        }
      } catch (error: any) {
        if (!isMounted) return;
        console.error('[Pages] Error loading pages:', error);
        setPagesError(error?.message || 'Failed to load pages');
        setLoadingPages(false);
      }
    };

    // Store loadPages in ref so it can be called from outside useEffect
    loadPagesRef.current = loadPages;

    loadPages();

    // Start polling - will stop automatically once images are found
    // Only poll if images haven't been found yet
    if (!imagesFoundRef.current) {
      intervalId = setInterval(() => {
        // Double-check ref before polling
        if (!imagesFoundRef.current && isMounted) {
          loadPages();
        } else if (intervalId) {
          clearInterval(intervalId);
          intervalId = null;
        }
      }, 10000);
    }

    return () => {
      isMounted = false;
      if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
      }
    };
  }, [orderId, pdfUrl]); // Removed coverImageUrl and coverImageDataUrl to prevent reload loops

  // Reset image loading state when spread changes (only if spread actually changed)
  // Compare spread key to prevent unnecessary resets when spreads array is recreated
  useEffect(() => {
    let loadingTimeout: NodeJS.Timeout | null = null;
    
    const currentSpread = spreads[currentSpreadIndex];
    if (!currentSpread) {
      console.warn('[Spreads] No current spread at index:', currentSpreadIndex, 'Total spreads:', spreads.length);
      // Only reset if we actually had a spread before
      if (lastSpreadIndexRef.current !== null) {
        setImageLoading({ left: false, right: false });
        setImageError({ left: null, right: null });
      }
      lastSpreadIndexRef.current = currentSpreadIndex;
      lastSpreadKeyRef.current = '';
      return () => {
        if (loadingTimeout) clearTimeout(loadingTimeout);
      };
    }
    
    console.log('[Spreads] Current spread:', {
      index: currentSpreadIndex,
      hasLeftPage: !!currentSpread.leftPage,
      hasRightPage: !!currentSpread.rightPage,
      isCover: currentSpread.isCover,
      leftPageNumber: currentSpread.leftPage?.pageNumber,
      rightPageNumber: currentSpread.rightPage?.pageNumber,
      leftPageUrl: currentSpread.leftPage?.previewImageUrl?.substring(0, 60),
      rightPageUrl: currentSpread.rightPage?.previewImageUrl?.substring(0, 60),
    });
    
    // Create a stable unique key for this spread based on its content
    // Include cover URL in key so we detect when cover actually loads (not just when spread is created)
    const leftPageNum = currentSpread.leftPage?.pageNumber ?? null;
    const rightPageNum = currentSpread.rightPage?.pageNumber ?? null;
    const coverType = currentSpread.coverData 
      ? (currentSpread.coverData.isFrontCover ? 'front' : currentSpread.coverData.isBackCover ? 'back' : 'cover')
      : null;
    const coverUrl = currentSpread.coverData?.fullImageUrl ?? null;
    // Include cover URL in key to detect when cover loads (URL changes from undefined to actual URL)
    const spreadKey = `${currentSpreadIndex}-${leftPageNum}-${rightPageNum}-${coverType}-${coverUrl ? 'hasCover' : 'noCover'}`;
    
    // Only reset loading state if spread index changed OR spread key changed
    // This prevents resets when spreads array is recreated with same content during polling
    const indexChanged = lastSpreadIndexRef.current !== currentSpreadIndex;
    const keyChanged = lastSpreadKeyRef.current !== spreadKey;
    
    // Only reset if something actually changed
    if (indexChanged || keyChanged) {
    // Set loading to true if there's a page or cover to load
      // For cover, only set loading if cover URL actually exists (cover has loaded)
      const hasLeft = !!(currentSpread.leftPage || 
                        (currentSpread.coverData && currentSpread.coverData.isBackCover && currentSpread.coverData.fullImageUrl));
      const hasRight = !!(currentSpread.rightPage || 
                         (currentSpread.coverData && currentSpread.coverData.isFrontCover && currentSpread.coverData.fullImageUrl));
      
    setImageLoading({ 
        left: hasLeft, 
        right: hasRight
    });
    setImageError({ left: null, right: null });
      
      // Safety timeout: clear loading state after 30 seconds to prevent infinite loading
      // This handles cases where images fail to load but onError doesn't fire
      loadingTimeout = setTimeout(() => {
        setImageLoading(prev => {
          // Only clear if still loading (prev hasn't been cleared by onLoad/onError)
          if (prev.left || prev.right) {
            console.warn(`[Spreads] Loading timeout for spread ${currentSpreadIndex}, clearing loading state`);
            return { left: false, right: false };
          }
          return prev;
        });
      }, 30000);
      
      // Reset ref callback flags when spread changes
      if (indexChanged) {
        coverImageRefHandledRef.current = { front: false, back: false };
      }
      
      // Update refs to track current spread
      lastSpreadIndexRef.current = currentSpreadIndex;
      lastSpreadKeyRef.current = spreadKey;
    }
    // If spread hasn't changed (same index and same key), don't reset loading state
    // This prevents loading state from resetting when spreads are recreated during polling
    
    // Cleanup timeout on unmount or when spread changes
    return () => {
      if (loadingTimeout) clearTimeout(loadingTimeout);
    };
  }, [currentSpreadIndex, spreads]);

  // Check if cover image is already loaded when cover URL changes
  // This handles the case where the cover loads asynchronously and the image is cached
  useEffect(() => {
    const currentSpread = spreads[currentSpreadIndex];
    if (!currentSpread) return;

    // Only check if loading state is active (prevents unnecessary checks)
    const needsRightCheck = imageLoading.right && currentSpread.coverData?.isFrontCover && currentSpread.coverData.fullImageUrl;
    const needsLeftCheck = imageLoading.left && currentSpread.coverData?.isBackCover && currentSpread.coverData.fullImageUrl;

    if (!needsRightCheck && !needsLeftCheck) return;

    let frontCoverImg: HTMLImageElement | null = null;
    let backCoverImg: HTMLImageElement | null = null;
    let isMounted = true;

    // Check front cover
    if (needsRightCheck) {
      frontCoverImg = new Image();
      
      frontCoverImg.onload = () => {
        if (isMounted) {
          console.log('[Spreads] ✓ Front cover image verified as loaded');
          setImageLoading(prev => ({ ...prev, right: false }));
          setImageError(prev => ({ ...prev, right: null }));
        }
      };
      frontCoverImg.onerror = () => {
        // Image failed to load - let onError handler deal with it
        // Don't set error here, let the actual img element's onError handle it
      };
      // Set src to trigger load check (will use cache if available)
      if (currentSpread.coverData?.fullImageUrl) {
        frontCoverImg.src = currentSpread.coverData.fullImageUrl;
      }
    }

    // Check back cover
    if (needsLeftCheck) {
      backCoverImg = new Image();
      
      backCoverImg.onload = () => {
        if (isMounted) {
          console.log('[Spreads] ✓ Back cover image verified as loaded');
          setImageLoading(prev => ({ ...prev, left: false }));
          setImageError(prev => ({ ...prev, left: null }));
        }
      };
      backCoverImg.onerror = () => {
        // Image failed to load - let onError handler deal with it
        // Don't set error here, let the actual img element's onError handle it
      };
      // Set src to trigger load check (will use cache if available)
      if (currentSpread.coverData?.fullImageUrl) {
        backCoverImg.src = currentSpread.coverData.fullImageUrl;
      }
    }

    // Cleanup function
    return () => {
      isMounted = false;
      if (frontCoverImg) {
        frontCoverImg.onload = null;
        frontCoverImg.onerror = null;
      }
      if (backCoverImg) {
        backCoverImg.onload = null;
        backCoverImg.onerror = null;
      }
    };
  }, [currentSpreadIndex, spreads, imageLoading.left, imageLoading.right]);

  // Preload images for all spreads in the background
  // This ensures images are cached before user navigates to them
  useEffect(() => {
    if (spreads.length === 0) return;

    const preloadImage = (url: string) => {
      // Skip if already preloaded
      if (preloadedImagesRef.current.has(url)) {
        return;
      }

      const img = new Image();
      img.onload = () => {
        preloadedImagesRef.current.add(url);
        console.log('[Preload] ✓ Preloaded image:', url.substring(0, 80) + '...');
      };
      img.onerror = () => {
        // Silently fail - image will load when needed
        console.log('[Preload] ✗ Failed to preload:', url.substring(0, 80) + '...');
      };
      img.src = url;
    };

    // Preload all page images and cover images
    spreads.forEach((spread) => {
      // Preload left page
      if (spread.leftPage?.previewImageUrl) {
        preloadImage(spread.leftPage.previewImageUrl);
      }
      // Preload right page
      if (spread.rightPage?.previewImageUrl) {
        preloadImage(spread.rightPage.previewImageUrl);
      }
      // Preload cover image
      if (spread.coverData?.fullImageUrl) {
        preloadImage(spread.coverData.fullImageUrl);
      }
    });

    // Also preload adjacent spreads (current + next + previous) with higher priority
    const currentSpread = spreads[currentSpreadIndex];
    if (currentSpread) {
      // Preload current spread images first (already handled above, but ensure they're prioritized)
      if (currentSpread.leftPage?.previewImageUrl) {
        preloadImage(currentSpread.leftPage.previewImageUrl);
      }
      if (currentSpread.rightPage?.previewImageUrl) {
        preloadImage(currentSpread.rightPage.previewImageUrl);
      }
      if (currentSpread.coverData?.fullImageUrl) {
        preloadImage(currentSpread.coverData.fullImageUrl);
      }

      // Preload next spread
      if (currentSpreadIndex < spreads.length - 1) {
        const nextSpread = spreads[currentSpreadIndex + 1];
        if (nextSpread.leftPage?.previewImageUrl) {
          preloadImage(nextSpread.leftPage.previewImageUrl);
        }
        if (nextSpread.rightPage?.previewImageUrl) {
          preloadImage(nextSpread.rightPage.previewImageUrl);
        }
        if (nextSpread.coverData?.fullImageUrl) {
          preloadImage(nextSpread.coverData.fullImageUrl);
        }
      }

      // Preload previous spread
      if (currentSpreadIndex > 0) {
        const prevSpread = spreads[currentSpreadIndex - 1];
        if (prevSpread.leftPage?.previewImageUrl) {
          preloadImage(prevSpread.leftPage.previewImageUrl);
        }
        if (prevSpread.rightPage?.previewImageUrl) {
          preloadImage(prevSpread.rightPage.previewImageUrl);
        }
        if (prevSpread.coverData?.fullImageUrl) {
          preloadImage(prevSpread.coverData.fullImageUrl);
        }
      }
    }
  }, [spreads, currentSpreadIndex]);

  // Transform PageData to Asset format for AssetGrid
  const transformPagesToAssets = useCallback((pagesData: PageData[], flaggedPages: Set<string> = new Set()): Asset[] => {
    return pagesData.map((page) => {
      const pageNum = page.pageNumber;
      const assetId = `p${String(pageNum).padStart(2, '0')}`;
      // Check if user has manually unflagged or flagged this page - respect those decisions
      const isManuallyUnflagged = manuallyUnflaggedRef.current.has(assetId);
      const isManuallyFlagged = manuallyFlaggedRef.current.has(assetId);
      
      // Set isFlagged based on manual flags or manifest flags
      // Priority: manually flagged > manually unflagged > manifest flags
      const shouldBeFlagged = isManuallyFlagged || (!isManuallyUnflagged && flaggedPages.has(assetId));
      
      return {
        id: assetId,
        name: pageNum === 0 ? 'Page 0 (Dedication)' : `Page ${pageNum}`,
        url: page.previewImageUrl,
        isFlagged: shouldBeFlagged,
        hasTransparentBackground: false,
        isMissing: false,
        pageNumber: pageNum,
        r2Key: page.r2Key
      };
    });
  }, []);

  // Handler for downloading individual page images
  const handlePageDownload = async (assetId: string) => {
    try {
      // Extract page number from assetId (e.g., "p01" -> 1)
      const match = assetId.match(/p(\d+)/);
      if (!match) {
        console.error('[PostPdfStage] Could not determine pageNumber for:', assetId);
        alert('Invalid asset ID');
        return;
      }

      const pageNumber = parseInt(match[1], 10);
      const page = pages.find(p => p.pageNumber === pageNumber);
      
      if (!page) {
        console.error('[PostPdfStage] Page not found:', assetId);
        alert('Page not found');
        return;
      }

      // Always use R2 URL for download (not Cloudflare Images WebP)
      // Construct R2 URL from r2Key, or fallback to constructing from page number
      let imageUrl: string;
      if (page.r2Key) {
        imageUrl = `/api/assets/${page.r2Key}`;
      } else {
        // Fallback: construct R2 key from page number
        const pageKey = `p${String(pageNumber).padStart(2, '0')}`;
        const r2Key = `book-mvp-simple-adventure/orders/${orderId}/preview-images/${pageKey}.png`;
        imageUrl = `/api/assets/${r2Key}`;
      }

      console.log('[PostPdfStage] Downloading from URL:', imageUrl);

      // Fetch the image as a blob to ensure proper download
      // Use cache-busting to ensure we get the latest version
      const cacheBuster = `?t=${Date.now()}`;
      const fullUrl = imageUrl.includes('?') ? `${imageUrl}&t=${Date.now()}` : `${imageUrl}${cacheBuster}`;
      
      const response = await fetch(fullUrl, {
        method: 'GET',
        // Ensure we get the full response, not a partial one
        cache: 'no-store',
      });
      
      if (!response.ok) {
        const errorText = await response.text().catch(() => 'Unknown error');
        console.error('[PostPdfStage] Fetch failed:', response.status, errorText);
        throw new Error(`Failed to fetch image: ${response.status} ${response.statusText}`);
      }
      
      // Check content length to ensure we're getting the full file
      const contentLength = response.headers.get('content-length');
      console.log('[PostPdfStage] Response headers:', {
        contentType: response.headers.get('content-type'),
        contentLength,
        status: response.status
      });
      
      // Read the full response as array buffer first to ensure completeness
      const arrayBuffer = await response.arrayBuffer();
      console.log('[PostPdfStage] Downloaded arrayBuffer size:', arrayBuffer.byteLength, 'bytes');
      
      if (contentLength && arrayBuffer.byteLength !== parseInt(contentLength, 10)) {
        console.warn('[PostPdfStage] Content length mismatch:', {
          expected: contentLength,
          actual: arrayBuffer.byteLength
        });
      }
      
      // Create blob from the complete array buffer
      const blob = new Blob([arrayBuffer], { type: response.headers.get('content-type') || 'image/png' });
      const blobUrl = URL.createObjectURL(blob);
      
      // Trigger download by creating a temporary link
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = `${assetId}.png`;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      
      // Clean up after a short delay to ensure download starts
      setTimeout(() => {
        document.body.removeChild(link);
        URL.revokeObjectURL(blobUrl);
      }, 100);
      
      console.log('[PostPdfStage] Download initiated successfully');
    } catch (error: any) {
      console.error('[PostPdfStage] Download failed:', error);
      alert(`Failed to download page image: ${error.message || 'Unknown error'}`);
    }
  };

  // Handler for replacing individual page images
  const handlePageReplace = async (assetId: string, file: File) => {
    console.log('[PostPdfStage] handlePageReplace called with assetId:', assetId, 'file:', {
      name: file.name,
      size: file.size,
      type: file.type
    });
    
    setIsReplacing(assetId);
    
    try {
      // Extract page number from assetId (e.g., "p01" -> 1)
      const match = assetId.match(/p(\d+)/);
      if (!match) {
        console.error('[PostPdfStage] Could not determine pageNumber for:', assetId);
        alert('Invalid asset ID');
        setIsReplacing(null);
        return;
      }

      const pageNumber = parseInt(match[1], 10);
      console.log('[PostPdfStage] Extracted pageNumber:', pageNumber);

      // Create form data
      const formData = new FormData();
      formData.append('pageNumber', pageNumber.toString());
      formData.append('stage', 'postPdf');
      formData.append('file', file);
      console.log('[PostPdfStage] FormData created, file appended:', file.name);

      // Call API endpoint
      const apiUrl = `/api/orders/${orderId}/replace-image`;
      console.log('[PostPdfStage] Calling API:', apiUrl);
      
      const response = await fetch(apiUrl, {
        method: 'POST',
        body: formData,
      });

      console.log('[PostPdfStage] API response status:', response.status, response.statusText);

      if (!response.ok) {
        let errorMessage = 'Failed to replace image';
        try {
          const error = await response.json();
          errorMessage = error.error || errorMessage;
          console.error('[PostPdfStage] API error response:', error);
        } catch {
          errorMessage = `Server error: ${response.status} ${response.statusText}`;
          console.error('[PostPdfStage] Failed to parse error response');
        }
        throw new Error(errorMessage);
      }

      const result = await response.json();
      console.log('[PostPdfStage] Image replaced successfully:', result);

      // Refresh the order data to show updated image
      if (onRefresh) {
        console.log('[PostPdfStage] Calling onRefresh...');
        await onRefresh();
        console.log('[PostPdfStage] onRefresh completed');
        
        // Force reload of pages to get updated manifest with new Cloudflare Images data
        // Reset the refs to force a fresh load from manifest
        imagesFoundRef.current = false;
        pagesLoadedRef.current = false;
        lastPagesDataRef.current = '';
        
        // Reload pages from manifest (will fetch fresh manifest with updated Cloudflare Images URLs)
        // This ensures we get the new Cloudflare Images URL from the updated manifest
        console.log('[PostPdfStage] Reloading pages from manifest to get updated Cloudflare Images data...');
        
        // Call loadPages directly to reload from updated manifest
        if (loadPagesRef.current) {
          await loadPagesRef.current();
          console.log('[PostPdfStage] Pages reloaded from manifest');
        } else {
          // Fallback: if loadPages not available yet, reload page
          console.warn('[PostPdfStage] loadPages not available, reloading page');
          setTimeout(() => {
            window.location.reload();
          }, 500);
        }
      } else {
        console.warn('[PostPdfStage] No onRefresh callback provided');
        // Fallback: reload the page
        window.location.reload();
      }
    } catch (error: any) {
      console.error('[PostPdfStage] Replace failed with error:', error);
      console.error('[PostPdfStage] Error stack:', error.stack);
      alert(error.message || 'Failed to replace image');
    } finally {
      console.log('[PostPdfStage] Clearing isReplacing state');
      setIsReplacing(null);
    }
  };

  // Handler for flagging/unflagging individual pages
  const handlePageFlag = async (assetId: string) => {
    const currentPage = pageAssets.find(p => p.id === assetId);
    if (!currentPage) {
      console.error('[PostPdfStage] Page not found for flagging:', assetId);
      return;
    }
    
    const newFlaggedState = !currentPage.isFlagged;
    
    // Extract pageNumber from assetId (e.g., "p01" -> 1)
    const pageNumberMatch = assetId.match(/p(\d+)/);
    const pageNumber = pageNumberMatch ? parseInt(pageNumberMatch[1], 10) : null;
    
      // Update state immediately for responsive UI (optimistic update)
      setPageAssets(prev => {
        const updated = prev.map(page => 
          page.id === assetId ? { ...page, isFlagged: newFlaggedState } : page
        );
        // Optimistic flag count update (will be synced from API response)
        // No need to call setFlaggedCount - API response will update order.flags
        return updated;
      });
    
    // Persist flagging/unflagging to manifest via API
    if (pageNumber !== null) {
      try {
        const apiEndpoint = newFlaggedState ? `/api/orders/${orderId}/flag` : `/api/orders/${orderId}/unflag`;
        const response = await fetch(apiEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            pageNumber,
            stage: 'postPdf'
          })
        });
        
        if (!response.ok) {
          console.error(`[PostPdfStage] Failed to persist ${newFlaggedState ? 'flagging' : 'unflagging'}:`, response.statusText);
          // Revert the flag state if API call failed
          setPageAssets(prev => prev.map(page => 
            page.id === assetId ? { ...page, isFlagged: !newFlaggedState } : page
          ));
          alert(`Failed to ${newFlaggedState ? 'flag' : 'unflag'} page. Please try again.`);
        } else {
          const result = await response.json();
          // Successfully persisted
          if (newFlaggedState) {
            // User is flagging - add to manually flagged set, remove from unflagged set
            manuallyFlaggedRef.current.add(assetId);
            manuallyUnflaggedRef.current.delete(assetId);
          } else {
            // User is unflagging - add to manually unflagged set, remove from flagged set
            manuallyUnflaggedRef.current.add(assetId);
            manuallyFlaggedRef.current.delete(assetId);
          }
          
          // Update order flags and review stages from API response
          if (onOrderUpdate) {
            const updates: any = {};
            if (result.flags) {
              updates.flags = result.flags;
            }
            if (result.reviewStages) {
              updates.reviewStages = result.reviewStages;
            }
            if (Object.keys(updates).length > 0) {
              onOrderUpdate(updates);
            }
          }
          
          console.log(`[PostPdfStage] Successfully ${newFlaggedState ? 'flagged' : 'unflagged'} page:`, assetId);
        }
      } catch (error) {
        console.error(`[PostPdfStage] Error persisting ${newFlaggedState ? 'flagging' : 'unflagging'}:`, error);
        // Revert the flag state if API call failed
        setPageAssets(prev => prev.map(page => 
          page.id === assetId ? { ...page, isFlagged: !newFlaggedState } : page
        ));
        alert(`Failed to ${newFlaggedState ? 'flag' : 'unflag'} page. Please try again.`);
      }
    }
  };

  // Reset manually unflagged/flagged sets when order changes
  useEffect(() => {
    manuallyUnflaggedRef.current.clear();
    manuallyFlaggedRef.current.clear();
  }, [orderId]);

  const handleDownload = () => {
    if (pdfAsset.exists && pdfAsset.url) {
      const link = document.createElement('a');
      link.href = pdfAsset.url;
      link.download = `complete_book_${orderId}.pdf`;
      link.target = '_blank';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const handleFlag = async () => {
    const newFlaggedState = !pdfAsset.isFlagged;
    setPdfAsset(prev => ({ ...prev, isFlagged: newFlaggedState }));
    
    // Update flag count immediately
    await setFlaggedCount(orderId, 'postPdf', newFlaggedState ? 1 : 0);
    
    // Note: PDF asset flagging doesn't need manifest persistence since it's a single asset
    // The flag count in Supabase is sufficient for tracking
  };

  const isPreBriaApproved = order.reviewStages?.preBria?.status === 'approved';
  const isPostBriaApproved = order.reviewStages?.postBria?.status === 'approved';
  const allowApproveWithoutPdf =
    process.env.NODE_ENV !== 'production' ||
    process.env.NEXT_PUBLIC_ALLOW_APPROVAL_WITHOUT_PDF === 'true';
  const pdfUnavailableForEnv =
    Boolean(pdfAsset.error) &&
    pdfAsset.error !== null &&
    /environment|credential|not available in this environment/i.test(pdfAsset.error);
  // Check for flagged pages
  const flaggedPageCount = pageAssets.filter(asset => asset.isFlagged).length;
  
  // Can approve stage (for "Approve Stage" button)
  // Note: Only requires PostBria approval (not PreBria) because if workflow 3 completed,
  // it means the order already passed through PreBria and PostBria stages
  const canApproveStage =
    !pdfAsset.isFlagged &&
    flaggedPageCount === 0 && // Cannot approve if any pages are flagged
    isPostBriaApproved && // Only require PostBria approval (workflow 3 completion implies PreBria passed)
    (pdfAsset.exists || allowApproveWithoutPdf || pdfUnavailableForEnv);
  
  // Debug logging to help diagnose why button is disabled
  useEffect(() => {
    if (!canApproveStage) {
      console.log('[PostPdfStage] Approve Stage button disabled. Reasons:', {
        pdfAssetIsFlagged: pdfAsset.isFlagged,
        flaggedPageCount,
        isPostBriaApproved,
        pdfAssetExists: pdfAsset.exists,
        pdfAssetLoading: pdfAsset.loading,
        pdfAssetError: pdfAsset.error,
        allowApproveWithoutPdf,
        pdfUnavailableForEnv,
        canApproveStage
      });
    }
  }, [canApproveStage, pdfAsset.isFlagged, flaggedPageCount, isPostBriaApproved, pdfAsset.exists, pdfAsset.loading, pdfAsset.error, allowApproveWithoutPdf, pdfUnavailableForEnv]);
  
  // Can send for customer approval (requires stage to be approved first)
  const canApprove =
    approveStageConfirmed &&
    canApproveStage;
  
  const requiresPdfWarning =
    !pdfAsset.exists && !allowApproveWithoutPdf && !pdfUnavailableForEnv;
  const devPdfNotice =
    !pdfAsset.exists && (allowApproveWithoutPdf || pdfUnavailableForEnv);
  
  // Handle approve stage
  const handleApproveStage = async () => {
    const targetStatus = approveStageConfirmed ? 'pending' : 'approved';
    try {
      await onApprove(targetStatus);
      setApproveStageConfirmed(targetStatus === 'approved');
      // Optional refresh to reflect server state
      if (onRefresh) {
        setTimeout(() => {
          onRefresh();
        }, 250);
      }
    } catch (e) {
      console.error('Approve PostPdf failed', e);
      alert('Failed to approve stage');
    }
  };
  
  // Un-confirm approval when flags are set
  useEffect(() => {
    if (pdfAsset.isFlagged || flaggedPageCount > 0) {
      setApproveStageConfirmed(false);
    }
  }, [pdfAsset.isFlagged, flaggedPageCount]);

  const currentSpread = spreads[currentSpreadIndex];
  const totalSpreads = spreads.length;
  const currentSpreadNumber = currentSpreadIndex + 1;

  const handlePreviousSpread = () => {
    if (currentSpreadIndex > 0) {
      setCurrentSpreadIndex(currentSpreadIndex - 1);
    }
  };

  const handleNextSpread = () => {
    if (currentSpreadIndex < totalSpreads - 1) {
      setCurrentSpreadIndex(currentSpreadIndex + 1);
    }
  };

  const handleSendToPrintClick = async () => {
    if (sendingToPrint) {
      return;
    }

    try {
      setSendingToPrint(true);
      if (onSendToPrint) {
        await onSendToPrint();
      }
      alert('Book Successfully Sent to Print Service');
    } catch (error: any) {
      console.error('[PostPdfStage] Failed to send to print:', error);
      alert(error?.message || 'Failed to send to print. Please try again.');
    } finally {
      setSendingToPrint(false);
    }
  };

  // Keyboard navigation - use ref to avoid stale closures
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
        setCurrentSpreadIndex(prevIndex => {
          const maxIndex = spreadsLengthRef.current > 0 ? spreadsLengthRef.current - 1 : 0;
          
          // Update index based on key and bounds
          if (e.key === 'ArrowLeft' && prevIndex > 0) {
            return prevIndex - 1;
          } else if (e.key === 'ArrowRight' && prevIndex < maxIndex) {
            return prevIndex + 1;
          }
          return prevIndex;
        });
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []); // Empty deps - use ref instead of state

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: `
        .spread-container {
          display: flex;
          justify-content: center;
          align-items: flex-start;
          width: 100%;
        }

        .two-page-spread {
          display: flex;
          gap: 0; /* No gap between pages in print */
          width: 100%;
          max-width: 100%;
          height: auto;
        }

        .two-page-spread img {
          width: 50%;
          height: auto;
          object-fit: contain;
          display: block;
          aspect-ratio: 1 / 1;
        }

        .white-page {
          width: 50%;
          aspect-ratio: 1 / 1;
          background-color: white;
          /* Simulated white page - no image needed */
        }

        .cover-image-container {
          width: 50%;
          aspect-ratio: 1 / 1;
          overflow: hidden;
          position: relative;
          background-color: white;
        }

        .cover-image-container img {
          width: 200%;
          height: 100%;
          object-fit: cover;
          object-position: center;
          display: block;
        }

        .cover-image-container.front-cover img {
          object-position: right center;
        }

        .cover-image-container.back-cover img {
          object-position: left center;
        }
      `}} />
    <div className="space-y-8">
      <div className="space-y-6">
        {/* Show message if workflow 3 hasn't completed yet - replaces both page preview and book preview */}
        {!workflow3Completed && (
          <div className="bg-gray-50 rounded-lg p-8 text-center">
            <div className="mx-auto w-12 h-12 bg-gray-200 rounded-full flex items-center justify-center mb-4">
              <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
              </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900 mb-2">No Images Found</h3>
            <p className="text-gray-600 mb-4">
              Book preview images have not been generated yet. This typically happens when:
            </p>
            <ul className="text-sm text-gray-500 text-left max-w-md mx-auto space-y-1">
              <li>• Workflow 3 (Book Assembly) hasn't been completed yet</li>
              <li>• The book assembly process is still running</li>
              <li>• There was an error during the book assembly process</li>
            </ul>
            <div className="mt-6">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Page
              </button>
            </div>
          </div>
        )}

        {/* Page Preview Images Grid - Only show when workflow 3 has completed */}
        {workflow3Completed && pageAssets.length > 0 && (
          <AssetGrid
            title="Page Preview Images"
            description="Individual page previews - review, download, replace, or flag pages as needed"
            assets={pageAssets}
            onDownload={handlePageDownload}
            onReplace={handlePageReplace}
            onFlag={handlePageFlag}
            onApprove={() => {}}
            canApprove={false}
            isApproved={false}
            isReplacing={isReplacing}
          />
        )}

        {/* Final Compiled PDF Section - Only show when workflow 3 has completed */}
        {workflow3Completed && (
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-medium text-gray-900">Final Compiled PDF</h3>
              <p className="text-sm text-gray-600 mt-1">
                Review the complete personalized book before sending for customer approval
              </p>
              {pdfAsset.isFlagged && (
                <div className="mt-2 inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                  <Flag className="h-3 w-3 mr-1" />
                  Needs Attention
                </div>
              )}
            </div>
            
            <div className="flex space-x-3">
              {pdfAsset.exists && (
              <button
                onClick={handleDownload}
                className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              >
                <Download className="h-4 w-4 mr-2" />
                Download PDF
              </button>
              )}
              <button
                onClick={handleFlag}
                className={`inline-flex items-center px-4 py-2 border rounded-md shadow-sm text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  pdfAsset.isFlagged
                    ? 'border-red-300 text-red-700 bg-red-50 hover:bg-red-100 focus:ring-red-500'
                    : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50 focus:ring-blue-500'
                }`}
              >
                <Flag className="h-4 w-4 mr-2" />
                {pdfAsset.isFlagged ? 'Unflag' : 'Flag for Review'}
              </button>
            </div>
          </div>
        )}

        {/* PDF Viewer - Page Preview - Only show when workflow 3 has completed */}

        {/* Show loading state only if workflow 3 has completed */}
        {workflow3Completed && loadingPages && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Loading book pages...</p>
              </div>
            </div>
          </div>
        )}

        {/* Show error state only if workflow 3 has completed */}
        {workflow3Completed && pagesError && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-600 text-sm font-medium">{pagesError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Show "Preview Images Pending" only if workflow 3 is completed but no spreads exist yet */}
        {workflow3Completed && !loadingPages && !pagesError && pages.length === 0 && spreads.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">Preview Images Pending</h4>
                <p className="text-gray-600 text-sm mb-4">
                  Book preview images are being loaded. They will appear here automatically.
                </p>
                <p className="text-gray-500 text-xs">
                  This page will refresh automatically every 10 seconds.
                </p>
              </div>
            </div>
          </div>
        )}

        {workflow3Completed && !pagesError && spreads.length > 0 && currentSpread && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden shadow-sm">
            {/* Viewer Header */}
            <div className="bg-gray-50 px-6 py-3 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-700">
                  Spread {currentSpreadNumber} of {totalSpreads}
                  {currentSpread.coverData && currentSpread.coverData.isFrontCover && (
                    <span className="text-gray-500 ml-2">(Front Cover)</span>
                  )}
                  {currentSpread.coverData && currentSpread.coverData.isBackCover && (
                    <span className="text-gray-500 ml-2">(Back Cover)</span>
                  )}
                  {!currentSpread.coverData && currentSpread.leftPage && currentSpread.rightPage && (
                    <span className="text-gray-500 ml-2">
                      (Pages {currentSpread.leftPage.pageNumber} & {currentSpread.rightPage.pageNumber})
                    </span>
                  )}
                  {!currentSpread.coverData && currentSpread.leftPage && !currentSpread.rightPage && (
                    <span className="text-gray-500 ml-2">
                      (Page {currentSpread.leftPage.pageNumber})
                    </span>
                  )}
                  {!currentSpread.coverData && !currentSpread.leftPage && currentSpread.rightPage && (
                    <span className="text-gray-500 ml-2">
                      (Page {currentSpread.rightPage.pageNumber})
                    </span>
                  )}
                </span>
                <div className="flex items-center gap-3">
                  <button
                    onClick={handlePreviousSpread}
                    disabled={currentSpreadIndex === 0}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Previous spread"
                  >
                    <ChevronLeft className="h-5 w-5 text-gray-600" />
                  </button>
                  <button
                    onClick={handleNextSpread}
                    disabled={currentSpreadIndex >= totalSpreads - 1}
                    className="p-2 rounded-md hover:bg-gray-200 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
                    aria-label="Next spread"
                  >
                    <ChevronRight className="h-5 w-5 text-gray-600" />
                  </button>
                </div>
              </div>
            </div>

            {/* Spread Display Area */}
            <div className="bg-gray-100 flex items-center justify-center p-8 relative">
              {((currentSpread.leftPage || (currentSpread.coverData && currentSpread.coverData.isBackCover)) && imageLoading.left) || 
                ((currentSpread.rightPage || (currentSpread.coverData && currentSpread.coverData.isFrontCover)) && imageLoading.right) ? (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                      <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                    </div>
                  ) : null}
                  
              {/* Only show error if not using fallback URLs (images from manifest that actually failed) */}
              {(imageError.left || imageError.right) && !usingFallbackUrls && (
                <div className="absolute inset-0 flex items-center justify-center bg-gray-100 z-10">
                      <div className="text-center">
                        <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                    <p className="text-red-600 text-sm">
                      {imageError.left || imageError.right}
                    </p>
                      </div>
                    </div>
                  )}

              <div className="spread-container w-full max-w-full">
                <div className="two-page-spread">
                  {/* Left page - can be regular page or back cover */}
                  {currentSpread.coverData && currentSpread.coverData.isBackCover ? (
                    // Back cover: show left half of cover image
                    currentSpread.coverData.fullImageUrl ? (
                    <div className="cover-image-container back-cover">
                      <img
                          key={`back-cover-${orderId}-${currentSpreadIndex}-${currentSpread.coverData.fullImageUrl.startsWith('data:') ? 'data' : 'url'}-${currentSpread.coverData.fullImageUrl.length}`}
                        src={currentSpread.coverData.fullImageUrl}
                        alt="Back Cover"
                          ref={(img) => {
                            // Check if image is already loaded (cached) when element is created
                            // Use a more stable check to prevent infinite loops
                            if (img && img.complete && img.naturalHeight !== 0 && img.naturalWidth !== 0) {
                              // Only log and update if we haven't already handled this specific image URL
                              const currentCoverUrl = currentSpread.coverData?.fullImageUrl;
                              const lastHandledUrl = coverImageRefHandledRef.current.lastBackCoverUrl;
                              if (currentCoverUrl && currentCoverUrl !== lastHandledUrl) {
                                coverImageRefHandledRef.current.back = true;
                                coverImageRefHandledRef.current.lastBackCoverUrl = currentCoverUrl;
                                console.log('[Spreads] ✓ Back cover image already loaded (cached):', currentCoverUrl.substring(0, 80) + '...');
                                // Defer state update to avoid updating during render
                                setTimeout(() => {
                                  setImageLoading(prev => ({ ...prev, left: false }));
                                  setImageError(prev => ({ ...prev, left: null }));
                                }, 0);
                              }
                            } else if (!img) {
                              // Reset flag when image is unmounted, but keep the URL to prevent re-triggering
                              // Only reset if we're actually changing spreads
                            }
                          }}
                        onLoad={() => {
                          console.log('[Spreads] ✓ Back cover image loaded successfully');
                          setImageLoading(prev => ({ ...prev, left: false }));
                          setImageError(prev => ({ ...prev, left: null }));
                        }}
                        onError={(e) => {
                          console.error('[Spreads] ✗ Back cover image failed to load:', e);
                          setImageLoading(prev => ({ ...prev, left: false }));
                          setImageError(prev => ({ ...prev, left: 'Failed to load back cover' }));
                        }}
                        className={`transition-opacity duration-200 ${
                          imageLoading.left ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{
                          display: imageError.left ? 'none' : 'block'
                        }}
                      />
                    </div>
                    ) : (
                      // Cover URL not available yet - show loading
                      <div className="white-page flex items-center justify-center">
                        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                      </div>
                    )
                  ) : currentSpread.leftPage ? (
                    <img
                      key={`left-page-${orderId}-${currentSpread.leftPage.pageNumber}-${currentSpreadIndex}`}
                      src={currentSpread.leftPage.previewImageUrl}
                      alt={`Page ${currentSpread.leftPage.pageNumber}`}
                      onLoad={() => {
                        console.log(`[Spreads] ✓ Left image loaded successfully for page ${currentSpread.leftPage!.pageNumber}`);
                        setImageLoading(prev => ({ ...prev, left: false }));
                        setImageError(prev => ({ ...prev, left: null }));
                      }}
                      onError={async (e) => {
                        const img = e.currentTarget;
                        const url = currentSpread.leftPage!.previewImageUrl;
                        
                        // If using fallback URLs, images aren't available yet - don't show error
                        if (usingFallbackUrls) {
                          console.log(`[Spreads] Image not available yet for page ${currentSpread.leftPage!.pageNumber} (using fallback URLs)`);
                          setImageLoading(prev => ({ ...prev, left: false }));
                          // Don't set error - images just aren't available yet
                          return;
                        }
                        
                        // If Cloudflare Images URL failed, try to fall back to R2
                        const pageData = currentSpread.leftPage;
                        if (url.startsWith('https://imagedelivery.net/') && pageData?.r2Key) {
                          console.warn(`[Spreads] Cloudflare Images URL failed for page ${currentSpread.leftPage!.pageNumber}, falling back to R2:`, url);
                          // Update the page data to use R2 URL instead
                          const r2Url = `/api/assets/${pageData.r2Key}`;
                          img.src = r2Url;
                          // Don't set error yet - let R2 URL try to load
                          return;
                        }
                        
                        // Only show error if we have images from manifest and they fail
                        try {
                          const response = await fetch(url, { method: 'HEAD' });
                          console.error(`[Spreads] ✗ Left image failed to load for page ${currentSpread.leftPage!.pageNumber}:`, {
                            url,
                            httpStatus: response.status,
                            httpStatusText: response.statusText,
                            error: e
                          });
                        } catch (fetchError) {
                          console.error(`[Spreads] ✗ Left image fetch error for page ${currentSpread.leftPage!.pageNumber}:`, {
                            url,
                            fetchError,
                            error: e
                          });
                        }
                        
                        setImageLoading(prev => ({ ...prev, left: false }));
                        setImageError(prev => ({ ...prev, left: `Failed to load page ${currentSpread.leftPage!.pageNumber}` }));
                      }}
                      className={`transition-opacity duration-200 ${
                        imageLoading.left ? 'opacity-0' : 'opacity-100'
                      }`}
                      style={{
                        display: imageError.left ? 'none' : 'block'
                      }}
                    />
                  ) : (
                    <div className="white-page" />
                  )}
                  
                  {/* Right page - can be regular page or front cover */}
                  {currentSpread.coverData && currentSpread.coverData.isFrontCover ? (
                    // Front cover: show right half of cover image
                    currentSpread.coverData.fullImageUrl ? (
                    <div className="cover-image-container front-cover">
                      <img
                          key={`front-cover-${orderId}-${currentSpreadIndex}-${currentSpread.coverData.fullImageUrl.startsWith('data:') ? 'data' : 'url'}-${currentSpread.coverData.fullImageUrl.length}`}
                        src={currentSpread.coverData.fullImageUrl}
                        alt="Front Cover"
                          ref={(img) => {
                            // Check if image is already loaded (cached) when element is created
                            // Use a more stable check to prevent infinite loops
                            if (img && img.complete && img.naturalHeight !== 0 && img.naturalWidth !== 0) {
                              // Only log and update if we haven't already handled this specific image URL
                              const currentCoverUrl = currentSpread.coverData?.fullImageUrl;
                              const lastHandledUrl = coverImageRefHandledRef.current.lastFrontCoverUrl;
                              if (currentCoverUrl && currentCoverUrl !== lastHandledUrl) {
                                coverImageRefHandledRef.current.front = true;
                                coverImageRefHandledRef.current.lastFrontCoverUrl = currentCoverUrl;
                                console.log('[Spreads] ✓ Front cover image already loaded (cached):', currentCoverUrl.substring(0, 80) + '...');
                                // Defer state update to avoid updating during render
                                setTimeout(() => {
                                  setImageLoading(prev => ({ ...prev, right: false }));
                                  setImageError(prev => ({ ...prev, right: null }));
                                }, 0);
                              }
                            } else if (!img) {
                              // Reset flag when image is unmounted, but keep the URL to prevent re-triggering
                              // Only reset if we're actually changing spreads
                            }
                          }}
                        onLoad={() => {
                          console.log('[Spreads] ✓ Front cover image loaded successfully');
                          setImageLoading(prev => ({ ...prev, right: false }));
                          setImageError(prev => ({ ...prev, right: null }));
                        }}
                        onError={(e) => {
                            console.error('[Spreads] ✗ Front cover image failed to load:', e, {
                              url: currentSpread.coverData?.fullImageUrl,
                              isDataUrl: currentSpread.coverData?.fullImageUrl?.startsWith('data:')
                            });
                          setImageLoading(prev => ({ ...prev, right: false }));
                          setImageError(prev => ({ ...prev, right: 'Failed to load front cover' }));
                        }}
                        className={`transition-opacity duration-200 ${
                          imageLoading.right ? 'opacity-0' : 'opacity-100'
                        }`}
                        style={{
                          display: imageError.right ? 'none' : 'block'
                        }}
                      />
                    </div>
                    ) : (
                      // Cover URL not available yet - show loading
                      <div className="white-page flex items-center justify-center">
                        <Loader2 className="h-8 w-8 text-gray-400 animate-spin" />
                      </div>
                    )
                  ) : currentSpread.rightPage ? (
                    <img
                      key={`right-page-${orderId}-${currentSpread.rightPage.pageNumber}-${currentSpreadIndex}`}
                      src={currentSpread.rightPage.previewImageUrl}
                      alt={`Page ${currentSpread.rightPage.pageNumber}`}
                    onLoad={() => {
                        console.log(`[Spreads] ✓ Right image loaded successfully for page ${currentSpread.rightPage!.pageNumber}`);
                        setImageLoading(prev => ({ ...prev, right: false }));
                        setImageError(prev => ({ ...prev, right: null }));
                    }}
                    onError={async (e) => {
                      const img = e.currentTarget;
                        const url = currentSpread.rightPage!.previewImageUrl;
                      
                        // If using fallback URLs, images aren't available yet - don't show error
                        if (usingFallbackUrls) {
                          console.log(`[Spreads] Image not available yet for page ${currentSpread.rightPage!.pageNumber} (using fallback URLs)`);
                          setImageLoading(prev => ({ ...prev, right: false }));
                          // Don't set error - images just aren't available yet
                          return;
                        }
                        
                        // If Cloudflare Images URL failed, try to fall back to R2
                        const pageData = currentSpread.rightPage;
                        if (url.startsWith('https://imagedelivery.net/') && pageData?.r2Key) {
                          console.warn(`[Spreads] Cloudflare Images URL failed for page ${currentSpread.rightPage!.pageNumber}, falling back to R2:`, url);
                          // Update the page data to use R2 URL instead
                          const r2Url = `/api/assets/${pageData.r2Key}`;
                          img.src = r2Url;
                          // Don't set error yet - let R2 URL try to load
                          return;
                        }
                        
                        // Only show error if we have images from manifest and they fail
                      try {
                        const response = await fetch(url, { method: 'HEAD' });
                          console.error(`[Spreads] ✗ Right image failed to load for page ${currentSpread.rightPage!.pageNumber}:`, {
                          url,
                          httpStatus: response.status,
                          httpStatusText: response.statusText,
                          error: e
                        });
                      } catch (fetchError) {
                          console.error(`[Spreads] ✗ Right image fetch error for page ${currentSpread.rightPage!.pageNumber}:`, {
                          url,
                          fetchError,
                          error: e
                        });
                      }
                      
                        setImageLoading(prev => ({ ...prev, right: false }));
                        setImageError(prev => ({ ...prev, right: `Failed to load page ${currentSpread.rightPage!.pageNumber}` }));
                    }}
                      className={`transition-opacity duration-200 ${
                        imageLoading.right ? 'opacity-0' : 'opacity-100'
                    }`}
                    style={{
                        display: imageError.right ? 'none' : 'block'
                    }}
                  />
                  ) : (
                    <div className="white-page" />
              )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* PDF Info */}
        <div className="bg-gray-50 rounded-lg p-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div>
              <span className="text-gray-500">File Size:</span>
              <span className="ml-1 text-gray-900">219 MB</span>
            </div>
            <div>
              <span className="text-gray-500">Pages:</span>
              <span className="ml-1 text-gray-900">{pages.length || 14}</span>
            </div>
            <div>
              <span className="text-gray-500">Format:</span>
              <span className="ml-1 text-gray-900">8.5" × 8.5" Softcover</span>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <span className="ml-1 text-gray-900">
                {pdfAsset.isFlagged ? 'Needs Review' : 'Ready'}
              </span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-blue-50 rounded-lg p-6">
        <h4 className="text-sm font-medium text-blue-900 mb-3">Final Review Checklist</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm text-blue-700">
          <div>
            <h5 className="font-medium mb-2">Content Review</h5>
            <ul className="space-y-1">
              <li>• All pages are present and in correct order</li>
              <li>• Character appears consistently across all pages</li>
              <li>• Text is properly formatted and readable</li>
              <li>• Child's name appears correctly throughout</li>
            </ul>
          </div>
          <div>
            <h5 className="font-medium mb-2">Technical Review</h5>
            <ul className="space-y-1">
              <li>• Images are high quality and properly positioned</li>
              <li>• No layout issues or text overflow</li>
              <li>• Print margins are correct for 8.5" × 8.5" format</li>
              <li>• PDF is optimized for print production</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-medium text-gray-900">Send for Customer Approval</h4>
            <p className="text-sm text-gray-600 mt-1">
              {isApproved 
                ? 'This order has been fully approved and is ready for production.'
                : requiresPdfWarning
                ? 'The compiled PDF must be generated before sending for customer approval.'
                : !isPostBriaApproved
                ? 'The Post-Bria stage must be approved before final PDF review can begin.'
                : pdfAsset.isFlagged
                ? 'Please address the flagged issues before sending for customer approval.'
                : !approveStageConfirmed
                ? 'First approve this stage, then send for customer approval.'
                : 'Review the compiled PDF and approve when ready for production.'}
            </p>
            {devPdfNotice && (
              <p className="text-xs text-gray-500 mt-2">
                PDF not detected ({pdfAsset.error || 'unavailable'}); approval is enabled for testing. Ensure a compiled PDF exists and R2 credentials are configured before sending to real customers.                 
              </p>
            )}
          </div>
          
          <div className="flex space-x-3">
            {isApproved ? (
              showPrintAction ? (
                <button
                  onClick={handleSendToPrintClick}
                  disabled={sendingToPrint}
                  className={`inline-flex items-center px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    sendingToPrint
                      ? 'bg-indigo-500/70 text-white cursor-wait focus:ring-indigo-500'
                      : 'bg-indigo-600 text-white hover:bg-indigo-700 focus:ring-indigo-500'
                  }`}
                >
                  {sendingToPrint ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <Printer className="h-4 w-4 mr-2" />
                  )}
                  {sendingToPrint ? 'Sending...' : 'Send to Print'}
                </button>
              ) : (
              <button
                onClick={onInitiateWorkflow}
                  disabled={finalApprovalIsLoading || previewJustSent}
                  className={`inline-flex items-center px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    finalApprovalIsLoading
                      ? 'bg-green-500/70 text-white cursor-wait focus:ring-green-500'
                      : previewJustSent
                      ? 'bg-gray-300 text-gray-600 cursor-not-allowed focus:ring-gray-400'
                      : 'bg-green-600 text-white hover:bg-green-700 focus:ring-green-500'
                }`}
              >
                  {finalApprovalIsLoading ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : previewJustSent ? (
                    <CheckCircle className="h-4 w-4 mr-2" />
                ) : (
                  <Play className="h-4 w-4 mr-2" />
                )}
                  {previewJustSent
                    ? 'Preview Sent'
                    : finalApprovalIsLoading
                    ? 'Sending Proof...'
                    : hasExistingPreview
                    ? 'Resend Proof'
                    : 'Send Proof'}
              </button>
              )
            ) : (
              <>
                {/* Step 1: Approve Stage */}
                <button
                  onClick={handleApproveStage}
                  disabled={approveStageConfirmed ? false : !canApproveStage}
                  className={`inline-flex items-center px-4 py-2 rounded-md text-sm font-medium focus:outline-none focus:ring-2 focus:ring-offset-2 transition-all ${
                    approveStageConfirmed
                      ? 'bg-emerald-50 text-emerald-700 border border-emerald-200 hover:bg-emerald-100 focus:ring-emerald-500'
                      : canApproveStage
                      ? 'bg-slate-100 text-slate-700 border border-slate-300 hover:bg-slate-200 hover:border-slate-400 focus:ring-slate-500'
                      : 'bg-gray-50 text-gray-400 border border-gray-200 cursor-not-allowed'
                  }`}
                >
                  {approveStageConfirmed ? (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Stage
                    </>
                  ) : (
                    <>
                      <CheckCircle className="h-4 w-4 mr-2" />
                      Approve Stage
                    </>
                  )}
                </button>
                
                {/* Step 2: Send for Customer Approval */}
                <button
                  onClick={() => onApprove('approved')}
                  disabled={!canApprove}
                  className={`inline-flex items-center px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                    !canApprove
                      ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                      : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                  }`}
                >
                  <CheckCircle className="h-4 w-4 mr-2" />
                  Send for Customer Approval
                </button>
              </>
            )}
          </div>
        </div>
      </div>

      {(finalApprovalError || finalApprovalResult || order.customerApprovalStatus || hasExistingPreview) && (
        <div className="mt-4 space-y-4">
          {finalApprovalError && (
            <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-700 flex items-start space-x-3">
              <AlertCircle className="h-5 w-5 mt-0.5" />
              <div>
                <p className="font-medium">Failed to send customer preview</p>
                <p>{finalApprovalError}</p>
              </div>
            </div>
          )}

          <div className="rounded-lg border border-gray-200 bg-white p-4">
            <h5 className="text-sm font-semibold text-gray-900 mb-2">Customer Preview Status</h5>
            <div className="space-y-2 text-sm text-gray-700">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium">Status:</span>
                <span
                  className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                    order.customerApprovalStatus === 'approved'
                      ? 'bg-green-100 text-green-800'
                      : order.customerApprovalStatus === 'revision_requested'
                      ? 'bg-orange-100 text-orange-800'
                      : order.customerApprovalStatus === 'pending'
                      ? 'bg-purple-100 text-purple-800'
                      : 'bg-gray-100 text-gray-700'
                  }`}
                >
                  {order.customerApprovalStatus ? order.customerApprovalStatus.replace(/_/g, ' ') : 'not requested'}
                </span>
              </div>

              {previewRequestedAt && (
                <p>
                  <span className="font-medium">Requested:</span>{' '}
                  {formatDate(previewRequestedAt)}
                </p>
              )}
              {order.customerApprovalApprovedAt && (
                <p>
                  <span className="font-medium">Approved:</span>{' '}
                  {formatDate(order.customerApprovalApprovedAt)}
                </p>
              )}
              {typeof order.revisionCount === 'number' && (
                <p>
                  <span className="font-medium">Revisions Used:</span>{' '}
                  {order.revisionCount} / 1
                </p>
              )}
            </div>

            {(previewJustSent || hasExistingPreview || finalApprovalIsLoading) && (
              <div className="mt-4 space-y-3 rounded-md bg-gray-50 p-3 text-sm text-gray-800 border border-gray-200">
                <div className="flex items-center justify-between gap-3">
                  <div className="space-y-1">
                    <p className="font-medium text-gray-900">Preview Link</p>
                    <p className="text-xs text-gray-600">
                      {previewJustSent || hasExistingPreview
                        ? 'Preview generated and awaiting customer response.'
                        : 'Share this URL with the customer if Amazon messaging is unavailable.'}
                    </p>
                  </div>
                  {previewUrl && (
                    <button
                      onClick={() => {
                        if (!previewUrl) return;
                        navigator.clipboard.writeText(previewUrl);
                        setCopied(true);
                        setTimeout(() => setCopied(false), 2500);
                      }}
                      className="inline-flex items-center rounded-md border border-gray-300 bg-white px-2 py-1 text-xs font-medium text-gray-700 shadow-sm hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
                    >
                      <Clipboard className="h-3.5 w-3.5 mr-1" />
                      {copied ? 'Copied!' : 'Copy'}
                    </button>
                  )}
                </div>

                <div className="rounded border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700 break-all">
                  {previewUrl ||
                    (finalApprovalIsLoading
                      ? 'Generating preview link...'
                      : hasExistingPreview
                      ? 'Preview link not available. Refresh to retry.'
                      : 'Preview link not yet created.')}
                </div>

                {previewExpiresAt && (
                  <p className="text-xs text-gray-500">
                    Expires {formatDate(previewExpiresAt)}
                  </p>
                )}

                {previewToken && (
                  <p className="text-xs text-gray-500 break-all">
                    Token: <code>{previewToken}</code>
                  </p>
                )}

                {(previewJustSent || hasExistingPreview) && order.customerApprovalStatus === 'pending' && (
                  <p className="text-xs text-gray-500">
                    Use the copy button above if you need to resend manually.
                  </p>
                )}

                {finalApprovalResult?.tokenCreated === false && (
                  <p className="text-xs text-gray-500">
                    Existing preview token reused for this customer.
                  </p>
                )}

                {finalApprovalResult?.notification && (
                  <div className="space-y-1 text-xs">
                    <p className="font-medium text-gray-900">Amazon Message Center</p>
                    <p className="text-gray-700">
                      {finalApprovalResult.notification.sent
                        ? 'Preview link sent via Amazon Message Center.'
                        : finalApprovalResult.notification.reason || 'Amazon messaging not sent (see logs for details).'}
                    </p>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
    </>
  );
}
