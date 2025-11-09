'use client';

import { useEffect, useState, useRef, useCallback } from 'react';
import { CheckCircle, Play, Download, Flag, Loader2, AlertCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { setFlaggedCount } from '@/lib/review-state';
import { Order } from '@/types/order';
import * as pdfjsLib from 'pdfjs-dist';

// Configure PDF.js worker - use CDN by default for reliability
// The async fetch check doesn't work because PDF.js loads the worker synchronously
// when getDocument() is called, before the fetch check can complete
// Using CDN ensures the worker is always available, even if local file isn't deployed
if (typeof window !== 'undefined') {
  const version = '5.4.394';
  // Use CDN directly - more reliable than local file which may not be deployed correctly
  // The local file often 404s on Cloudflare Pages, so CDN is the safer default
  const cdnUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
  pdfjsLib.GlobalWorkerOptions.workerSrc = cdnUrl;
  console.log('[PDF.js] Using CDN worker:', cdnUrl);
}

interface PostPdfStageProps {
  orderId: string;
  order: Order;
  isApproved: boolean;
  onApprove: () => void;
  onInitiateWorkflow: () => void;
  onRefresh?: () => void;
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

export function PostPdfStage({ orderId, order, isApproved, onApprove, onInitiateWorkflow, onRefresh }: PostPdfStageProps) {
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
  // Track if we're using fallback URLs (images not in manifest yet)
  const [usingFallbackUrls, setUsingFallbackUrls] = useState(false);
  const [imageLoading, setImageLoading] = useState({ left: true, right: true });
  const [imageError, setImageError] = useState<{ left: string | null; right: string | null }>({ left: null, right: null });
  const [coverImageUrl, setCoverImageUrl] = useState<string | null>(null);
  const [coverImageLoading, setCoverImageLoading] = useState(false);
  const [coverImageDataUrl, setCoverImageDataUrl] = useState<string | null>(null); // For PDFs converted to images
  const coverCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const pdfPath = `book-mvp-simple-adventure/orders/${orderId}/complete_book_${orderId}.pdf`;
  const pdfUrl = `/api/pdf/${pdfPath}`;

  // Track if images have been successfully loaded from manifest (stop polling once found)
  const imagesFoundRef = useRef(false);
  // Track last loaded pages data to prevent unnecessary re-renders
  const lastPagesDataRef = useRef<string>('');
  // Track if pages have been loaded (to prevent loading state during polling)
  const pagesLoadedRef = useRef(false);
  // Track spreads length for keyboard navigation to avoid stale closures
  const spreadsLengthRef = useRef(0);
  // Track last spread index to prevent unnecessary loading state resets
  const lastSpreadIndexRef = useRef<number | null>(null);
  // Track last spread key to detect if current spread actually changed
  const lastSpreadKeyRef = useRef<string>('');
  // Track previous spreads to detect actual content changes
  const previousSpreadsRef = useRef<SpreadData[]>([]);
  // Track if ref callback has already handled cached image to prevent multiple calls
  const coverImageRefHandledRef = useRef<{ front: boolean; back: boolean }>({ front: false, back: false });
  // Track preloaded images to keep them in browser cache
  const preloadedImagesRef = useRef<Set<string>>(new Set());

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
    const attemptConversion = async (workerUrl: string | null = null): Promise<string> => {
      // If worker URL is provided, update it before attempting conversion
      if (workerUrl && typeof window !== 'undefined') {
        const previousWorkerSrc = pdfjsLib.GlobalWorkerOptions.workerSrc;
        pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl;
        console.log('[Pages] Using worker URL:', workerUrl);
      }
      
      const loadingTask = pdfjsLib.getDocument(pdfUrl);
      const pdf = await loadingTask.promise;
      const page = await pdf.getPage(1); // Get first page
      
      // Use 1.5x scale for previews (balance between quality and file size)
      // 1x would be too low quality, 2x creates huge files (4x the pixels)
      // 1.5x is a good compromise: 2.25x the pixels, ~60% smaller than 2x
      const scale = 1.5;
      const viewport = page.getViewport({ scale });
      
      // Create canvas
      const canvas = document.createElement('canvas');
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Could not get canvas context');
      }
      
      canvas.height = viewport.height;
      canvas.width = viewport.width;
      
      // Render PDF page to canvas
      await page.render({
        canvas: canvas,
        viewport: viewport
      }).promise;
      
      // Convert canvas to JPEG with 85% quality for much smaller file size
      // PNG is lossless but creates huge files (especially for photos/gradients)
      // JPEG at 85% quality is visually identical but ~70-80% smaller
      const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      return dataUrl;
    };
    
    try {
      console.log('[Pages] Converting PDF to image:', pdfUrl);
      // Try conversion with current worker configuration
      const dataUrl = await attemptConversion();
      console.log('[Pages] ✓ PDF converted to image successfully');
      return dataUrl;
    } catch (error: any) {
      // Check if error is related to worker loading (404, network error, etc.)
      const errorMessage = error?.message || String(error);
      const isWorkerError = errorMessage.includes('worker') || 
                           errorMessage.includes('404') ||
                           errorMessage.includes('Failed to fetch') ||
                           errorMessage.includes('NetworkError');
      
      if (isWorkerError && typeof window !== 'undefined') {
        // Retry with CDN worker URL
        const version = '5.4.394';
        const cdnUrl = `https://unpkg.com/pdfjs-dist@${version}/build/pdf.worker.min.mjs`;
        console.warn('[Pages] Worker error detected, retrying with CDN worker:', cdnUrl);
        
        try {
          const dataUrl = await attemptConversion(cdnUrl);
          console.log('[Pages] ✓ PDF converted to image successfully with CDN worker');
          return dataUrl;
        } catch (retryError) {
          console.error('[Pages] Error converting PDF to image even with CDN worker:', retryError);
          throw retryError;
        }
      } else {
        console.error('[Pages] Error converting PDF to image:', error);
        throw error;
      }
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
        const manifest3Url = `/api/manifests/${manifest3Key}`; // Use relative URL
        
        let pageData: PageData[] = [];
        let foundInManifest = false;
        
        try {
          console.log('[Pages] Fetching manifest from:', manifest3Url);
          const manifest3Res = await fetch(manifest3Url);
          
          if (manifest3Res.ok) {
            const manifest3Raw = await manifest3Res.json();
            
            console.log('[Pages] Raw manifest response type:', Array.isArray(manifest3Raw) ? 'array' : 'object');
            console.log('[Pages] Raw manifest keys (first 20):', manifest3Raw ? Object.keys(manifest3Raw).slice(0, 20) : 'null');
            
            // Handle array response (manifest might be wrapped in array)
            const manifest3 = Array.isArray(manifest3Raw) ? manifest3Raw[0] : manifest3Raw;
            
            console.log('[Pages] Processed manifest type:', Array.isArray(manifest3Raw) ? 'array[0]' : 'object');
            console.log('[Pages] Processed manifest keys (first 20):', manifest3 ? Object.keys(manifest3).slice(0, 20) : 'null');
            
            // Check multiple possible locations for pagePreviewImages
            // Try top-level first (most common), then nested in manifest, then bookAssembly
            let previewImages = manifest3?.pagePreviewImages 
              || manifest3?.manifest?.pagePreviewImages
              || manifest3?.bookAssembly?.pagePreviewImages 
              || [];
            
            // Fallback: Build from pngGeneration.storyImages if pagePreviewImages doesn't exist
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
                  const cfData = pagesWithCloudflare[pageKey] || null;
                  const cloudflareImageUrl = img.cloudflareImageUrl || cfData?.cloudflareImageUrl || null;
                  const cloudflareImageId = img.cloudflareImageId || cfData?.cloudflareImageId || null;
                  
                  // Helper to validate Cloudflare Images URL
                  const isValidCloudflareUrl = (url: string | null): boolean => {
                    if (!url || typeof url !== 'string') return false;
                    // Must be a valid Cloudflare Images URL: https://imagedelivery.net/{accountHash}/{imageId}/{variant}
                    return url.startsWith('https://imagedelivery.net/') && url.split('/').length >= 5;
                  };
                  
                  // Priority 1: Use Cloudflare Images if available and valid (fastest, WebP, CDN)
                  let imageUrl: string;
                  if (cloudflareImageUrl && isValidCloudflareUrl(cloudflareImageUrl)) {
                    imageUrl = cloudflareImageUrl;
                    console.log(`[Pages] Page ${img.pageNumber}: Using Cloudflare Images`);
                  }
                  // Priority 2: Use R2 proxy URL (fallback)
                  else if (img.r2Key) {
                    // Use relative URL so it works with any deployment (production or preview)
                    imageUrl = `/api/assets/${img.r2Key}`;
                    if (cloudflareImageUrl && !isValidCloudflareUrl(cloudflareImageUrl)) {
                      console.warn(`[Pages] Page ${img.pageNumber}: Invalid Cloudflare Images URL, using R2 fallback:`, cloudflareImageUrl);
                    } else {
                      console.log(`[Pages] Page ${img.pageNumber}: Using R2 fallback`);
                    }
                  }
                  // Priority 3: Try to extract r2Key from imageUrl if it's an absolute URL
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
                  
                  console.log(`[Pages] Page ${img.pageNumber}:`, {
                    hasCloudflareUrl: !!cloudflareImageUrl,
                    hasR2Key: !!img.r2Key,
                    hasImageUrl: !!img.imageUrl,
                    finalUrl: imageUrl.substring(0, 80) + '...'
                  });
                  
                  return {
                    pageNumber: img.pageNumber,
                    previewImageUrl: imageUrl,
                    cloudflareImageId: cloudflareImageId || undefined,
                    r2Key: img.r2Key || undefined
                  };
                });
              
              console.log('[Pages] ✓ Loaded preview images from 3-manifest:', pageData.length);
              console.log('[Pages] First page URL:', pageData[0]?.previewImageUrl);
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
              previewImageUrl: `/api/assets/${r2Key}` // Use relative URL
            };
          });
          console.log('[Pages] Fallback: Constructed', pageData.length, 'page URLs using format p00.png, p01.png, etc.');
        } else {
          // Images found in manifest - clear fallback flag
          setUsingFallbackUrls(false);
          console.log('[Pages] ✓ Successfully loaded', pageData.length, 'pages from manifest');
        }
        
        if (!isMounted) return;
        
        // Try to load cover PDF image if not already loaded
        // Load cover separately to avoid blocking page loading
        if (!coverImageUrl && !coverImageDataUrl && !coverImageLoading) {
          setCoverImageLoading(true);
          try {
            // Priority 1: Check manifest for Cloudflare Images cover URL
            let coverUrlToUse: string | null = null;
            try {
              const manifest3Res = await fetch(`/api/manifests/book-mvp-simple-adventure/orders/${orderId}/manifests/3-manifest.json`);
              if (manifest3Res.ok) {
                const manifest3Raw = await manifest3Res.json();
                // Handle array response (manifest might be wrapped in array)
                const manifest3 = Array.isArray(manifest3Raw) ? manifest3Raw[0] : manifest3Raw;
                // Check multiple possible locations for cover data
                const pngGen = manifest3?.pngGeneration || manifest3?.manifest?.pngGeneration || {};
                
                // Check for Cloudflare Images cover URL first
                if (pngGen.coverCloudflareImageUrl) {
                  coverUrlToUse = pngGen.coverCloudflareImageUrl;
                  console.log('[Cover] Using Cloudflare Images URL from manifest');
                }
                // Fallback to R2 cover preview (could be string or object with r2Key)
                else if (pngGen.coverSpreadImage) {
                  const coverR2Key = typeof pngGen.coverSpreadImage === 'string' 
                    ? pngGen.coverSpreadImage 
                    : pngGen.coverSpreadImage?.r2Key;
                  if (coverR2Key) {
                    coverUrlToUse = `/api/assets/${coverR2Key}`;
                    console.log('[Cover] Using R2 cover from manifest:', coverR2Key);
                  } else {
                    console.warn('[Cover] coverSpreadImage found but no r2Key:', pngGen.coverSpreadImage);
                  }
                } else {
                  console.log('[Cover] No cover image found in manifest pngGeneration');
                }
              } else {
                console.log('[Cover] Manifest 3 not found or not OK:', manifest3Res.status);
              }
            } catch (e) {
              console.log('[Cover] Could not fetch cover from manifest, using fallback:', e);
            }
            
            // If we found a cover URL from manifest, use it
            if (coverUrlToUse) {
              setCoverImageUrl(coverUrlToUse);
              setCoverImageLoading(false);
              setPages(currentPages => {
                if (currentPages.length > 0) {
                  const newSpreads = createSpreads(currentPages, coverUrlToUse!);
                  setSpreads(newSpreads);
                  spreadsLengthRef.current = newSpreads.length;
                }
                return currentPages;
              });
              return; // Exit early if we got cover from manifest
            }
            
            // Fallback: Try R2 cover preview image
            const coverPdfPath = `book-mvp-simple-adventure/orders/${orderId}/cover_${orderId}.pdf`;
            const coverPreviewPath = `book-mvp-simple-adventure/orders/${orderId}/preview-images/cover_preview.png`;
            const coverPreviewUrl = `/api/assets/${coverPreviewPath}`;
            
            // Check if cover preview exists, otherwise convert PDF to image
            fetch(coverPreviewUrl, { method: 'HEAD' })
              .then(async res => {
                if (!isMounted) return;
                if (res.ok) {
                  const newCoverUrl = coverPreviewUrl;
                  setCoverImageUrl(newCoverUrl);
                  setCoverImageLoading(false);
                  // Update spreads with new cover URL - use functional update to get latest pages
                  setPages(currentPages => {
                    if (currentPages.length > 0) {
                      const newSpreads = createSpreads(currentPages, newCoverUrl);
                      setSpreads(newSpreads);
                      spreadsLengthRef.current = newSpreads.length;
                    }
                    return currentPages; // Don't change pages
                  });
                } else {
                  // Convert PDF to image using PDF.js
                  const coverPdfUrl = `/api/pdf/${coverPdfPath}`;
                  try {
                    const dataUrl = await convertPdfToImage(coverPdfUrl);
                    if (!isMounted) return;
                    setCoverImageDataUrl(dataUrl);
                    setCoverImageUrl(coverPdfUrl); // Keep PDF URL for reference
                    setCoverImageLoading(false);
                    // Update spreads with new cover data URL - use functional update to get latest pages
                    setPages(currentPages => {
                      if (currentPages.length > 0) {
                        const newSpreads = createSpreads(currentPages, dataUrl);
                        setSpreads(newSpreads);
                        spreadsLengthRef.current = newSpreads.length;
                      }
                      return currentPages; // Don't change pages
                    });
                  } catch (pdfError) {
                    if (!isMounted) return;
                    console.error('[Pages] Failed to convert cover PDF to image:', pdfError);
                    setCoverImageLoading(false);
                  }
                }
              })
              .catch(async () => {
                if (!isMounted) return;
                // Fallback: try to convert PDF to image
                const coverPdfUrl = `/api/pdf/${coverPdfPath}`;
                try {
                  const dataUrl = await convertPdfToImage(coverPdfUrl);
                  if (!isMounted) return;
                  setCoverImageDataUrl(dataUrl);
                  setCoverImageUrl(coverPdfUrl);
                  setCoverImageLoading(false);
                  // Update spreads with new cover data URL - use functional update to get latest pages
                  setPages(currentPages => {
                    if (currentPages.length > 0) {
                      setSpreads(createSpreads(currentPages, dataUrl));
                    }
                    return currentPages; // Don't change pages
                  });
                } catch (pdfError) {
                  if (!isMounted) return;
                  console.error('[Pages] Failed to convert cover PDF to image:', pdfError);
                  setCoverImageLoading(false);
                }
              });
          } catch (e) {
            if (!isMounted) return;
            console.log('[Pages] Cover image not available:', e);
            setCoverImageLoading(false);
          }
        }
        
        // Check if pages have actually changed to prevent unnecessary re-renders
        const currentPagesData = JSON.stringify(pageData);
        const pagesChanged = currentPagesData !== lastPagesDataRef.current;
        const isInitialLoad = lastPagesDataRef.current === '';
        
        // Determine which cover URL to use (prefer data URL from PDF conversion, fallback to image URL)
        const effectiveCoverUrl = coverImageDataUrl || coverImageUrl || undefined;
        
        // Always create spreads with current data (pages + cover)
        const newSpreads = createSpreads(pageData, effectiveCoverUrl);
        
        // Only update pages state if pages actually changed
        if (pagesChanged || isInitialLoad) {
          // Update pages first
          setPages(pageData);
          
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
        }
        
        // Always update spreads (even if pages haven't changed, cover might have)
        // This ensures spreads are always in sync with current data
        setSpreads(newSpreads);
        spreadsLengthRef.current = newSpreads.length;
        
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
            }
          } else {
            setPdfAsset(prev => ({
              ...prev,
              exists: false,
              loading: false,
              error: 'PDF not yet generated'
            }));
          }
        } catch (e) {
          console.error('[Pages] Error checking PDF:', e);
        }
      } catch (error: any) {
        if (!isMounted) return;
        console.error('[Pages] Error loading pages:', error);
        setPagesError(error?.message || 'Failed to load pages');
        setLoadingPages(false);
      }
    };

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

  const handleFlag = () => {
    setPdfAsset(prev => ({ ...prev, isFlagged: !prev.isFlagged }));
  };

  useEffect(() => {
    setFlaggedCount(orderId, 'postPdf', pdfAsset.isFlagged ? 1 : 0);
  }, [orderId, pdfAsset.isFlagged]);

  const isPostBriaApproved = order.reviewStages.postBria.status === 'approved';
  const canApprove = !pdfAsset.isFlagged && isPostBriaApproved;

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
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-lg font-medium text-gray-900">Final Compiled PDF</h3>
            <p className="text-sm text-gray-600 mt-1">
              Review the complete personalized book before final approval
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

        {/* PDF Viewer - Page Preview */}
        {loadingPages && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <Loader2 className="h-8 w-8 text-gray-400 animate-spin mx-auto mb-2" />
                <p className="text-gray-500 text-sm">Loading book pages...</p>
              </div>
            </div>
          </div>
        )}

        {pagesError && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center">
                <AlertCircle className="h-8 w-8 text-red-400 mx-auto mb-2" />
                <p className="text-red-600 text-sm font-medium">{pagesError}</p>
              </div>
            </div>
          </div>
        )}

        {/* Show "Preview Images Pending" only if no spreads exist yet */}
        {!loadingPages && !pagesError && pages.length === 0 && spreads.length === 0 && (
          <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
            <div className="h-[800px] bg-gray-50 flex items-center justify-center">
              <div className="text-center max-w-md">
                <Loader2 className="h-12 w-12 text-blue-500 animate-spin mx-auto mb-4" />
                <h4 className="text-lg font-medium text-gray-900 mb-2">Preview Images Pending</h4>
                <p className="text-gray-600 text-sm mb-4">
                  Book preview images will appear here automatically once Workflow 3 (Book Assembly) completes.
                </p>
                <p className="text-gray-500 text-xs">
                  This page will refresh automatically every 10 seconds.
                </p>
              </div>
            </div>
          </div>
        )}

        {!pagesError && spreads.length > 0 && currentSpread && (
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
                            // Use setTimeout to defer state update to avoid React error #185
                            // Also check if we've already handled this to prevent multiple calls
                            if (img && img.complete && img.naturalHeight !== 0 && img.naturalWidth !== 0 && !coverImageRefHandledRef.current.back) {
                              coverImageRefHandledRef.current.back = true;
                              console.log('[Spreads] ✓ Back cover image already loaded (cached)');
                              // Defer state update to avoid updating during render
                              setTimeout(() => {
                                setImageLoading(prev => ({ ...prev, left: false }));
                                setImageError(prev => ({ ...prev, left: null }));
                              }, 0);
                            } else if (!img) {
                              // Reset flag when image is unmounted
                              coverImageRefHandledRef.current.back = false;
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
                            // Use setTimeout to defer state update to avoid React error #185
                            // Also check if we've already handled this to prevent multiple calls
                            if (img && img.complete && img.naturalHeight !== 0 && img.naturalWidth !== 0 && !coverImageRefHandledRef.current.front) {
                              coverImageRefHandledRef.current.front = true;
                              console.log('[Spreads] ✓ Front cover image already loaded (cached)');
                              // Defer state update to avoid updating during render
                              setTimeout(() => {
                                setImageLoading(prev => ({ ...prev, right: false }));
                                setImageError(prev => ({ ...prev, right: null }));
                              }, 0);
                            } else if (!img) {
                              // Reset flag when image is unmounted
                              coverImageRefHandledRef.current.front = false;
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
              <span className="ml-1 text-gray-900">8×10 Softcover</span>
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
              <li>• Print margins are correct for 8×10 format</li>
              <li>• PDF is optimized for print production</li>
            </ul>
          </div>
        </div>
      </div>

      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between">
          <div>
            <h4 className="text-lg font-medium text-gray-900">Final Approval</h4>
            <p className="text-sm text-gray-600 mt-1">
              {isApproved 
                ? 'This order has been fully approved and is ready for production.'
                : !isPostBriaApproved
                ? 'The Post-Bria stage must be approved before final PDF review can begin.'
                : pdfAsset.isFlagged
                ? 'Please address the flagged issues before final approval.'
                : 'Review the compiled PDF and approve when ready for production.'
              }
            </p>
          </div>
          
          <div className="flex space-x-3">
            {isApproved ? (
              <button
                onClick={onInitiateWorkflow}
                className="inline-flex items-center px-4 py-2 bg-green-600 text-white rounded-md hover:bg-green-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-green-500"
              >
                <Play className="h-4 w-4 mr-2" />
                Send to Production
              </button>
            ) : (
              <button
                onClick={onApprove}
                disabled={!canApprove}
                className={`inline-flex items-center px-4 py-2 rounded-md focus:outline-none focus:ring-2 focus:ring-offset-2 ${
                  !canApprove
                    ? 'bg-gray-300 text-gray-500 cursor-not-allowed'
                    : 'bg-blue-600 text-white hover:bg-blue-700 focus:ring-blue-500'
                }`}
              >
                <CheckCircle className="h-4 w-4 mr-2" />
                Final Approval
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
    </>
  );
}
