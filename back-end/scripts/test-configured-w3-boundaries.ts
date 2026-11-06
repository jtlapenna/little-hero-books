import { buildBgRemovedPoseAssetKey } from '../src/lib/order-paths';
import assert from "node:assert/strict";
import { configuredBookFixture, configuredBookRaw } from "./configured-book-fixture";
import { BookConfigSchema } from "../src/lib/books/types";
import { normalizeW0Manifest } from "../src/lib/books/normalize-w0-manifest";
import { buildW4PrintInput } from "../src/lib/books/w4-print-input";
import { buildW0RunManifestFromConfig } from "../src/lib/books/build-run-manifest";
import { buildW3AssemblyInput } from "../src/lib/books/w3-assembly-input";
import { buildW3Manifest } from "../src/lib/books/w3-manifest";
import { publishW3Manifest } from "../src/lib/workers/w3-manifest-publish";
import {
  claimAndStartW3AssemblyJob,
  type W3AssemblyJobRepository,
} from "../src/lib/workflow-jobs/w3-assembly-jobs";

async function main() {
  const failed: string[] = [];
  const check = async (name: string, action: () => Promise<void>) => {
    try {
      await action();
      console.log("PASS", name);
    } catch (error) {
      failed.push(name);
      console.error("FAIL", name, String(error));
    }
  };
  const config = configuredBookFixture(),
    orderId = "TEST-W3-BOUNDARY";
  const w0 = buildW0RunManifestFromConfig(config, {
    orderId,
    platform: "d2c",
    characterHash: "testhash",
    input: {
      bookSpecs: { testMode: true },
      characterSpecs: { childName: "Ada", animalGuide: "owl" },
    },
  });
  const oneManifestKey = `${config.bookId}/orders/${orderId}/manifests/1-manifest.json`,
    manifest2bKey = `${config.bookId}/orders/${orderId}/manifests/2b-manifest.json`;
  const twoB = {
    characterHash: "testhash",
    order: { orderId, bookId: config.bookId },
    entries: [13, 17, 18].map((poseNumber) => ({
      poseNumber,
      bgRemovedKey: buildBgRemovedPoseAssetKey('testhash', poseNumber, config.bookId),
    })),
  };
  const loadManifest = async (key: string) =>
    key === oneManifestKey ? w0 : key === manifest2bKey ? twoB : null;
  const assembly = await buildW3AssemblyInput(
    {
      orderId,
      bookId: config.bookId,
      oneManifestKey,
      manifest2bKey,
      testMode: true,
      bookSpecs: {},
    },
    { loadManifest },
  );
  const artifacts: Record<string, unknown> = {
    ...assembly,
    pagePreviewImages: assembly.pagePlan.map((page) => ({
      pageNumber: page.index,
      r2Key: `${config.bookId}/orders/${orderId}/preview-images/${page.label}.png`,
    })),
    coverPngR2Key: `${config.bookId}/orders/${orderId}/preview-images/cover-spread.png`,
  };
  delete artifacts.testMode;
  delete artifacts.testModePages;
  await check(
    "frozen test marker survives caller bookSpecs override",
    async () => {
      assert.equal(
        (buildW3Manifest(artifacts).manifest.summary as Record<string, unknown>)
          .readyForBook,
        false,
      );
    },
  );
  await check(
    "missing configured snapshot rejects before effects",
    async () => {
      const lost: Record<string, unknown> = {
        ...artifacts,
        bookStatus: "draft",
        testOnly: true,
        bookSpecs: { testMode: true },
      };
      delete lost.renderSnapshot;
      let effects = 0;
      await assert.rejects(
        () =>
          publishW3Manifest(lost, {
            putObjectImpl: async () => {
              effects++;
            },
            invalidateReviewImpl: async () => {},
          getOrderImpl: async () => null,
            updateOrderImpl: async () => {
              effects++;
              return true;
            },
          }),
        /snapshot|provenance/i,
      );
      assert.equal(effects, 0);
      assert.throws(
        () =>
          buildW3Manifest({
            orderId,
            bookId: "unknown-book",
            pagePreviewImages: [],
          }),
        /snapshot|provenance|intake/i,
      );
    },
  );
  await check("explicit malformed snapshots reject before publication", async () => {
    for (const renderSnapshot of [null, false, {}, ""]) {
      let effects = 0;
      await assert.rejects(() => publishW3Manifest({ orderId, bookId: "book-mvp-simple-adventure", renderSnapshot, bookStatus: "draft", renderingSchema: "lhb.book-render@v1", testOnly: true, bookSpecs: { testMode: true }, pagePreviewImages: [] }, {
        putObjectImpl: async () => { effects++; }, invalidateReviewImpl: async () => {},
          getOrderImpl: async () => null,
        updateOrderImpl: async () => { effects++; return true; },
      }));
      assert.equal(effects, 0);
    }
  });
  await check("unfinished flow cannot publish or change an order", async () => {
    const raw = configuredBookRaw();
    raw.rendering.recipe.schema = 'lhb.book-render@v2';
    raw.rendering.recipe.copy.title = { id: 'headline', text: '[Child Name] flies.',
      placement: { left: 0, top: 0, width: 500, height: 200 }, fontSize: 50,
      flow: { paragraphs: [{ runs: [{ text: '[Child Name] flies.' }] }] } };
    const flowConfig = BookConfigSchema.parse(raw);
    const flowW0 = buildW0RunManifestFromConfig(flowConfig, { orderId, platform: 'd2c', characterHash: 'testhash',
      input: { characterSpecs: { childName: 'Ada', animalGuide: 'owl' } } });
    const flowSnapshot = normalizeW0Manifest(JSON.parse(JSON.stringify(flowW0))).renderSnapshot;
    const flowW3 = buildW3Manifest({ ...artifacts, renderSnapshot: flowSnapshot }).manifest;
    const prefix = `${flowConfig.bookId}/orders/${orderId}`;
    for (const savedW3 of [flowW3, { ...flowW3, summary: { readyForBook: true } }]) {
      await assert.rejects(() => buildW4PrintInput({ orderId, bookId: flowConfig.bookId,
        manifest3Key: `${prefix}/manifests/3-manifest.json`, body: { summary: { readyForBook: true } } }, {
        loadManifest: async key => key.endsWith('/1-manifest.json') ? flowW0 : key.endsWith('/3-manifest.json') ? savedW3 : null,
      }), /flow layout fit is not yet verified/i);
    }
    await assert.rejects(() => buildW4PrintInput({ orderId, bookId: flowConfig.bookId,
      manifest3Key: `${prefix}/manifests/3-manifest.json` }, {
      loadManifest: async key => key.endsWith('/3-manifest.json') ? { ...flowW3, summary: { readyForBook: true } } : null,
    }), /flow layout fit is not yet verified/i, 'Missing W0 cannot hide a v2 W3 snapshot');
    let effects = 0;
    await assert.rejects(() => publishW3Manifest({ ...artifacts, renderSnapshot: flowSnapshot }, {
      putObjectImpl: async () => { effects++; }, getOrderImpl: async () => { effects++; return null; },
      updateOrderImpl: async () => { effects++; return true; },
    }), /Flow publication is not yet available/);
    assert.equal(effects, 0);
  });
  await check(
    "queued W3 retains explicit intake and frozen identity",
    async () => {
      let snapshot: Record<string, unknown> | undefined;
      const job = {
        id: 123,
        status: "queued",
        job_type: "w3-book-assembly",
        stage: "3",
        order_id: orderId,
        idempotency_key: "fixture",
      };
      const repository = {
        listWorkflowJobsForOrder: async () => [],
        getWorkflowJobByIdempotencyKey: async () => null,
        enqueueWorkflowJob: async (payload: {
          normalizedInputSnapshot: Record<string, unknown>;
        }) => {
          snapshot = payload.normalizedInputSnapshot;
          return job;
        },
        appendWorkflowJobEvent: async () => {},
        claimWorkflowJob: async () => null,
        getWorkflowJobById: async () => job,
        getLatestWorkflowJobAttemptForJob: async () => null,
      } as unknown as W3AssemblyJobRepository;
      await claimAndStartW3AssemblyJob(
        { ...assembly, testModePages: [0, 2] },
        {},
        repository,
      );
      assert.equal(snapshot!.oneManifestKey, oneManifestKey);
      assert.ok(snapshot!.renderSnapshot);
      assert.equal(snapshot!.configVersion, 1);
      const replay = await buildW3AssemblyInput(snapshot!, { loadManifest });
      assert.deepEqual(replay.testModePages, [0, 2]);
      assert.ok(replay.renderSnapshot);
    },
  );
  assert.deepEqual(failed, []);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
