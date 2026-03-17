import type { BookPageConfig, BookPageType } from '@/lib/books/types';
import type { NormalizedW0Manifest } from '@/lib/books/normalize-w0-manifest';

export interface ReviewPageContext {
  bookId: string | null;
  formatId: string | null;
  pagePlan: BookPageConfig[];
  pageLabels: string[];
  pagePlanSource: 'w0-v3' | 'legacy-default';
  expectedPageCount: number;
}

export interface ReviewPoseAssignment {
  poseNumber: number;
  pageIndex: number;
  pageLabel: string;
  pageType: BookPageType;
  storyPageNumber: number | null;
  backgroundSlot: string | null;
}

function buildLegacyStoryPages(startIndex: number): BookPageConfig[] {
  const storyToPoseMap: Record<number, number | null> = {
    1: 1,
    2: 2,
    3: 3,
    4: 4,
    5: 5,
    6: 6,
    7: null,
    8: 7,
    9: 8,
    10: 9,
    11: 10,
    12: 11,
    13: null,
    14: 12,
  };

  return Array.from({ length: 14 }, (_, index) => {
    const storyPageNumber = index + 1;
    const pageIndex = startIndex + index;
    const pageId = `story_${String(storyPageNumber).padStart(2, '0')}`;

    return {
      index: pageIndex,
      id: pageId,
      label: `p${String(pageIndex).padStart(2, '0')}`,
      type: 'story',
      storyPageNumber,
      backgroundSlot: pageId,
      poseNumber: storyToPoseMap[storyPageNumber],
      overlaySlot: storyPageNumber === 5 ? 'animalTracks' : null,
      required: true,
    };
  });
}

export function buildLegacyReviewPagePlan(useAmazonPlan: boolean): BookPageConfig[] {
  const storyPages = buildLegacyStoryPages(useAmazonPlan ? 3 : 1);

  if (!useAmazonPlan) {
    return [
      {
        index: 0,
        id: 'dedication',
        label: 'p00',
        type: 'dedication',
        storyPageNumber: null,
        backgroundSlot: 'dedication',
        poseNumber: null,
        overlaySlot: null,
        required: true,
      },
      ...storyPages,
    ];
  }

  return [
    {
      index: 0,
      id: 'title',
      label: 'p00',
      type: 'title',
      storyPageNumber: null,
      backgroundSlot: 'titlePage',
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    {
      index: 1,
      id: 'blank_front_matter',
      label: 'p01',
      type: 'blank',
      storyPageNumber: null,
      backgroundSlot: null,
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    {
      index: 2,
      id: 'dedication',
      label: 'p02',
      type: 'dedication',
      storyPageNumber: null,
      backgroundSlot: 'dedication',
      poseNumber: null,
      overlaySlot: null,
      required: true,
    },
    ...storyPages,
  ];
}

export function normalizeManifestPageLabel(value: unknown): string | null {
  if (typeof value !== 'string') {
    return null;
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const match = /^(p\d{2,})/i.exec(trimmed);
  if (!match) {
    return trimmed;
  }

  return match[1].toLowerCase();
}

export function resolveReviewPageContext(options: {
  snapshot?: NormalizedW0Manifest | null;
  bookId?: string | null;
  formatId?: string | null;
  isAmazonOrder?: boolean;
}): ReviewPageContext {
  const snapshot = options.snapshot ?? null;
  if (snapshot?.pagePlan.length) {
    return {
      bookId: snapshot.bookId ?? options.bookId ?? null,
      formatId: snapshot.formatId ?? options.formatId ?? null,
      pagePlan: [...snapshot.pagePlan].sort((left, right) => left.index - right.index),
      pageLabels:
        snapshot.pageLabels.length > 0
          ? [...snapshot.pageLabels]
          : snapshot.pagePlan.map((page) => page.label),
      pagePlanSource: 'w0-v3',
      expectedPageCount: snapshot.pagePlan.length,
    };
  }

  const formatId =
    options.formatId ?? (options.isAmazonOrder ? 'amazon' : 'standard');
  const useAmazonPlan = formatId === 'amazon';
  const pagePlan = buildLegacyReviewPagePlan(useAmazonPlan);

  return {
    bookId: options.bookId ?? snapshot?.bookId ?? 'book-mvp-simple-adventure',
    formatId,
    pagePlan,
    pageLabels: pagePlan.map((page) => page.label),
    pagePlanSource: 'legacy-default',
    expectedPageCount: pagePlan.length,
  };
}

export function buildReviewPoseAssignments(
  pagePlan: BookPageConfig[],
): ReviewPoseAssignment[] {
  const sortedPlan = [...pagePlan].sort((left, right) => left.index - right.index);
  const assignmentByPose = new Map<number, ReviewPoseAssignment>();

  for (const page of sortedPlan) {
    if (page.poseNumber === null || page.poseNumber === undefined) {
      continue;
    }

    if (assignmentByPose.has(page.poseNumber)) {
      continue;
    }

    assignmentByPose.set(page.poseNumber, {
      poseNumber: page.poseNumber,
      pageIndex: page.index,
      pageLabel: page.label,
      pageType: page.type,
      storyPageNumber: page.storyPageNumber,
      backgroundSlot: page.backgroundSlot,
    });
  }

  return Array.from(assignmentByPose.values()).sort(
    (left, right) => left.poseNumber - right.poseNumber,
  );
}
