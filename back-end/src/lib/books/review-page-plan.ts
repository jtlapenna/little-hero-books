import { resolvePagePlan } from '@/lib/books/resolve-page-plan';
import type { BookConfig, BookPageConfig, BookPageType } from '@/lib/books/types';
import type { NormalizedW0Manifest } from '@/lib/books/normalize-w0-manifest';
import { buildLegacyBookPagePlan } from '@/lib/books/legacy-page-plan';

export interface ReviewPageContext {
  bookId: string | null;
  formatId: string | null;
  pagePlan: BookPageConfig[];
  pageLabels: string[];
  pagePlanSource: 'w0-v3' | 'runtime-config' | 'legacy-default';
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

export interface W2APoseWorkItem {
  poseNumber: number;
  currentPoseNumber: number;
  index: number;
  pageIndex: number | null;
  pageLabel: string | null;
  pageType: BookPageType | null;
  storyPageNumber: number | null;
  backgroundSlot: string | null;
}

export function buildLegacyReviewPagePlan(useAmazonPlan: boolean): BookPageConfig[] {
  return buildLegacyBookPagePlan(useAmazonPlan);
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

export function resolveReviewPageContextFromConfig(
  config: BookConfig,
  formatId?: string | null,
): ReviewPageContext {
  const resolvedPlan = resolvePagePlan(config, formatId ?? undefined);

  return {
    bookId: config.bookId,
    formatId: formatId ?? null,
    pagePlan: resolvedPlan.pagePlan,
    pageLabels: resolvedPlan.pageLabels,
    pagePlanSource: 'runtime-config',
    expectedPageCount: resolvedPlan.expectedPageCount,
  };
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
    bookId: options.bookId ?? snapshot?.bookId ?? null,
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

export function buildW2APoseWorklist(
  pagePlan: BookPageConfig[],
  options: { includeZeroPose?: boolean } = {},
): W2APoseWorkItem[] {
  const includeZeroPose = options.includeZeroPose ?? true;
  const assignments = buildReviewPoseAssignments(pagePlan);
  const worklist: W2APoseWorkItem[] = [];

  if (includeZeroPose && !assignments.some((assignment) => assignment.poseNumber === 0)) {
    worklist.push({
      poseNumber: 0,
      currentPoseNumber: 0,
      index: 0,
      pageIndex: null,
      pageLabel: null,
      pageType: null,
      storyPageNumber: null,
      backgroundSlot: null,
    });
  }

  for (const assignment of assignments) {
    worklist.push({
      poseNumber: assignment.poseNumber,
      currentPoseNumber: assignment.poseNumber,
      index: includeZeroPose ? assignment.poseNumber : worklist.length,
      pageIndex: assignment.pageIndex,
      pageLabel: assignment.pageLabel,
      pageType: assignment.pageType,
      storyPageNumber: assignment.storyPageNumber,
      backgroundSlot: assignment.backgroundSlot,
    });
  }

  return worklist;
}
