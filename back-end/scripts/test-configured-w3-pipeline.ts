import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { configuredBookFixture } from "./configured-book-fixture";
import { buildW0RunManifestFromConfig } from "../src/lib/books/build-run-manifest";
import { buildW3AssemblyInput } from "../src/lib/books/w3-assembly-input";
import { buildW3PreviewPlan } from "../src/lib/books/w3-preview-plan";
import {
  prepareW3AssemblyRun,
  collectW3PreviewImages,
} from "../src/lib/workers/w3-assembly-worker";
import { buildW3Manifest } from "../src/lib/books/w3-manifest";
import { publishW3Manifest } from "../src/lib/workers/w3-manifest-publish";
import { buildW4PrintInput } from "../src/lib/books/w4-print-input";

async function main() {
  const config = configuredBookFixture();
  config.status = "draft";
  for (const format of Object.values(config.formats)) {
    const title = format.interior.pageSequence[0],
      scene = format.interior.pageSequence[1];
    format.interior.expectedPageCount = 32;
    format.interior.pageSequence = Array.from({ length: 32 }, (_, index) =>
      index === 0
        ? title
        : {
            ...scene,
            index,
            id: `scene-${index}`,
            label: `p${String(index).padStart(2, "0")}`,
            storyPageNumber: index,
          },
    );
  }
  for (let index = 1; index < 32; index++)
    config.rendering.recipe!.copy[`scene-${index}`] =
      config.rendering.recipe!.copy["scene-a"];
  const orderId = "TEST-CONFIGURED-W3-32";
  assert.throws(
    () => buildW0RunManifestFromConfig(config, { orderId, platform: "d2c" }),
    /testMode/,
  );
  const workflow = JSON.parse(
    readFileSync(
      "../docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json",
      "utf8",
    ),
  ) as { nodes: { name: string; parameters: { jsCode?: string } }[] };
  const code = (name: string) =>
    workflow.nodes.find((node) => node.name === name)!.parameters.jsCode!;
  const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
  for (const formatId of ["standard", "amazon"]) {
    const w0 = buildW0RunManifestFromConfig(config, {
      orderId,
      platform: formatId === "amazon" ? "amazon" : "d2c",
      formatId,
      characterHash: "testhash",
      input: {
        characterSpecs: { childName: "Ada", animalGuide: "owl" },
        bookSpecs: { testMode: true },
      },
    });
    const twoB = {
      characterHash: "testhash",
      order: { orderId, bookId: config.bookId },
      entries: [13, 17, 18].map((poseNumber) => ({
        poseNumber,
        bgRemovedKey: `${config.bookId}/generated/pose${poseNumber}.png`,
      })),
    };
    for (const selector of [0, 2, [0, 13, 31]]) {
      const assembly = await buildW3AssemblyInput(
        {
          orderId,
          bookId: config.bookId,
          formatId,
          testMode: true,
          testModePages: selector,
        },
        {
          loadManifest: async (key) =>
            key.endsWith("1-manifest.json")
              ? w0
              : key.endsWith("2b-manifest.json")
                ? twoB
                : null,
        },
      );
      const ready = prepareW3AssemblyRun({ ...assembly });
      const loaded = await new AsyncFunction(
        "$json",
        "$binary",
        "$itemIndex",
        code("Load Canonical Assets"),
      ).call(
        {
          helpers: {
            httpRequest: async ({ body }: { body: Record<string, unknown> }) =>
              buildW3PreviewPlan(body),
          },
        },
        ready,
        {},
        0,
      );
      const plan = loaded.json as ReturnType<typeof buildW3PreviewPlan>;
      const previewItems = plan.pagePreviewItems.map((item) => ({
        json: { ...item, r2Key: item.pageImageR2Key },
      }));
      const upstream = (name: string) =>
        name === "Generate Page Preview Images"
          ? previewItems
          : [
              {
                json:
                  name === "Get Order Ready for Assembly" ? ready : assembly,
              },
            ];
      const collectedResult = await new AsyncFunction(
        "$input",
        "$items",
        "$runIndex",
        code("Collect Page Preview Images"),
      ).call(
        {
          helpers: {
            httpRequest: async ({ body }: { body: Record<string, unknown> }) =>
              collectW3PreviewImages(body),
          },
        },
        { first: () => ({ json: {} }), all: () => [] },
        upstream,
        0,
      );
      const collected = collectedResult[0].json as ReturnType<
        typeof collectW3PreviewImages
      >;
      assert.equal(
        collected.pagePreviewImages.length,
        plan.pagePreviewItems.length,
      );
      const artifacts = {
        ...plan,
        ...collected,
        coverPngR2Key: plan.coverPreviewItem.coverPngR2Key,
      };
      const built = await new AsyncFunction(
        "$json",
        "$items",
        "$runIndex",
        code("Build 3A Manifest"),
      ).call(
        {
          helpers: {
            httpRequest: async ({ body }: { body: Record<string, unknown> }) =>
              buildW3Manifest(body),
          },
        },
        artifacts,
        () => [{ json: plan }],
        0,
      );
      const result = built[0].json as ReturnType<typeof buildW3Manifest>;
      const qa = new Function("$json", code("QA Gate (3A Phase 4)"))(result)[0]
        .json.qa;
      const items = (name: string) => [
        {
          json:
            name === "Build 3A Manifest"
              ? result
              : name === "Collect Page Preview Images"
                ? collected
                : { qa },
        },
      ];
      const report = new Function(
        "$items",
        "$runIndex",
        code("Acceptance Tests (3A Phase 5)"),
      )(items, 0)[0].json;
      assert.equal(report.verdict.readyToUploadManifest, true);
      assert.deepEqual(
        result.manifest.selectedPageLabels,
        plan.pagePreviewItems.map((item) => item.pageLabel),
      );
      assert.equal(
        (result.manifest.summary as Record<string, unknown>).readyForBook,
        false,
      );
      const partial = {
        ...artifacts,
        pagePreviewImages: collected.pagePreviewImages.slice(0, -1),
      };
      const missing = buildW3Manifest(partial);
      assert.throws(
        () => new Function("$json", code("QA Gate (3A Phase 4)"))(missing),
        /QA Gate failed/,
      );
      let stored: Record<string, unknown> | undefined,
        patch: Record<string, unknown> | undefined;
      const withoutTransient: Record<string, unknown> = { ...artifacts };
      delete withoutTransient.testMode;
      delete withoutTransient.testModePages;
      const published = await publishW3Manifest(withoutTransient, {
        putObjectImpl: async (_bucket, _key, body) => {
          stored = JSON.parse(String(body));
        },
        getOrderImpl: async () => ({
          customer_email: null,
          customer_approval_status: "not_requested",
          review_stages: {},
        }),
        updateOrderImpl: async (_id, updates) => {
          patch = updates;
          return { success: true };
        },
      });
      assert.equal(
        (stored!.summary as Record<string, unknown>).readyForBook,
        false,
      );
      assert.equal(patch!.next_workflow, null);
      await assert.rejects(
        () =>
          buildW4PrintInput(
            {
              orderId,
              bookId: config.bookId,
              manifest3Key: published.manifest3Key,
            },
            {
              loadManifest: async (key) =>
                key.endsWith("3-manifest.json")
                  ? stored
                  : key.endsWith("1-manifest.json")
                    ? w0
                    : null,
              loadOrder: async () => null,
            },
          ),
        /readyForBook is false/,
      );
    }
  }
  console.log(
    "Configured producer, exported adapter, collector, QA, publisher and W4 guards passed",
  );
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
