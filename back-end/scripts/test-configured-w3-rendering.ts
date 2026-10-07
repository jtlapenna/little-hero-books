import assert from "node:assert/strict";
import { configuredBookFixture } from "./configured-book-fixture";
import { buildW0RunManifestFromConfig } from "../src/lib/books/build-run-manifest";
import { buildW3AssemblyInput } from "../src/lib/books/w3-assembly-input";
import { prepareW3AssemblyRun } from "../src/lib/workers/w3-assembly-worker";
import { buildW3PreviewPlan } from "../src/lib/books/w3-preview-plan";

async function main() {
  const config = configuredBookFixture();
  const orderId = "W3-CONFIGURED-01";
  const specs = {
    childName: "<Ada & Bo>",
    animalGuide: "owl",
    pronouns: "they/them",
    hometown: "Oak & Pine",
  };
  config.assets.overlays.waiting = `${config.bookId}/overlays/waiting.png`;
  for (const guide of [
    "cat",
    "dog",
    "owl",
    "lion",
    "tiger",
    "penguin",
    "t-rex",
    "unicorn",
  ])
    config.rendering.recipe!.animals[guide] = {
      portrait: `${config.bookId}/animals/${guide}/portrait.png`,
    };
  for (const format of Object.values(config.formats)) {
    format.interior.pageSequence[1].layers!.push({
      id: "guide",
      kind: "animal",
      role: "portrait",
      placement: { left: 1900, top: 1500, width: 400 },
    });
    format.interior.pageSequence[2].layers!.push({
      id: "waiting",
      kind: "overlay",
      assetSlot: "waiting",
      placement: { left: 1900, top: 1400, width: 450 },
    });
  }
  for (const formatId of ["standard", "amazon"]) {
    const w0 = buildW0RunManifestFromConfig(config, {
      orderId,
      platform: formatId === "amazon" ? "amazon" : "d2c",
      formatId,
      characterHash: "testhash",
      input: { characterSpecs: specs, dedicationText: "For our <hero>" },
    });
    const twoB = {
      characterHash: "testhash",
      order: { orderId, bookId: config.bookId },
      entries: [13, 17, 18].map((poseNumber) => ({
        poseNumber,
        bgRemovedKey: `${config.bookId}/generated/pose${poseNumber}.png`,
      })),
    };
    const assembly = await buildW3AssemblyInput(
      {
        orderId,
        bookId: config.bookId,
        formatId,
        testMode: true,
        testModePages: [0, 2],
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
    const prepared = prepareW3AssemblyRun({ ...assembly });
    const result = buildW3PreviewPlan(prepared);
    assert.ok(
      result.pages_html.includes("A configured title"),
      "W3 must use frozen configured copy",
    );
    assert.ok(
      result.pages_html.includes("&lt;Ada &amp; Bo&gt;"),
      "Personalization must be escaped once",
    );
    assert.ok(
      result.pages_html.includes("/generated/pose13.png"),
      "Configured slots above 12 must render",
    );
    assert.ok(
      result.pages_html.includes("/generated/pose17.png"),
      "Secondary character layer must render",
    );
    assert.ok(result.pages_html.includes("/overlays/waiting.png"));
    assert.ok(result.pages_html.includes("/animals/owl/portrait.png"));
    assert.ok(
      result.coverPreviewItem.coverHTML.includes("/generated/pose18.png"),
    );
    assert.deepEqual(
      result.pagePreviewItems.map((item) => item.pageNumber),
      [0, 2],
      "Array selector must survive assembly and preparation",
    );
    assert.equal(
      result.coverPreviewItem.pdfMonkeyTemplateId,
      config.rendering.recipe!.covers[formatId].templateId,
    );
    for (const guide of Object.keys(config.rendering.recipe!.animals)) {
      const guideResult = buildW3PreviewPlan({
        ...prepared,
        characterSpecs: { ...specs, animalGuide: guide },
        testModePages: 0,
      });
      assert.ok(
        guideResult.pages_html.includes(`/animals/${guide}/portrait.png`),
      );
    }
    const limit = buildW3PreviewPlan({ ...prepared, testModePages: 2 });
    assert.deepEqual(
      limit.pagePreviewItems.map((item) => item.pageNumber),
      [0, 1],
    );
    const missing = {
      ...prepared,
      processedImages: prepared.processedImages.filter(
        (image) => image.poseNumber !== 17,
      ),
    };
    assert.throws(() => buildW3PreviewPlan(missing), /pose|layer|asset/i);
    const invalid = {
      ...prepared,
      renderSnapshot: {
        ...w0.book.resolved.renderSnapshot,
        formatId: "missing",
      },
    };
    assert.throws(() => buildW3PreviewPlan(invalid), /format|identity/i);
  }
  console.log("Configured W0-to-W3 rendering tests passed");
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
