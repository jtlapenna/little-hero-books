#!/usr/bin/env tsx

import { buildW2APoseInput, loadBundledBookConfig } from "@/lib/books";
import { buildW2APoseInputResponse } from "@/app/api/internal/w2a/build-pose-input/route";
import { resolveW2APoseWorklistResponse } from "@/app/api/internal/w2a/resolve-pose-worklist/route";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

async function main(): Promise<void> {
  const loadConfig = async ({
    bookId,
    version,
  }: {
    bookId: string;
    version?: number;
  }) => loadBundledBookConfig({ bookId, version });

  const bookTwoBuilt = await buildW2APoseInput(
    {
      orderId: "FIXTURE-BOOK2-POSE-001",
      rootOrderId: "ROOT-BOOK2-POSE-001",
      characterHash: "fixturebook2posehash",
      poseNumber: 7,
      oneManifestUrl:
        "https://admin.littleherolabs.com/api/manifests/book-2-example/orders/FIXTURE-BOOK2-POSE-001/manifests/1-manifest.json",
      publicR2Url: "https://pub.example.r2.dev",
      testMode: true,
      retryAttempt: 1,
      retryTag: "FIRST-FIX",
      pageLabel: "p08",
      pageType: "story",
      storyPageNumber: 8,
      backgroundSlot: "story_08",
      characterSpecs: {
        childName: "Nova",
        favoriteAnimal: "fox",
        hairStyle: "curly crop",
        hairColor: "light brown",
        skinTone: "deep",
        pronouns: "she/her",
        favoriteColor: "blue",
      },
    },
    { loadConfig },
  );

  assert(
    bookTwoBuilt.bookId === "book-2-example",
    "Expected bookId to resolve from the 1-manifest hint",
  );
  assert(
    bookTwoBuilt.orderPrefix === "book-2-example/orders/FIXTURE-BOOK2-POSE-001",
    "Expected orderPrefix to resolve under the Book 2 order root",
  );
  assert(
    bookTwoBuilt.baseCharacterKey ===
      "book-2-example/order-generated-assets/characters/fixturebook2posehash/base-character.png",
    "Expected baseCharacterKey to use the Book 2 generated-assets root",
  );
  assert(
    bookTwoBuilt.poseRefKey ===
      "book-2-example/characters/poses/skin-deep/pose07.png",
    "Expected poseRefKey to use the Book 2 deep-skin pose variant path",
  );
  assert(
    bookTwoBuilt.hairRefS3Key ===
      "book-2-example/characters/hairstyles/curly-crop-light-brown.jpg",
    "Expected hairRefS3Key to resolve under the Book 2 hairstyle prefix",
  );
  assert(
    bookTwoBuilt.uploadKey ===
      "book-2-example/order-generated-assets/characters/fixturebook2posehash/poses/pose07_r1.png",
    "Expected retry-aware uploadKey to stay inside the Book 2 character root",
  );
  assert(
    bookTwoBuilt.clothingTypeCanonical === "dress" &&
      bookTwoBuilt.posePromptBlock.includes("BASE") &&
      bookTwoBuilt.posePromptBlock.includes("POSE") &&
      bookTwoBuilt.posePromptBlock.includes("HAIR CHIP"),
    "Expected repo-owned prompt construction to emit the core BASE/POSE/HAIR contract",
  );
  assert(
    bookTwoBuilt.correlationId ===
      "FIXTURE-BOOK2-POSE-001-fixturebook2pose-POSE07-R1-FIRST-FIX",
    "Expected correlationId to be deterministic for the pose/retry tuple",
  );
  assert(
    bookTwoBuilt.testMode === true &&
      bookTwoBuilt.rootOrderId === "ROOT-BOOK2-POSE-001" &&
      bookTwoBuilt.amazonOrderId === "ROOT-BOOK2-POSE-001",
    "Expected testMode and sibling-safe identity fields to be preserved",
  );

  const minimalBuilt = await buildW2APoseInput(
    {
      orderId: "FIXTURE-W2A-DEFAULT-001",
      characterHash: "defaultposehash001",
      poseNumber: 1,
      characterSpecs: {
        childName: "Ada",
        hairStyle: "side part",
        hairColor: "black",
        pronouns: "he/him",
      },
    },
    { loadConfig },
  );

  assert(
    minimalBuilt.bookId === "book-mvp-simple-adventure" &&
      minimalBuilt.orderPrefix ===
        "book-mvp-simple-adventure/orders/FIXTURE-W2A-DEFAULT-001",
    "Expected minimal payloads to fall back to the default Book 1 order root",
  );
  assert(
    minimalBuilt.poseRefKey ===
      "book-mvp-simple-adventure/characters/poses/pose01.png",
    "Expected minimal payloads to derive the default Book 1 pose reference key",
  );

  const routeResponse = await buildW2APoseInputResponse(
    {
      orderId: "FIXTURE-W2A-ROUTE-001",
      characterHash: "routeposehash001",
      poseNumber: 3,
      bookId: "book-2-example",
      characterSpecs: {
        childName: "Iris",
        hairStyle: "bun",
        hairColor: "auburn",
        pronouns: "she/her",
      },
    },
    {
      defaultBackendUrl: "https://preview-admin.example",
      instrumentPoseJob: async () => ({
        workflowJobId: 204,
        workflowJobIdempotencyKey:
          "wf:2a:w2a-single-pose:FIXTURE-W2A-ROUTE-001:pose-03:stub",
        workflowJobStatus: "running",
        workflowAttemptId: 1,
        workflowAttempt: 1,
        workflowClaimed: true,
        workflowReplay: null,
      }),
    },
  );

  assert(
    routeResponse.success === true &&
      routeResponse.bookId === "book-2-example" &&
      routeResponse.uploadKey.includes(
        "book-2-example/order-generated-assets",
      ) &&
      routeResponse.backendUrl === "https://preview-admin.example" &&
      routeResponse.workflowJobId === 204 &&
      routeResponse.workflowAttemptId === 1,
    "Expected route response builder to wrap the canonical W2A pose input payload",
  );

  const worklistResponse = await resolveW2APoseWorklistResponse(
    {
      orderId: "FIXTURE-W2A-WORKLIST-001",
      rootOrderId: "ROOT-W2A-WORKLIST-001",
      amazonOrderId: "ROOT-W2A-WORKLIST-001",
      bookId: "book-2-example",
      formatId: "standard",
      configSource: "bundled",
      includeZeroPose: false,
      backendUrl: "https://preview-admin.example",
    },
    {
      loadBookConfig: loadConfig,
      instrumentPoseWorkItems: async (payload) =>
        payload.poseWorklist.map((item, index) => ({
          ...item,
          workflowJobId: 500 + index,
          workflowJobIdempotencyKey: `wf:2a:w2a-single-pose:${payload.orderId}:pose-${String(item.poseNumber).padStart(2, "0")}:stub`,
          workflowJobStatus: "queued",
          workflowAttemptId: null,
          workflowAttempt: null,
          workflowClaimed: false,
          workflowReplay: null,
        })),
    },
  );

  assert(
    worklistResponse.success === true &&
      worklistResponse.bookId === "book-2-example" &&
      Array.isArray(worklistResponse.poseWorklist) &&
      worklistResponse.poseWorklist.length > 0 &&
      worklistResponse.poseWorklist[0]?.workflowJobId === 500 &&
      worklistResponse.poseWorklist[0]?.backendUrl ===
        "https://preview-admin.example",
    "Expected W2A resolve-pose-worklist to preserve repo worklist context and attach workflow job fields",
  );

  const retryCompatBuilt = await buildW2APoseInput(
    {
      orderId: "",
      amazonOrderId: "",
      correlationId: "TEST-ORDER-016-99fc097781e57ed7-STYLE00",
      characterHash: "99fc097781e57ed7",
      poseNumber: 1,
      currentPoseNumber: 1,
      poseNN: "pose00",
      poseNN_plain: "pose01",
      poseNN_hyphen: "pose-01",
      generatedFileName: "characters_99fc097781e57ed7_pose00.png",
      assetsRoot: "book-mvp-simple-adventure/order-generated-assets",
      publicR2Url: "https://pub.example.r2.dev",
      qaPass: false,
      retryAttempt: 1,
      __meta: {
        deriveQaPass: {
          snapshot: {
            orderId: "TEST-ORDER-016",
            rootOrderId: "TEST-ORDER-016",
            amazonOrderId: "TEST-ORDER-016",
            poseIndex: -1,
            expectedPoseNumber: 0,
          },
        },
      },
      characterSpecs: {
        childName: "Stephanie",
        hairStyle: "side part",
        hairColor: "black",
        pronouns: "he/him",
      },
    },
    { loadConfig },
  );

  assert(
    retryCompatBuilt.orderId === "TEST-ORDER-016" &&
      retryCompatBuilt.rootOrderId === "TEST-ORDER-016" &&
      retryCompatBuilt.amazonOrderId === "TEST-ORDER-016",
    "Expected W2A pose input to recover order identifiers from legacy retry snapshots",
  );
  assert(
    retryCompatBuilt.poseNumber === 1 &&
      retryCompatBuilt.correlationId ===
        "TEST-ORDER-016-99fc097781e57ed7-STYLE00",
    "Expected W2A pose input to preserve retry pose identity and correlation ids",
  );
  assert(
    retryCompatBuilt.publicR2Url === "https://pub.example.r2.dev" &&
      retryCompatBuilt.baseRefPublicUrl ===
        "https://pub.example.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/99fc097781e57ed7/base-character.png",
    "Expected W2A pose input to normalize malformed retry publicR2Url values before building asset URLs",
  );

  const retryCompatBackendBuilt = await buildW2APoseInput(
    {
      orderId: "",
      amazonOrderId: "",
      correlationId: "TEST-ORDER-016-99fc097781e57ed7-STYLE05",
      characterHash: "99fc097781e57ed7",
      poseNumber: 5,
      currentPoseNumber: 5,
      publicR2Url: "https:/pub.example.r2.dev",
      __meta: {
        deriveQaPass: {
          snapshot: {
            orderId: "TEST-ORDER-016",
            rootOrderId: "TEST-ORDER-016",
            amazonOrderId: "TEST-ORDER-016",
            backendUrl: "http://localhost:3001",
            expectedPoseNumber: 5,
          },
        },
      },
      characterSpecs: {
        childName: "Stephanie",
        hairStyle: "side part",
        hairColor: "black",
        pronouns: "he/him",
      },
    },
    { loadConfig, defaultBackendUrl: "https://preview-admin.example" },
  );

  assert(
    retryCompatBackendBuilt.backendUrl === "https://preview-admin.example",
    "Expected W2A pose input to ignore localhost retry backendUrl values when selecting the normalized backendUrl",
  );
  assert(
    retryCompatBackendBuilt.publicR2Url === "https://pub.example.r2.dev",
    "Expected W2A pose input to continue normalizing malformed retry publicR2Url values in backendUrl regression cases",
  );

  const replayResponse = await buildW2APoseInputResponse(
    {
      orderId: "FIXTURE-W2A-REPLAY-001",
      rootOrderId: "FIXTURE-W2A-REPLAY-001",
      amazonOrderId: "FIXTURE-W2A-REPLAY-001",
      characterHash: "replayposehash001",
      poseNumber: 2,
      publicR2Url: "https://pub.example.r2.dev",
      characterSpecs: {
        childName: "Milo",
        hairStyle: "short crop",
        hairColor: "black",
        pronouns: "he/him",
      },
    },
    {
      defaultBackendUrl: "https://preview-admin.example",
      instrumentPoseJob: async () => ({
        workflowJobId: 205,
        workflowJobIdempotencyKey:
          "wf:2a:w2a-single-pose:FIXTURE-W2A-REPLAY-001:pose-02:stub",
        workflowJobStatus: "succeeded",
        workflowAttemptId: null,
        workflowAttempt: null,
        workflowClaimed: false,
        workflowReplay: {
          mode: "reuse-succeeded-pose",
          sourceStatus: "succeeded",
          uploadKey:
            "book-mvp-simple-adventure/order-generated-assets/characters/replayposehash001/poses/pose02.png",
          generatedFileName: "pose02.png",
          fileSize: 4096,
          correlationId: "FIXTURE-W2A-REPLAY-001-replayposehash001-POSE02",
          poseRefKey:
            "book-mvp-simple-adventure/characters/poses/pose02.png",
          baseCharacterKey:
            "book-mvp-simple-adventure/order-generated-assets/characters/replayposehash001/base-character.png",
        },
      }),
    },
  );

  assert(
    replayResponse.workflowReplayReady === true &&
      replayResponse.workflowReplayMode === "reuse-succeeded-pose" &&
      replayResponse.workflowReplaySource === "succeeded" &&
      replayResponse.storageKey ===
        "book-mvp-simple-adventure/order-generated-assets/characters/replayposehash001/poses/pose02.png" &&
      replayResponse.generatedPublicUrl ===
        "https://pub.example.r2.dev/book-mvp-simple-adventure/order-generated-assets/characters/replayposehash001/poses/pose02.png" &&
      replayResponse.generatedUrl === replayResponse.generatedPublicUrl &&
      replayResponse.fileUrl === replayResponse.generatedPublicUrl &&
      replayResponse.generatedImage?.mimeType === "image/png" &&
      replayResponse.generatedImage?.size === 4096,
    "Expected W2A pose-input route to emit replay-ready artifact URLs for already-succeeded pose jobs",
  );

  console.log(
    JSON.stringify(
      {
        ok: true,
        bookTwoOrderPrefix: bookTwoBuilt.orderPrefix,
        defaultOrderPrefix: minimalBuilt.orderPrefix,
        bookTwoUploadKey: bookTwoBuilt.uploadKey,
        worklistPoseCount: worklistResponse.poseWorklist.length,
        retryCompatOrderId: retryCompatBuilt.orderId,
        retryCompatBackendUrl: retryCompatBackendBuilt.backendUrl,
        replayStorageKey: replayResponse.storageKey,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
