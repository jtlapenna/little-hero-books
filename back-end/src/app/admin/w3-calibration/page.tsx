'use client';
/* eslint-disable @next/next/no-img-element */

import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  type MouseEvent as ReactMouseEvent,
} from 'react';
import Link from 'next/link';
import {
  ArrowLeftRight,
  Copy,
  Crosshair,
  Eye,
  Grip,
  ImageIcon,
  Move,
  RefreshCw,
  Ruler,
  Sparkles,
  Workflow,
} from 'lucide-react';

type PlacementEntry = {
  left: number;
  top: number;
  width: number;
  rotateDeg?: number;
  zIndex?: number;
  anchorXPercent?: number;
  anchorYPercent?: number;
};

type PoseAnchorDraft = {
  groundContactY: number;
  groundContactCenterX: number;
  headToFeetSpan: number;
};

type PoseAnchorMetrics = PoseAnchorDraft & {
  centerlineX: number;
  groundContactWidth: number;
};

type PoseScaleDiagnostics = {
  scaleFactor: number;
  verticalOffset: number;
  horizontalOffset: number;
  groundContactOffset: number;
  sourceAnchorMetrics: PoseAnchorMetrics;
  referenceAnchorMetrics: PoseAnchorMetrics;
};

type PoseScaleInspectionResult = {
  success: true;
  imageKey: string;
  refKey: string;
  poseNumber: number;
  bookId: string;
  sourceCanvas: { width: number; height: number };
  referenceCanvas: { width: number; height: number };
  sourceBBoxFound: boolean;
  referenceBBoxFound: boolean;
  diagnostics: PoseScaleDiagnostics | null;
};

type CalibrationPageOption = {
  pageLabel: string;
  pageNumber: number;
  storyPageNumber: number;
  poseNumber: number | null;
  editableAssetType: 'character' | 'animal' | 'cover-character';
  backgroundUrl: string | null;
  overlayUrls: string[];
  characterUrl: string | null;
  animalUrl: string | null;
  editableAssetUrl: string | null;
  currentPlacement: PlacementEntry | null;
  legacyPlacement: PlacementEntry | null;
  viewport: {
    width: number;
    height: number;
  };
};

type CalibrationPoseOption = {
  poseNumber: number;
  imageUrl: string;
  referenceUrl: string;
  usedByStoryPages: number[];
};

type CalibrationResponse = {
  success: true;
  fixtureOptions: Array<{ fixtureId: string; label: string }>;
  source: {
    type: 'fixture' | 'order';
    fixtureId: string | null;
    orderId: string;
    label: string;
    bookId: string;
    formatId: string | null;
    orderPrefix: string;
    pagePlanSource: string;
    requiredPoseSource: string;
    poseAssetMode: 'live-generated' | 'reference-standin';
  };
  viewport: {
    width: number;
    height: number;
  };
  pages: CalibrationPageOption[];
  poses: CalibrationPoseOption[];
  selectedStoryPageNumber: number | null;
  selectedPoseNumber: number | null;
  selectedPage: {
    currentSrcDoc: string | null;
    legacySrcDoc: string | null;
    backgroundUrl: string | null;
    overlayUrls: string[];
    editableAssetType: 'character' | 'animal' | 'cover-character';
    editableAssetUrl: string | null;
    characterUrl: string | null;
    animalUrl: string | null;
    currentPlacement: PlacementEntry | null;
    legacyPlacement: PlacementEntry | null;
    viewport: {
      width: number;
      height: number;
    };
  } | null;
  selectedPose: {
    poseNumber: number;
    imageUrl: string;
    referenceUrl: string;
    inspection: PoseScaleInspectionResult | null;
    inspectionError: string | null;
  } | null;
  exportHints: {
    characterPlacementOverrideByStoryPage: Record<string, PlacementEntry>;
    animalPlacementOverrideByStoryPage: Record<string, PlacementEntry>;
    coverCharacterPlacementOverride: PlacementEntry | null;
    poseAnchorSuggestionByPose: Record<string, PoseAnchorDraft>;
  };
};

type CalibrationRequest = {
  sourceType: 'fixture' | 'order';
  fixtureId?: string | null;
  orderId?: string | null;
  selectedStoryPageNumber?: number | null;
  selectedPoseNumber?: number | null;
  characterPlacementOverrideByStoryPage?: Record<string, PlacementEntry>;
  animalPlacementOverrideByStoryPage?: Record<string, PlacementEntry>;
  coverCharacterPlacementOverride?: PlacementEntry | null;
};

const FALLBACK_FIXTURE_OPTIONS = [
  {
    fixtureId: 'book1-standard-manifest-url-hint',
    label: 'Book 1 D2C Replay',
  },
  {
    fixtureId: 'book1-amazon-sibling',
    label: 'Book 1 Amazon Replay',
  },
];

// W3 placement coordinates are authored on the legacy 2550px interior grid,
// then scaled up to the 2625px render output. The editor must use the same
// base grid or it will drift slightly from the real W3 render.
const W3_PLACEMENT_BASE = 2550;

function clonePlacement(entry: PlacementEntry | null | undefined): PlacementEntry | null {
  if (!entry) {
    return null;
  }

  return {
    left: entry.left,
    top: entry.top,
    width: entry.width,
    rotateDeg: entry.rotateDeg,
    zIndex: entry.zIndex,
    anchorXPercent: entry.anchorXPercent,
    anchorYPercent: entry.anchorYPercent,
  };
}

function clampNumber(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function formatRatio(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'N/A';
  }
  return value.toFixed(4);
}

function formatSignedPercent(value: number | null | undefined): string {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    return 'N/A';
  }

  const percent = value * 100;
  const prefix = percent > 0 ? '+' : '';
  return `${prefix}${percent.toFixed(2)}%`;
}

function sortPlacementOverrides(
  overrides: Record<string, PlacementEntry>,
): Record<string, PlacementEntry> {
  return Object.fromEntries(
    Object.entries(overrides).sort(
      ([left], [right]) => Number(left) - Number(right),
    ),
  );
}

function buildPlacementStyle(
  placement: PlacementEntry | null,
  placementBase: { width: number; height: number },
  options: {
    opacity?: number;
    outline?: string;
    filter?: string;
    pointerEvents?: CSSProperties['pointerEvents'];
  } = {},
): CSSProperties {
  if (!placement) {
    return { display: 'none' };
  }

  const anchorXPercent =
    typeof placement.anchorXPercent === 'number' ? placement.anchorXPercent : 50;
  const anchorYPercent =
    typeof placement.anchorYPercent === 'number' ? placement.anchorYPercent : 100;
  const transforms = [`translate(-${anchorXPercent}%, -${anchorYPercent}%)`];
  if (typeof placement.rotateDeg === 'number' && placement.rotateDeg !== 0) {
    transforms.push(`rotate(${placement.rotateDeg}deg)`);
  }

  return {
    position: 'absolute',
    left: `${(placement.left / placementBase.width) * 100}%`,
    top: `${(placement.top / placementBase.height) * 100}%`,
    width: `${(placement.width / placementBase.width) * 100}%`,
    transform: transforms.join(' '),
    transformOrigin: `${anchorXPercent}% ${anchorYPercent}%`,
    zIndex: placement.zIndex ?? 10,
    opacity: options.opacity,
    outline: options.outline,
    filter: options.filter,
    pointerEvents: options.pointerEvents,
  };
}

function resolvePlacementBase(
  editableAssetType: CalibrationPageOption['editableAssetType'] | undefined,
  viewport: { width: number; height: number },
): { width: number; height: number } {
  if (editableAssetType === 'cover-character') {
    return viewport;
  }

  return { width: W3_PLACEMENT_BASE, height: W3_PLACEMENT_BASE };
}

function buildAnchorMarkerStyle(anchor: PoseAnchorDraft): CSSProperties {
  return {
    position: 'absolute',
    left: `${anchor.groundContactCenterX * 100}%`,
    top: `${anchor.groundContactY * 100}%`,
    transform: 'translate(-50%, -50%)',
  };
}

async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    return false;
  }
}

function CalibrationImagePanel({
  title,
  subtitle,
  imageUrl,
  canvas,
  anchor,
  mode,
  onImageClick,
}: {
  title: string;
  subtitle: string;
  imageUrl: string;
  canvas: { width: number; height: number };
  anchor: PoseAnchorDraft;
  mode: 'ground' | 'head';
  onImageClick?: (event: ReactMouseEvent<HTMLDivElement>) => void;
}) {
  const headY = clampNumber(anchor.groundContactY - anchor.headToFeetSpan, 0, 1);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
      <div className="border-b border-gray-200 px-4 py-3">
        <div className="text-sm font-semibold text-gray-900">{title}</div>
        <div className="mt-1 text-xs text-gray-500">{subtitle}</div>
      </div>
      <div className="p-4">
        <div
          onClick={onImageClick}
          className={`relative mx-auto overflow-hidden rounded-2xl border border-gray-200 bg-[radial-gradient(circle_at_top,_#f8fafc,_#e2e8f0)] ${
            onImageClick ? 'cursor-crosshair' : ''
          }`}
          style={{ width: '100%', maxWidth: 420, aspectRatio: `${canvas.width} / ${canvas.height}` }}
        >
          <img src={imageUrl} alt="" className="h-full w-full object-contain" />
          <div
            className="absolute inset-y-0 border-l border-dashed border-cyan-500/80"
            style={{ left: `${anchor.groundContactCenterX * 100}%` }}
          />
          <div
            className="absolute inset-x-0 border-t border-dashed border-cyan-500/80"
            style={{ top: `${anchor.groundContactY * 100}%` }}
          />
          <div
            className="absolute inset-x-0 border-t border-dotted border-violet-500/80"
            style={{ top: `${headY * 100}%` }}
          />
          <div
            className="pointer-events-none absolute inset-x-0 border-t border-dashed border-amber-500/60"
            style={{ top: `${clampNumber(anchor.groundContactY - 0.01, 0, 1) * 100}%` }}
          />
          <div
            className="h-3.5 w-3.5 rounded-full border-2 border-white bg-cyan-500 shadow"
            style={buildAnchorMarkerStyle(anchor)}
          />
          <div
            className="absolute left-3 top-3 rounded-full border border-gray-200 bg-white/90 px-2 py-1 text-[11px] font-medium text-gray-700 shadow-sm"
          >
            click mode: {mode === 'ground' ? 'set ground point' : 'set head point'}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function W3CalibrationPage() {
  const [sourceType, setSourceType] = useState<'fixture' | 'order'>('fixture');
  const [fixtureId, setFixtureId] = useState('book1-standard-manifest-url-hint');
  const [orderId, setOrderId] = useState('');
  const [selectedStoryPageNumber, setSelectedStoryPageNumber] = useState<number | null>(null);
  const [selectedPoseNumber, setSelectedPoseNumber] = useState<number | null>(null);
  const [activeTab, setActiveTab] = useState<'placement' | 'anchors'>('placement');
  const [anchorEditMode, setAnchorEditMode] = useState<'ground' | 'head'>('ground');
  const [showLegacyGhost, setShowLegacyGhost] = useState(true);
  const [data, setData] = useState<CalibrationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [renderingDraft, setRenderingDraft] = useState(false);
  const [banner, setBanner] = useState<{
    tone: 'error' | 'info' | 'success';
    message: string;
  } | null>(null);
  const [characterPlacementOverrides, setCharacterPlacementOverrides] = useState<Record<string, PlacementEntry>>({});
  const [animalPlacementOverrides, setAnimalPlacementOverrides] = useState<Record<string, PlacementEntry>>({});
  const [coverCharacterPlacementOverride, setCoverCharacterPlacementOverride] = useState<PlacementEntry | null>(null);
  const [anchorDrafts, setAnchorDrafts] = useState<Record<string, PoseAnchorDraft>>({});
  const [dragging, setDragging] = useState(false);
  const previewCanvasRef = useRef<HTMLDivElement | null>(null);
  const dragStateRef = useRef<{
    pageNumber: number;
    pointerId: number;
    startClientX: number;
    startClientY: number;
    startLeft: number;
    startTop: number;
    basePlacement: PlacementEntry;
  } | null>(null);

  const fixtureOptions = data?.fixtureOptions ?? FALLBACK_FIXTURE_OPTIONS;

  const fetchCalibration = async (
    request: CalibrationRequest,
    options: { preserveDrafts?: boolean } = {},
  ) => {
    setLoading(!options.preserveDrafts);
    setRenderingDraft(Boolean(options.preserveDrafts));
    setBanner(null);

    try {
      const response = await fetch('/api/admin/w3-calibration', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(request),
      });
      const payload = (await response.json()) as CalibrationResponse & { error?: string };
      if (!response.ok || !payload.success) {
        throw new Error(payload.error || 'Failed to load W3 calibration data');
      }

      setData(payload);
      setSelectedStoryPageNumber(payload.selectedStoryPageNumber);
      setSelectedPoseNumber(payload.selectedPoseNumber);
      setAnchorDrafts((previous) => {
        const next = { ...previous };
        for (const [poseNumber, suggestion] of Object.entries(
          payload.exportHints.poseAnchorSuggestionByPose,
        )) {
          if (!next[poseNumber]) {
            next[poseNumber] = {
              groundContactY: suggestion.groundContactY,
              groundContactCenterX: suggestion.groundContactCenterX,
              headToFeetSpan: suggestion.headToFeetSpan,
            };
          }
        }
        return next;
      });
    } catch (error) {
      console.error('Failed to load W3 calibration:', error);
      setBanner({
        tone: 'error',
        message: error instanceof Error ? error.message : 'Failed to load W3 calibration',
      });
    } finally {
      setLoading(false);
      setRenderingDraft(false);
    }
  };

  useEffect(() => {
    void fetchCalibration({
      sourceType: 'fixture',
      fixtureId: 'book1-standard-manifest-url-hint',
      selectedStoryPageNumber: null,
      selectedPoseNumber: null,
    });
  }, []);

  const selectedPagePlacement = useMemo(() => {
    if (selectedStoryPageNumber === null || !data?.selectedPage) {
      return null;
    }
    if (data.selectedPage.editableAssetType === 'cover-character') {
      return (
        clonePlacement(coverCharacterPlacementOverride) ??
        clonePlacement(data.selectedPage.currentPlacement) ??
        clonePlacement(data.selectedPage.legacyPlacement)
      );
    }

    const overrides =
      data.selectedPage.editableAssetType === 'animal'
        ? animalPlacementOverrides
        : characterPlacementOverrides;
    return (
      overrides[String(selectedStoryPageNumber)] ??
      clonePlacement(data.selectedPage.currentPlacement) ??
      clonePlacement(data.selectedPage.legacyPlacement)
    );
  }, [
    animalPlacementOverrides,
    characterPlacementOverrides,
    coverCharacterPlacementOverride,
    data,
    selectedStoryPageNumber,
  ]);

  const selectedLegacyPlacement = useMemo(
    () => clonePlacement(data?.selectedPage?.legacyPlacement),
    [data],
  );

  const selectedAnchorDraft = useMemo(() => {
    if (!selectedPoseNumber) {
      return null;
    }
    return (
      anchorDrafts[String(selectedPoseNumber)] ??
      data?.exportHints.poseAnchorSuggestionByPose[String(selectedPoseNumber)] ??
      null
    );
  }, [anchorDrafts, data, selectedPoseNumber]);

  const placementExportJson = useMemo(
    () => {
      const payload: Record<string, unknown> = {};
      if (Object.keys(characterPlacementOverrides).length > 0) {
        payload.characterPlacementOverrideByStoryPage = sortPlacementOverrides(
          characterPlacementOverrides,
        );
      }
      if (Object.keys(animalPlacementOverrides).length > 0) {
        payload.animalPlacementOverrideByStoryPage = sortPlacementOverrides(
          animalPlacementOverrides,
        );
      }
      if (coverCharacterPlacementOverride) {
        payload.coverCharacterPlacementOverride = coverCharacterPlacementOverride;
      }

      return JSON.stringify(payload, null, 2);
    },
    [animalPlacementOverrides, characterPlacementOverrides, coverCharacterPlacementOverride],
  );

  const anchorExportJson = useMemo(
    () =>
      JSON.stringify(
        Object.fromEntries(
          Object.entries(anchorDrafts).sort(
            ([left], [right]) => Number(left) - Number(right),
          ),
        ),
        null,
        2,
      ),
    [anchorDrafts],
  );

  const applyPlacementPatch = (patch: Partial<PlacementEntry>) => {
    if (selectedStoryPageNumber === null) {
      return;
    }

    const base =
      clonePlacement(selectedPagePlacement) ??
      clonePlacement(data?.selectedPage?.currentPlacement) ??
      clonePlacement(data?.selectedPage?.legacyPlacement);
    if (!base) {
      return;
    }

    const nextEntry: PlacementEntry = {
      ...base,
      ...patch,
    };

    if (data?.selectedPage?.editableAssetType === 'cover-character') {
      setCoverCharacterPlacementOverride(nextEntry);
      return;
    }

    if (data?.selectedPage?.editableAssetType === 'animal') {
      setAnimalPlacementOverrides((previous) => ({
        ...previous,
        [String(selectedStoryPageNumber)]: nextEntry,
      }));
      return;
    }

    setCharacterPlacementOverrides((previous) => ({
      ...previous,
      [String(selectedStoryPageNumber)]: nextEntry,
    }));
  };

  const handleLoadSource = async () => {
    const nextRequest: CalibrationRequest =
      sourceType === 'order'
        ? {
            sourceType,
            orderId: orderId.trim(),
            selectedStoryPageNumber: null,
            selectedPoseNumber: null,
          }
        : {
            sourceType,
            fixtureId,
            selectedStoryPageNumber: null,
            selectedPoseNumber: null,
          };

    setCharacterPlacementOverrides({});
    setAnimalPlacementOverrides({});
    setCoverCharacterPlacementOverride(null);
    setAnchorDrafts({});
    setSelectedStoryPageNumber(null);
    setSelectedPoseNumber(null);
    await fetchCalibration(nextRequest);
  };

  const handleRenderDraft = async () => {
    await fetchCalibration(
      sourceType === 'order'
        ? {
            sourceType,
            orderId: orderId.trim(),
            selectedStoryPageNumber,
            selectedPoseNumber,
            characterPlacementOverrideByStoryPage: characterPlacementOverrides,
            animalPlacementOverrideByStoryPage: animalPlacementOverrides,
            coverCharacterPlacementOverride,
          }
        : {
            sourceType,
            fixtureId,
            selectedStoryPageNumber,
            selectedPoseNumber,
            characterPlacementOverrideByStoryPage: characterPlacementOverrides,
            animalPlacementOverrideByStoryPage: animalPlacementOverrides,
            coverCharacterPlacementOverride,
          },
      { preserveDrafts: true },
    );
  };

  const handlePageSelect = async (storyPageNumber: number) => {
    setSelectedStoryPageNumber(storyPageNumber);
    await fetchCalibration(
      sourceType === 'order'
        ? {
            sourceType,
            orderId: orderId.trim(),
            selectedStoryPageNumber: storyPageNumber,
            selectedPoseNumber,
            characterPlacementOverrideByStoryPage: characterPlacementOverrides,
            animalPlacementOverrideByStoryPage: animalPlacementOverrides,
            coverCharacterPlacementOverride,
          }
        : {
            sourceType,
            fixtureId,
            selectedStoryPageNumber: storyPageNumber,
            selectedPoseNumber,
            characterPlacementOverrideByStoryPage: characterPlacementOverrides,
            animalPlacementOverrideByStoryPage: animalPlacementOverrides,
            coverCharacterPlacementOverride,
          },
      { preserveDrafts: true },
    );
  };

  const handlePoseSelect = async (poseNumber: number) => {
    setSelectedPoseNumber(poseNumber);
    await fetchCalibration(
      sourceType === 'order'
        ? {
            sourceType,
            orderId: orderId.trim(),
            selectedStoryPageNumber,
            selectedPoseNumber: poseNumber,
            characterPlacementOverrideByStoryPage: characterPlacementOverrides,
            animalPlacementOverrideByStoryPage: animalPlacementOverrides,
            coverCharacterPlacementOverride,
          }
        : {
            sourceType,
            fixtureId,
            selectedStoryPageNumber,
            selectedPoseNumber: poseNumber,
            characterPlacementOverrideByStoryPage: characterPlacementOverrides,
            animalPlacementOverrideByStoryPage: animalPlacementOverrides,
            coverCharacterPlacementOverride,
          },
      { preserveDrafts: true },
    );
  };

  const handleCopyPlacement = async () => {
    if (selectedStoryPageNumber === null || !selectedPagePlacement) {
      return;
    }

    const snippet = JSON.stringify(
      data?.selectedPage?.editableAssetType === 'cover-character'
        ? { coverCharacterPlacementOverride: selectedPagePlacement }
        : data?.selectedPage?.editableAssetType === 'animal'
        ? { animalPlacementOverrideByStoryPage: { [String(selectedStoryPageNumber)]: selectedPagePlacement } }
        : { characterPlacementOverrideByStoryPage: { [String(selectedStoryPageNumber)]: selectedPagePlacement } },
      null,
      2,
    );
    const copied = await copyText(snippet);
    setBanner({
      tone: copied ? 'success' : 'error',
      message: copied
        ? `Copied ${
            data?.selectedPage?.editableAssetType === 'cover-character'
              ? 'cover'
              : `${data?.selectedPage?.editableAssetType ?? 'page'} placement`
          } override for ${
            selectedStoryPageNumber === 0 ? 'the cover' : `story page ${selectedStoryPageNumber}`
          }.`
        : 'Failed to copy placement override.',
    });
  };

  const handleCopyAllPlacements = async () => {
    const copied = await copyText(placementExportJson);
    setBanner({
      tone: copied ? 'success' : 'error',
      message: copied
        ? 'Copied all placement overrides.'
        : 'Failed to copy placement overrides.',
    });
  };

  const handleCopyPoseAnchors = async () => {
    const copied = await copyText(anchorExportJson);
    setBanner({
      tone: copied ? 'success' : 'error',
      message: copied ? 'Copied pose anchor draft JSON.' : 'Failed to copy pose anchor JSON.',
    });
  };

  const handleUseLegacyPlacement = () => {
    if (!selectedLegacyPlacement) {
      return;
    }

    applyPlacementPatch(selectedLegacyPlacement);
  };

  const handleResetCurrentPage = () => {
    if (selectedStoryPageNumber === null) {
      return;
    }
    if (data?.selectedPage?.editableAssetType === 'cover-character') {
      setCoverCharacterPlacementOverride(null);
      return;
    }
    if (data?.selectedPage?.editableAssetType === 'animal') {
      setAnimalPlacementOverrides((previous) => {
        const next = { ...previous };
        delete next[String(selectedStoryPageNumber)];
        return next;
      });
      return;
    }
    setCharacterPlacementOverrides((previous) => {
      const next = { ...previous };
      delete next[String(selectedStoryPageNumber)];
      return next;
    });
  };

  const handlePlacementDragStart = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (selectedStoryPageNumber === null || !selectedPagePlacement) {
      return;
    }

    event.preventDefault();
    previewCanvasRef.current?.setPointerCapture(event.pointerId);
    dragStateRef.current = {
      pageNumber: selectedStoryPageNumber,
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startLeft: selectedPagePlacement.left,
      startTop: selectedPagePlacement.top,
      basePlacement: selectedPagePlacement,
    };
    setDragging(true);
  };

  const handlePlacementDragMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const dragState = dragStateRef.current;
    if (
      !dragState ||
      !previewCanvasRef.current ||
      selectedStoryPageNumber === null ||
      !data
    ) {
      return;
    }

    const rect = previewCanvasRef.current.getBoundingClientRect();
    const placementBase = resolvePlacementBase(
      data.selectedPage?.editableAssetType,
      data.selectedPage?.viewport ?? data.viewport,
    );
    const deltaX =
      (event.clientX - dragState.startClientX) * (placementBase.width / rect.width);
    const deltaY =
      (event.clientY - dragState.startClientY) * (placementBase.height / rect.height);

    const nextEntry = {
      ...dragState.basePlacement,
      left: clampNumber(dragState.startLeft + deltaX, 0, placementBase.width),
      top: clampNumber(dragState.startTop + deltaY, 0, placementBase.height),
    };
    if (data.selectedPage?.editableAssetType === 'cover-character') {
      setCoverCharacterPlacementOverride(nextEntry);
      return;
    }
    if (data.selectedPage?.editableAssetType === 'animal') {
      setAnimalPlacementOverrides((previous) => ({
        ...previous,
        [String(selectedStoryPageNumber)]: nextEntry,
      }));
      return;
    }
    setCharacterPlacementOverrides((previous) => ({
      ...previous,
      [String(selectedStoryPageNumber)]: nextEntry,
    }));
  };

  const handlePlacementDragEnd = () => {
    const dragState = dragStateRef.current;
    if (!dragState) {
      return;
    }

    previewCanvasRef.current?.releasePointerCapture?.(dragState.pointerId);
    dragStateRef.current = null;
    setDragging(false);
  };

  const handleAnchorImageClick = (
    event: ReactMouseEvent<HTMLDivElement>,
    canvas: { width: number; height: number },
  ) => {
    if (!selectedPoseNumber || !selectedAnchorDraft) {
      return;
    }

    const rect = event.currentTarget.getBoundingClientRect();
    const xRatio = clampNumber((event.clientX - rect.left) / rect.width, 0, 1);
    const yRatio = clampNumber((event.clientY - rect.top) / rect.height, 0, 1);
    void canvas;

    setAnchorDrafts((previous) => {
      const current = previous[String(selectedPoseNumber)] ?? selectedAnchorDraft;
      const next =
        anchorEditMode === 'ground'
          ? {
              ...current,
              groundContactCenterX: xRatio,
              groundContactY: yRatio,
            }
          : {
              ...current,
              headToFeetSpan: clampNumber(current.groundContactY - yRatio, 0.02, 1),
            };

      return {
        ...previous,
        [String(selectedPoseNumber)]: next,
      };
    });
  };

  const selectedPage = data?.selectedPage ?? null;
  const selectedPose = data?.selectedPose ?? null;
  const selectedPoseDiagnostics = selectedPose?.inspection?.diagnostics ?? null;
  const usesReferencePoseStandins = data?.source.poseAssetMode === 'reference-standin';
  const selectedPageViewport = selectedPage?.viewport ?? data?.viewport ?? { width: 1, height: 1 };
  const selectedPlacementBase = resolvePlacementBase(
    selectedPage?.editableAssetType,
    selectedPageViewport,
  );
  const currentSelectionLabel =
    selectedStoryPageNumber === 0
      ? 'cover'
      : selectedStoryPageNumber !== null
        ? `story ${selectedStoryPageNumber}`
        : 'N/A';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-sm font-medium text-cyan-900">
              <Sparkles className="h-4 w-4" />
              W3 Calibration
            </div>
            <h1 className="text-3xl font-bold text-gray-900">
              Tune page placement and pose anchors without rerunning workflows
            </h1>
            <p className="mt-2 max-w-4xl text-sm text-gray-600">
              Intent: operators need one visual workspace for Book 1 calibration. This page loads real W3 scene data,
              lets you drag the character against the background, compares the exact current render against the legacy
              reference, and exports config snippets instead of guessing through full workflow reruns.
            </p>
          </div>

          <Link
            href="/admin/workflow-jobs"
            className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50"
          >
            <Workflow className="mr-2 h-4 w-4" />
            Back to Workflows
          </Link>
        </div>

        {banner && (
          <div
            className={`mb-6 rounded-xl border px-4 py-3 text-sm ${
              banner.tone === 'error'
                ? 'border-red-200 bg-red-50 text-red-800'
                : banner.tone === 'success'
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-800'
                  : 'border-blue-200 bg-blue-50 text-blue-800'
            }`}
          >
            {banner.message}
          </div>
        )}

        <div className="mb-6 rounded-2xl border border-gray-200 bg-white shadow-sm">
          <div className="border-b border-gray-200 px-5 py-4">
            <h2 className="text-lg font-semibold text-gray-900">Source</h2>
            <p className="mt-1 text-sm text-gray-600">
              Load either a replay fixture or a live order. Page placements are story-page scoped, so the exported
              overrides apply to future orders of the same book instead of just one run.
            </p>
          </div>
          <div className="grid gap-4 px-5 py-5 lg:grid-cols-[180px_1fr_auto]">
            <div>
              <label className="mb-2 block text-sm font-medium text-gray-700">Source type</label>
              <select
                value={sourceType}
                onChange={(event) =>
                  setSourceType(event.target.value === 'order' ? 'order' : 'fixture')
                }
                className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none focus:border-cyan-500"
              >
                <option value="fixture">Fixture replay</option>
                <option value="order">Live order</option>
              </select>
            </div>

            <div>
              {sourceType === 'fixture' ? (
                <>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Fixture</label>
                  <select
                    value={fixtureId}
                    onChange={(event) => setFixtureId(event.target.value)}
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none focus:border-cyan-500"
                  >
                    {fixtureOptions.map((fixture) => (
                      <option key={fixture.fixtureId} value={fixture.fixtureId}>
                        {fixture.label}
                      </option>
                    ))}
                  </select>
                </>
              ) : (
                <>
                  <label className="mb-2 block text-sm font-medium text-gray-700">Order ID</label>
                  <input
                    value={orderId}
                    onChange={(event) => setOrderId(event.target.value)}
                    placeholder="847ade56-323c-453c-9982-fcbb006f919c"
                    className="w-full rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm text-gray-900 shadow-sm outline-none focus:border-cyan-500"
                  />
                </>
              )}
            </div>

            <div className="flex gap-3 lg:self-end">
              <button
                onClick={() => void handleLoadSource()}
                disabled={loading}
                className="inline-flex items-center rounded-xl bg-cyan-600 px-4 py-3 text-sm font-medium text-white shadow-sm hover:bg-cyan-700 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <RefreshCw className={`mr-2 h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
                Load
              </button>
              <button
                onClick={() => void handleRenderDraft()}
                disabled={renderingDraft || !data}
                className="inline-flex items-center rounded-xl border border-gray-300 bg-white px-4 py-3 text-sm font-medium text-gray-700 shadow-sm hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
              >
                <Eye className={`mr-2 h-4 w-4 ${renderingDraft ? 'animate-pulse' : ''}`} />
                Render Draft
              </button>
            </div>
          </div>
        </div>

        {data && (
          <div className="mb-6 grid gap-4 md:grid-cols-6">
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Source</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">{data.source.label}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Book / Format</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {data.source.bookId} / {data.source.formatId || 'N/A'}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Page plan</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">{data.source.pagePlanSource}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pose source</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">{data.source.requiredPoseSource}</div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Pose assets</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {usesReferencePoseStandins ? 'reference stand-ins' : 'live generated'}
              </div>
            </div>
            <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">Current selection</div>
              <div className="mt-2 text-sm font-semibold text-gray-900">
                {selectedStoryPageNumber === 0
                  ? 'cover / pose 00'
                  : `${currentSelectionLabel} / pose ${selectedPoseNumber ?? 'N/A'}`}
              </div>
            </div>
          </div>
        )}

        {data && usesReferencePoseStandins && (
          <div className="mb-6 rounded-2xl border border-blue-200 bg-blue-50 px-5 py-4 text-sm text-blue-900 shadow-sm">
            Fixture replay is using shared reference-pose stand-ins instead of live 2B cutouts. That is correct for
            page-placement calibration, but pose-drift diagnostics are only representative on a live order.
          </div>
        )}

        <div className="mb-6 flex items-center gap-3">
          <button
            onClick={() => setActiveTab('placement')}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium ${
              activeTab === 'placement'
                ? 'bg-cyan-600 text-white shadow'
                : 'border border-gray-300 bg-white text-gray-700'
            }`}
          >
            <Move className="mr-2 h-4 w-4" />
            Page placement
          </button>
          <button
            onClick={() => setActiveTab('anchors')}
            className={`inline-flex items-center rounded-full px-4 py-2 text-sm font-medium ${
              activeTab === 'anchors'
                ? 'bg-violet-600 text-white shadow'
                : 'border border-gray-300 bg-white text-gray-700'
            }`}
          >
            <Crosshair className="mr-2 h-4 w-4" />
            Pose anchors
          </button>
        </div>

        {!data ? (
          <div className="rounded-2xl border border-gray-200 bg-white px-6 py-14 text-center text-sm text-gray-500 shadow-sm">
            <RefreshCw className="mx-auto mb-3 h-5 w-5 animate-spin text-gray-400" />
            Loading calibration workspace...
          </div>
        ) : activeTab === 'placement' ? (
          <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Story pages</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Select a story page or the cover, drag the live subject in the canvas, then render the draft view
                    with the current override.
                  </p>
                </div>
                <div className="grid gap-2 p-3">
                  {data.pages.map((page) => (
                    <button
                      key={page.storyPageNumber}
                      onClick={() => void handlePageSelect(page.storyPageNumber)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        page.storyPageNumber === selectedStoryPageNumber
                          ? 'border-cyan-300 bg-cyan-50'
                          : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">
                            {page.storyPageNumber === 0 ? 'Cover' : `Story page ${page.storyPageNumber}`}
                          </div>
                          <div className="mt-1 text-xs text-gray-500">
                            {page.pageLabel} • {page.editableAssetType === 'animal'
                              ? 'animal'
                              : page.editableAssetType === 'cover-character'
                                ? 'cover character'
                                : `pose ${page.poseNumber ?? 'N/A'}`}
                          </div>
                        </div>
                        <div className="rounded-full border border-gray-200 bg-white px-2 py-1 text-[11px] font-medium text-gray-600">
                          {page.storyPageNumber === 0 ? 'cover' : `p${String(page.pageNumber).padStart(2, '0')}`}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Placement controls</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Editing {data?.selectedPage?.editableAssetType ?? 'subject'} placement for the selected story page.
                  </p>
                </div>
                <div className="space-y-3 p-4">
                  <div className="grid gap-3 sm:grid-cols-2">
                    <label className="text-sm text-gray-700">
                      <div className="mb-1 font-medium">Left</div>
                      <input
                        type="number"
                        value={selectedPagePlacement?.left ?? ''}
                        onChange={(event) =>
                          applyPlacementPatch({ left: Number(event.target.value) || 0 })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <div className="mb-1 font-medium">Top</div>
                      <input
                        type="number"
                        value={selectedPagePlacement?.top ?? ''}
                        onChange={(event) =>
                          applyPlacementPatch({ top: Number(event.target.value) || 0 })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <div className="mb-1 font-medium">Width</div>
                      <input
                        type="number"
                        value={selectedPagePlacement?.width ?? ''}
                        onChange={(event) =>
                          applyPlacementPatch({
                            width: Math.max(1, Number(event.target.value) || 1),
                          })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:border-cyan-500"
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <div className="mb-1 font-medium">Rotate</div>
                      <input
                        type="number"
                        value={selectedPagePlacement?.rotateDeg ?? 0}
                        onChange={(event) =>
                          applyPlacementPatch({ rotateDeg: Number(event.target.value) || 0 })
                        }
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:border-cyan-500"
                      />
                    </label>
                  </div>

                  <div className="flex flex-wrap gap-2 pt-1">
                    <button
                      onClick={handleUseLegacyPlacement}
                      className="inline-flex items-center rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100"
                    >
                      <ArrowLeftRight className="mr-2 h-4 w-4" />
                      Use legacy
                    </button>
                    <button
                      onClick={handleResetCurrentPage}
                      className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      Reset page
                    </button>
                    <button
                      onClick={() => void handleCopyPlacement()}
                      className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                    >
                      <Copy className="mr-2 h-4 w-4" />
                      Copy page JSON
                    </button>
                  </div>

                  <label className="flex items-center gap-2 text-sm text-gray-700">
                    <input
                      type="checkbox"
                      checked={showLegacyGhost}
                      onChange={(event) => setShowLegacyGhost(event.target.checked)}
                      className="rounded border-gray-300 text-cyan-600 focus:ring-cyan-500"
                    />
                    Show legacy ghost overlay
                  </label>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Placement export</h2>
                </div>
                <div className="space-y-3 p-4">
                  <textarea
                    value={placementExportJson}
                    readOnly
                    className="min-h-[220px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 font-mono text-xs text-gray-800 shadow-inner outline-none"
                  />
                  <button
                    onClick={() => void handleCopyAllPlacements()}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy all overrides
                  </button>
                </div>
              </div>
            </div>

            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-5 py-4">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                    <div>
                      <h2 className="text-lg font-semibold text-gray-900">Interactive placement canvas</h2>
                      <p className="mt-1 text-sm text-gray-600">
                        Palette: neutral admin chrome, cyan for the editable draft, violet for the legacy reference.
                        Drag the current subject directly. Interior pages default to a bottom-center anchor; the cover
                        uses its own configured anchor.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 rounded-full border border-gray-200 bg-gray-50 px-3 py-2 text-xs font-medium text-gray-600">
                      <Grip className="h-4 w-4" />
                      {dragging ? 'Dragging draft placement' : `Drag the draft ${selectedPage?.editableAssetType ?? 'subject'}`}
                    </div>
                  </div>
                </div>
                <div className="p-5">
                  {selectedPage?.backgroundUrl && selectedPage?.editableAssetUrl && selectedPagePlacement ? (
                    <div
                      ref={previewCanvasRef}
                      onPointerMove={handlePlacementDragMove}
                      onPointerUp={handlePlacementDragEnd}
                      onPointerCancel={handlePlacementDragEnd}
                      className="relative mx-auto overflow-hidden rounded-[28px] border border-gray-200 bg-black/5 shadow-inner"
                      style={{
                        maxWidth: 780,
                        aspectRatio: `${selectedPageViewport.width} / ${selectedPageViewport.height}`,
                        touchAction: 'none',
                      }}
                    >
                      <img
                        src={selectedPage.backgroundUrl}
                        alt=""
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                      {selectedPage.overlayUrls.map((overlayUrl) => (
                        <img
                          key={overlayUrl}
                          src={overlayUrl}
                          alt=""
                          className="absolute inset-0 h-full w-full object-cover"
                        />
                      ))}

                      {showLegacyGhost && selectedLegacyPlacement && (
                        <div style={buildPlacementStyle(selectedLegacyPlacement, selectedPlacementBase, {
                          opacity: 0.2,
                          outline: '2px dashed rgba(139, 92, 246, 0.85)',
                          filter: 'grayscale(0.25)',
                          pointerEvents: 'none',
                        })}>
                          <img
                            src={selectedPage.editableAssetUrl}
                            alt=""
                            className="block h-auto w-full select-none object-contain"
                            draggable={false}
                          />
                        </div>
                      )}

                      <div
                        style={buildPlacementStyle(selectedPagePlacement, selectedPlacementBase, {
                          outline: '2px solid rgba(8, 145, 178, 0.8)',
                        })}
                        onPointerDown={handlePlacementDragStart}
                      >
                        <img
                          src={selectedPage.editableAssetUrl}
                          alt=""
                          className={`block h-auto w-full select-none object-contain drop-shadow-[0_12px_20px_rgba(15,23,42,0.18)] ${
                            dragging ? 'cursor-grabbing' : 'cursor-grab'
                          }`}
                          draggable={false}
                        />
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center text-sm text-gray-500">
                      Select a story page with an editable character or animal placement to use the placement editor.
                    </div>
                  )}
                </div>
              </div>

              <div className="grid gap-6 xl:grid-cols-2">
                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <div className="flex items-center justify-between gap-3">
                      <div>
                        <div className="text-sm font-semibold text-gray-900">Current draft render</div>
                        <div className="mt-1 text-xs text-gray-500">
                          Exact W3 HTML render for the currently loaded draft state.
                        </div>
                      </div>
                      <button
                        onClick={() => void handleRenderDraft()}
                        disabled={renderingDraft}
                        className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <RefreshCw className={`mr-2 h-4 w-4 ${renderingDraft ? 'animate-spin' : ''}`} />
                        Render draft
                      </button>
                    </div>
                  </div>
                  <div className="p-4">
                    {selectedPage?.currentSrcDoc ? (
                      <iframe
                        title="Current draft render"
                        srcDoc={selectedPage.currentSrcDoc}
                        className="w-full rounded-2xl border border-gray-200 bg-white"
                        style={{ aspectRatio: `${selectedPageViewport.width} / ${selectedPageViewport.height}` }}
                      />
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center text-sm text-gray-500">
                        No current render available for this page.
                      </div>
                    )}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                  <div className="border-b border-gray-200 px-4 py-3">
                    <div className="text-sm font-semibold text-gray-900">Legacy reference render</div>
                    <div className="mt-1 text-xs text-gray-500">
                      Same current subject, legacy-tuned placement. Use this as the visual target for Book 1 parity.
                    </div>
                  </div>
                  <div className="p-4">
                    {selectedPage?.legacySrcDoc ? (
                      <iframe
                        title="Legacy reference render"
                        srcDoc={selectedPage.legacySrcDoc}
                        className="w-full rounded-2xl border border-gray-200 bg-white"
                        style={{ aspectRatio: `${selectedPageViewport.width} / ${selectedPageViewport.height}` }}
                      />
                    ) : (
                      <div className="rounded-2xl border border-dashed border-gray-300 bg-gray-50 px-6 py-14 text-center text-sm text-gray-500">
                        No legacy reference render available for this page.
                      </div>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid gap-6 xl:grid-cols-[280px_1fr]">
            <div className="space-y-6">
              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Poses</h2>
                  <p className="mt-1 text-xs text-gray-500">
                    Diagnostics-only for now. Use this to mark better anchor targets without changing runtime behavior
                    yet.
                  </p>
                </div>
                <div className="grid gap-2 p-3">
                  {data.poses.map((pose) => (
                    <button
                      key={pose.poseNumber}
                      onClick={() => void handlePoseSelect(pose.poseNumber)}
                      className={`rounded-xl border px-3 py-3 text-left transition ${
                        pose.poseNumber === selectedPoseNumber
                          ? 'border-violet-300 bg-violet-50'
                          : 'border-gray-200 bg-gray-50 hover:border-gray-300'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <div>
                          <div className="text-sm font-semibold text-gray-900">Pose {pose.poseNumber}</div>
                          <div className="mt-1 text-xs text-gray-500">
                            story pages {pose.usedByStoryPages.join(', ') || 'N/A'}
                          </div>
                        </div>
                        <ImageIcon className="h-4 w-4 text-gray-400" />
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Anchor editor</h2>
                </div>
                <div className="space-y-3 p-4">
                  <div className="flex gap-2">
                    <button
                      onClick={() => setAnchorEditMode('ground')}
                      className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-medium ${
                        anchorEditMode === 'ground'
                          ? 'bg-cyan-600 text-white'
                          : 'border border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      <Crosshair className="mr-2 h-4 w-4" />
                      Set ground point
                    </button>
                    <button
                      onClick={() => setAnchorEditMode('head')}
                      className={`inline-flex items-center rounded-full px-3 py-2 text-sm font-medium ${
                        anchorEditMode === 'head'
                          ? 'bg-violet-600 text-white'
                          : 'border border-gray-300 bg-white text-gray-700'
                      }`}
                    >
                      <Ruler className="mr-2 h-4 w-4" />
                      Set head point
                    </button>
                  </div>

                  <div className="grid gap-3 sm:grid-cols-3">
                    <label className="text-sm text-gray-700">
                      <div className="mb-1 font-medium">groundContactY</div>
                      <input
                        type="number"
                        step="0.0001"
                        value={selectedAnchorDraft?.groundContactY ?? ''}
                        onChange={(event) => {
                          if (!selectedPoseNumber || !selectedAnchorDraft) return;
                          const nextValue = clampNumber(Number(event.target.value) || 0, 0, 1);
                          setAnchorDrafts((previous) => ({
                            ...previous,
                            [String(selectedPoseNumber)]: {
                              ...selectedAnchorDraft,
                              groundContactY: nextValue,
                            },
                          }));
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:border-violet-500"
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <div className="mb-1 font-medium">groundContactCenterX</div>
                      <input
                        type="number"
                        step="0.0001"
                        value={selectedAnchorDraft?.groundContactCenterX ?? ''}
                        onChange={(event) => {
                          if (!selectedPoseNumber || !selectedAnchorDraft) return;
                          const nextValue = clampNumber(Number(event.target.value) || 0, 0, 1);
                          setAnchorDrafts((previous) => ({
                            ...previous,
                            [String(selectedPoseNumber)]: {
                              ...selectedAnchorDraft,
                              groundContactCenterX: nextValue,
                            },
                          }));
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:border-violet-500"
                      />
                    </label>
                    <label className="text-sm text-gray-700">
                      <div className="mb-1 font-medium">headToFeetSpan</div>
                      <input
                        type="number"
                        step="0.0001"
                        value={selectedAnchorDraft?.headToFeetSpan ?? ''}
                        onChange={(event) => {
                          if (!selectedPoseNumber || !selectedAnchorDraft) return;
                          const nextValue = clampNumber(Number(event.target.value) || 0, 0.02, 1);
                          setAnchorDrafts((previous) => ({
                            ...previous,
                            [String(selectedPoseNumber)]: {
                              ...selectedAnchorDraft,
                              headToFeetSpan: nextValue,
                            },
                          }));
                        }}
                        className="w-full rounded-lg border border-gray-300 px-3 py-2 shadow-sm outline-none focus:border-violet-500"
                      />
                    </label>
                  </div>

                  <button
                    onClick={() => void handleCopyPoseAnchors()}
                    className="inline-flex items-center rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <Copy className="mr-2 h-4 w-4" />
                    Copy pose anchor JSON
                  </button>
                </div>
              </div>

              <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                <div className="border-b border-gray-200 px-4 py-3">
                  <h2 className="text-sm font-semibold text-gray-900">Pose anchor export</h2>
                </div>
                <div className="p-4">
                  <textarea
                    value={anchorExportJson}
                    readOnly
                    className="min-h-[220px] w-full rounded-xl border border-gray-200 bg-gray-50 px-3 py-3 font-mono text-xs text-gray-800 shadow-inner outline-none"
                  />
                </div>
              </div>
            </div>

            <div className="space-y-6">
              {selectedPose && selectedAnchorDraft && selectedPoseDiagnostics && !usesReferencePoseStandins ? (
                <>
                  <div className="grid gap-6 xl:grid-cols-2">
                    <CalibrationImagePanel
                      title="Generated cutout"
                      subtitle="Current pose sprite from 2B. Diagnostics are read-only here."
                      imageUrl={selectedPose.imageUrl}
                      canvas={selectedPose.inspection.sourceCanvas}
                      anchor={{
                        groundContactY:
                          selectedPoseDiagnostics.sourceAnchorMetrics.groundContactY,
                        groundContactCenterX:
                          selectedPoseDiagnostics.sourceAnchorMetrics.groundContactCenterX,
                        headToFeetSpan:
                          selectedPoseDiagnostics.sourceAnchorMetrics.headToFeetSpan,
                      }}
                      mode={anchorEditMode}
                    />
                    <CalibrationImagePanel
                      title="Reference pose"
                      subtitle="Click on this image to set the anchor target for this pose."
                      imageUrl={selectedPose.referenceUrl}
                      canvas={selectedPose.inspection.referenceCanvas}
                      anchor={selectedAnchorDraft}
                      mode={anchorEditMode}
                      onImageClick={(event) =>
                        handleAnchorImageClick(event, selectedPose.inspection.referenceCanvas)
                      }
                    />
                  </div>

                  <div className="grid gap-4 md:grid-cols-4">
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Scale delta
                      </div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">
                        {formatSignedPercent(selectedPoseDiagnostics.scaleFactor - 1)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Vertical drift
                      </div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">
                        {formatSignedPercent(selectedPoseDiagnostics.verticalOffset)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Horizontal drift
                      </div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">
                        {formatSignedPercent(selectedPoseDiagnostics.horizontalOffset)}
                      </div>
                    </div>
                    <div className="rounded-xl border border-gray-200 bg-white p-4 shadow-sm">
                      <div className="text-xs font-semibold uppercase tracking-[0.18em] text-gray-500">
                        Ground drift
                      </div>
                      <div className="mt-2 text-lg font-semibold text-gray-900">
                        {formatSignedPercent(selectedPoseDiagnostics.groundContactOffset)}
                      </div>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-gray-200 bg-white shadow-sm">
                    <div className="border-b border-gray-200 px-5 py-4">
                      <h2 className="text-lg font-semibold text-gray-900">Anchor metrics</h2>
                    </div>
                    <div className="grid gap-4 px-5 py-5 md:grid-cols-2">
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-3 text-sm font-semibold text-gray-900">Measured source metrics</div>
                        <dl className="space-y-2 text-sm text-gray-700">
                          <div className="flex justify-between gap-3">
                            <dt>groundContactY</dt>
                            <dd>{formatRatio(selectedPoseDiagnostics.sourceAnchorMetrics.groundContactY)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt>groundContactCenterX</dt>
                            <dd>{formatRatio(selectedPoseDiagnostics.sourceAnchorMetrics.groundContactCenterX)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt>headToFeetSpan</dt>
                            <dd>{formatRatio(selectedPoseDiagnostics.sourceAnchorMetrics.headToFeetSpan)}</dd>
                          </div>
                        </dl>
                      </div>
                      <div className="rounded-xl border border-gray-200 bg-gray-50 p-4">
                        <div className="mb-3 text-sm font-semibold text-gray-900">Draft reference target</div>
                        <dl className="space-y-2 text-sm text-gray-700">
                          <div className="flex justify-between gap-3">
                            <dt>groundContactY</dt>
                            <dd>{formatRatio(selectedAnchorDraft.groundContactY)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt>groundContactCenterX</dt>
                            <dd>{formatRatio(selectedAnchorDraft.groundContactCenterX)}</dd>
                          </div>
                          <div className="flex justify-between gap-3">
                            <dt>headToFeetSpan</dt>
                            <dd>{formatRatio(selectedAnchorDraft.headToFeetSpan)}</dd>
                          </div>
                        </dl>
                      </div>
                    </div>
                  </div>
                </>
              ) : selectedPose && selectedAnchorDraft && usesReferencePoseStandins ? (
                <div className="space-y-6">
                  <div className="rounded-2xl border border-blue-200 bg-blue-50 px-6 py-5 text-sm text-blue-900 shadow-sm">
                    Fixture replay does not have a real generated cutout for this pose. You can still draft anchor
                    targets against the reference pose here, but load a live order if you want real source-vs-reference
                    drift metrics.
                  </div>

                  <CalibrationImagePanel
                    title="Reference pose"
                    subtitle="Click on this image to set the anchor target for this pose."
                    imageUrl={selectedPose.referenceUrl}
                    canvas={selectedPose.inspection?.referenceCanvas ?? { width: 1, height: 1 }}
                    anchor={selectedAnchorDraft}
                    mode={anchorEditMode}
                    onImageClick={(event) =>
                      handleAnchorImageClick(
                        event,
                        selectedPose.inspection?.referenceCanvas ?? { width: 1, height: 1 },
                      )
                    }
                  />
                </div>
              ) : selectedPose?.inspectionError ? (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-6 py-14 text-center text-sm text-amber-900 shadow-sm">
                  Pose diagnostics are unavailable for this selection: {selectedPose.inspectionError}
                </div>
              ) : (
                <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-6 py-14 text-center text-sm text-gray-500 shadow-sm">
                  Select a pose to inspect its current normalization diagnostics and draft a better anchor target.
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
