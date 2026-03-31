import { readFileSync } from "node:fs";
import path from "node:path";

function assert(condition: unknown, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

type WorkflowNode = {
  name?: string;
  type?: string;
  typeVersion?: number;
  parameters?: Record<string, unknown>;
};

type WorkflowExport = {
  name?: string;
  nodes?: WorkflowNode[];
  connections?: Record<string, unknown>;
};

function readWorkflow(workflowPath: string): WorkflowExport {
  return JSON.parse(readFileSync(workflowPath, "utf8")) as WorkflowExport;
}

function getNode(workflow: WorkflowExport, nodeName: string): WorkflowNode {
  const node = workflow.nodes?.find((candidate) => candidate.name === nodeName);
  assert(node, `Expected workflow node "${nodeName}" to exist`);
  return node ?? {};
}

function getCode(workflow: WorkflowExport, nodeName: string): string {
  const node = getNode(workflow, nodeName);
  const code = node.parameters?.jsCode;
  assert(
    typeof code === "string",
    `Expected workflow node "${nodeName}" to have jsCode`,
  );
  return String(code ?? "");
}

function compileAllCodeNodes(
  workflowPath: string,
  workflow: WorkflowExport,
): void {
  const AsyncFunction = Object.getPrototypeOf(async function () {
    return undefined;
  }).constructor as new (
    ...args: string[]
  ) => (...args: unknown[]) => Promise<unknown>;

  for (const node of workflow.nodes ?? []) {
    const code = node.parameters?.jsCode;
    if (typeof code !== "string") {
      continue;
    }

    try {
      new AsyncFunction(code);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(
        `Workflow code failed to compile for ${path.basename(workflowPath)} / ${node.name}: ${message}`,
      );
    }
  }
}

async function main(): Promise<void> {
  const backEndRoot = process.cwd();
  const repoRoot = path.resolve(backEndRoot, "..");

  const w2aTopLevelWorkflowPath = path.join(
    repoRoot,
    "docs/n8n-workflow-files/repo-centric/workflows/w2A-Orchestrator.repo-centric.json",
  );
  const w2bTopLevelWorkflowPath = path.join(
    repoRoot,
    "docs/n8n-workflow-files/repo-centric/workflows/w2B-main-orchestrator.repo-centric.json",
  );
  const w2aWorkflowPath = path.join(
    repoRoot,
    "docs/n8n-workflow-files/repo-centric/workflows/w2A-SW1-Pose_Generation.repo-centric.json",
  );
  const w2aSw0WorkflowPath = path.join(
    repoRoot,
    "docs/n8n-workflow-files/repo-centric/workflows/w2A-SW0-Base_Character_Generation.repo-centric.json",
  );
  const w2bWorkflowPath = path.join(
    repoRoot,
    "docs/n8n-workflow-files/repo-centric/workflows/w2B-sw1-single-pose.repo-centric.json",
  );
  const w3WorkflowPath = path.join(
    repoRoot,
    "docs/n8n-workflow-files/repo-centric/workflows/w3-Book-Assembly.repo-centric.json",
  );
  const siblingW11WorkflowPath = path.join(
    repoRoot,
    "docs/n8n-workflow-files/sibling-orders/sibling-order-n8n-workflows/SIBLING - w1.1-Queue_Manager_and_Router.json",
  );

  const w2aTopLevelWorkflow = readWorkflow(w2aTopLevelWorkflowPath);
  const w2bTopLevelWorkflow = readWorkflow(w2bTopLevelWorkflowPath);
  const w2aWorkflow = readWorkflow(w2aWorkflowPath);
  const w2aSw0Workflow = readWorkflow(w2aSw0WorkflowPath);
  const w2bWorkflow = readWorkflow(w2bWorkflowPath);
  const w3Workflow = readWorkflow(w3WorkflowPath);
  const siblingW11Workflow = readWorkflow(siblingW11WorkflowPath);

  compileAllCodeNodes(w2aTopLevelWorkflowPath, w2aTopLevelWorkflow);
  compileAllCodeNodes(w2bTopLevelWorkflowPath, w2bTopLevelWorkflow);
  compileAllCodeNodes(w2aWorkflowPath, w2aWorkflow);
  compileAllCodeNodes(w2aSw0WorkflowPath, w2aSw0Workflow);
  compileAllCodeNodes(w2bWorkflowPath, w2bWorkflow);
  compileAllCodeNodes(w3WorkflowPath, w3Workflow);
  compileAllCodeNodes(siblingW11WorkflowPath, siblingW11Workflow);

  const w2aTopLevelWebhookNode = getNode(
    w2aTopLevelWorkflow,
    "Webhook (Router)",
  );
  const w2aTopLevelWebhookConnections =
    JSON.stringify(w2aTopLevelWorkflow.connections?.["Webhook (Router)"] ?? {});
  const w2aTopLevelStartNode = getNode(
    w2aTopLevelWorkflow,
    "Start / Pass-through",
  );
  const w2aTopLevelDefaultsCode = getCode(
    w2aTopLevelWorkflow,
    "Set Environment Defaults (code)",
  );
  const w2aTopLevelExpandCode = getCode(
    w2aTopLevelWorkflow,
    "Expand to N Poses",
  );
  const w2aPrepareResolveCode = getCode(
    w2aTopLevelWorkflow,
    "Prepare Resolve Pose Worklist Body",
  );
  const w2aTopLevelExecuteNode = getNode(
    w2aTopLevelWorkflow,
    "Execute SW1 - Pose Generation",
  );
  const w2aTopLevelLoopConnections =
    (w2aTopLevelWorkflow.connections?.["Loop Over Items"] as
      | {
          main?: Array<Array<{ node?: string }>>;
        }
      | undefined) ?? undefined;

  assert(
    w2aTopLevelWebhookNode.disabled !== true,
    "Repo-centric W2A top-level webhook must stay enabled after import",
  );
  assert(
    w2aTopLevelWebhookNode.parameters?.responseMode === "onReceived" &&
      w2aTopLevelWebhookConnections.includes('"node":"Normalize Router Payload"') &&
      !w2aTopLevelWebhookConnections.includes('"node":"Respond to Webhook (Ack)"'),
    "Repo-centric W2A top-level webhook should respond immediately and route directly into payload normalization instead of depending on a separate Respond to Webhook node",
  );
  assert(
    w2aTopLevelStartNode.type === "n8n-nodes-base.code" &&
      JSON.stringify(w2aTopLevelStartNode.parameters).includes(
        "Set Environment Defaults (code)",
      ) &&
      JSON.stringify(w2aTopLevelStartNode.parameters).includes(
        "streamToObject",
      ) &&
      JSON.stringify(w2aTopLevelStartNode.parameters).includes("pickFirstString") &&
      JSON.stringify(w2aTopLevelStartNode.parameters).includes("const out = {") &&
      JSON.stringify(w2aTopLevelStartNode.parameters).includes("pairedItem") &&
      !JSON.stringify(w2aTopLevelStartNode.parameters).includes(
        "const j = {\\n  ...upstream,\\n  ...current,",
      ),
    "Repo-centric W2A top-level pass-through node should unwrap SW0 stream responses, keep paired-item metadata, and slim the payload to the minimal repo-owned worklist contract before resolving poses",
  );
  assert(
    w2aTopLevelDefaultsCode.includes("Bootstrap 2A Manifest Stub") &&
      w2aTopLevelDefaultsCode.includes("streamToObject") &&
      w2aTopLevelDefaultsCode.includes("characterHash"),
    "Repo-centric W2A top-level defaults node should unwrap bootstrap-response payloads before merging defaults",
  );
  assert(
    w2aTopLevelExpandCode.includes("streamToObject") &&
      w2aTopLevelExpandCode.includes("const j = unwrap(item.json || {}) || {}") &&
      w2aTopLevelExpandCode.includes("j.includeZeroPose ?? j.allowZeroPose"),
    "Repo-centric W2A pose-expansion node should unwrap the repo worklist HTTP response before deriving per-pose items and zero-pose policy",
  );
  assert(
    JSON.stringify(w2aTopLevelExecuteNode.parameters).includes(
      '"value":"kGob5aDJ6e5WRPh7"',
    ) &&
      JSON.stringify(w2aTopLevelExecuteNode.parameters).includes(
        "REPO - w2A-SW1-Pose_Generation",
      ),
    "Repo-centric W2A top-level workflow should call the imported repo-centric SW1 subworkflow",
  );
  assert(
    w2aPrepareResolveCode.includes("const includeZeroPose =") &&
      w2aPrepareResolveCode.includes("$json.includeZeroPose ??") &&
      w2aPrepareResolveCode.includes("allowZeroPose: includeZeroPose") &&
      w2aPrepareResolveCode.includes("function pickFirstString") &&
      w2aPrepareResolveCode.includes("requestBody: JSON.stringify({ payload })") &&
      !w2aPrepareResolveCode.includes("includeZeroPose: true") &&
      !w2aPrepareResolveCode.includes("const payload = {\n  ...$json"),
    "Repo-centric W2A worklist request should preserve inbound zero-pose policy and send a minimal payload instead of cloning the full SW0 result into the worklist request",
  );
  assert(
    w2aTopLevelLoopConnections.main?.[0]?.some(
      (connection) => connection.node === "Write Run Manifest1",
    ) &&
      w2aTopLevelLoopConnections.main?.[1]?.some(
        (connection) => connection.node === "Set Environment Defaults",
      ),
    "Repo-centric W2A loop should keep manifest finalization on the batch-complete branch and per-pose execution on the iteration branch",
  );

  assert(
    w2aSw0Workflow.name === "REPO - w2A-SW0-Base_Character_Generation",
    "Repo-centric W2A SW0 subworkflow should carry the repo-centric workflow name",
  );
  const w2aSw0FetchNode = getNode(w2aSw0Workflow, "Fetch Repo W2A Base Input");
  const w2aSw0SchemaNode = getNode(w2aSw0Workflow, "Schema Check + Defaults");
  const w2aSw0BuildRequestCode = getCode(
    w2aSw0Workflow,
    "Build Repo Gemini Base Request",
  );
  const w2aSw0GenerateNode = getNode(
    w2aSw0Workflow,
    "Generate Custom Base Character1",
  );
  const w2aSw0ExtractNode = getNode(
    w2aSw0Workflow,
    "Process Gemini API response and extract generated image1",
  );
  const w2aSw0FinalizeNode = getNode(
    w2aSw0Workflow,
    "Finalize Repo W2A Base Result",
  );
  const w2aSw0RestoreFinalizedCode = getCode(
    w2aSw0Workflow,
    "Restore Finalized Base Envelope",
  );
  const w2aSw0UploadNode = getNode(w2aSw0Workflow, "Upload a file1");
  const w2aSw0RestoreUploadedCode = getCode(
    w2aSw0Workflow,
    "Restore Uploaded Base Envelope",
  );
  const w2aSw0FetchConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Fetch Repo W2A Base Input"] ?? {},
  );
  const w2aSw0SchemaConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Schema Check + Defaults"] ?? {},
  );
  const w2aSw0MergeConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Merge Base & Hair Refs1"] ?? {},
  );
  const w2aSw0BuildConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Build Repo Gemini Base Request"] ?? {},
  );
  const w2aSw0IfConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["IF: Test Mode? (1)1"] ?? {},
  );
  const w2aSw0MockConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["🧪 MOCK: Generate Custom Base Character1"] ?? {},
  );
  const w2aSw0GenerateConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Generate Custom Base Character1"] ?? {},
  );
  const w2aSw0ExtractConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Process Gemini API response and extract generated image1"] ?? {},
  );
  const w2aSw0FinalizeConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Finalize Repo W2A Base Result"] ?? {},
  );
  const w2aSw0RestoreFinalizedConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Restore Finalized Base Envelope"] ?? {},
  );
  const w2aSw0UploadConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Upload a file1"] ?? {},
  );
  const w2aSw0RestoreUploadedConnections = JSON.stringify(
    w2aSw0Workflow.connections?.["Restore Uploaded Base Envelope"] ?? {},
  );

  assert(
    w2aSw0FetchNode.type === "n8n-nodes-base.httpRequest" &&
      JSON.stringify(w2aSw0FetchNode.parameters).includes(
        "/api/internal/w2a/build-base-input",
      ) &&
      JSON.stringify(w2aSw0FetchNode.parameters).includes("$json.backendUrl"),
    "Repo-centric W2A SW0 should call the repo-owned base-input route through the payload-selected backendUrl",
  );
  assert(
    w2aSw0SchemaNode.type === "n8n-nodes-base.code" &&
      JSON.stringify(w2aSw0SchemaNode.parameters).includes(
        "Could not parse W2A base input response",
      ) &&
      JSON.stringify(w2aSw0SchemaNode.parameters).includes(
        "baseInputSource: 'repo'",
      ),
    "Repo-centric W2A SW0 schema node should unwrap the repo-owned base-input response and add compatibility test flags",
  );
  assert(
    w2aSw0BuildRequestCode.includes("repo-w2a-base-input@v1") &&
      w2aSw0BuildRequestCode.includes("requestParts?.baseLabel") &&
      w2aSw0BuildRequestCode.includes("systemInstructionText") &&
      !w2aSw0BuildRequestCode.includes("CRITICAL — DRESS COLOR") &&
      !w2aSw0BuildRequestCode.includes("BOOK STYLE: flat, clean vector-like forms"),
    "Repo-centric W2A SW0 request builder should trust the repo-owned prompt contract instead of rebuilding the large inline prompt block",
  );
  assert(
    w2aSw0GenerateNode.onError === "continueRegularOutput" &&
      w2aSw0ExtractNode.onError === "continueRegularOutput" &&
      w2aSw0UploadNode.type === "n8n-nodes-base.s3" &&
      JSON.stringify(w2aSw0UploadNode.parameters).includes("$json.__meta.storageKey"),
    "Repo-centric W2A SW0 should keep Gemini submit, extraction, and upload as thin workflow-owned transport steps",
  );
  assert(
    w2aSw0FinalizeNode.type === "n8n-nodes-base.httpRequest" &&
      JSON.stringify(w2aSw0FinalizeNode.parameters).includes(
        "/api/internal/w2a/finalize-base-result",
      ) &&
      JSON.stringify(w2aSw0FinalizeNode.parameters).includes("$json.backendUrl"),
    "Repo-centric W2A SW0 should call the repo-owned finalizer route before upload",
  );
  assert(
    w2aSw0RestoreFinalizedCode.includes(
      "Process Gemini API response and extract generated image1",
    ) &&
      w2aSw0RestoreFinalizedCode.includes(
        "Could not parse finalized W2A base result",
      ) &&
      w2aSw0RestoreUploadedCode.includes(
        "Restore Finalized Base Envelope",
      ),
    "Repo-centric W2A SW0 should rehydrate the extracted binary after finalization and restore the finalized envelope after upload",
  );
  assert(
    !w2aSw0Workflow.nodes?.some(
      (node) =>
        node.name === "Resolve Skin Tone & Base Path1" ||
        node.name === "Resolve Hairstyle Key & Asset Path1" ||
        node.name === "Build Dynamic Hairstyle Prompt1" ||
        node.name === "Compute Upload Keys" ||
        node.name === "SW0 Out — Pack Envelope" ||
        node.name === "Preserve Character Specs for SW1",
    ),
    "Repo-centric W2A SW0 export should retire the legacy inline prep/packaging nodes in favor of repo-owned base input and finalization routes",
  );
  assert(
    w2aSw0FetchConnections.includes('"node":"Schema Check + Defaults"') &&
      w2aSw0SchemaConnections.includes("Load Base Character Image1") &&
      w2aSw0SchemaConnections.includes("Load Hairstyle Reference (R2/S3)1") &&
      w2aSw0MergeConnections.includes("Build Repo Gemini Base Request") &&
      w2aSw0BuildConnections.includes("IF: Test Mode? (1)1") &&
      w2aSw0IfConnections.includes("🧪 MOCK: Generate Custom Base Character1") &&
      w2aSw0IfConnections.includes("Generate Custom Base Character1") &&
      w2aSw0MockConnections.includes(
        "Process Gemini API response and extract generated image1",
      ) &&
      w2aSw0GenerateConnections.includes(
        "Process Gemini API response and extract generated image1",
      ) &&
      w2aSw0ExtractConnections.includes("Finalize Repo W2A Base Result") &&
      w2aSw0FinalizeConnections.includes("Restore Finalized Base Envelope") &&
      w2aSw0RestoreFinalizedConnections.includes("Upload a file1") &&
      w2aSw0UploadConnections.includes("Restore Uploaded Base Envelope") &&
      w2aSw0RestoreUploadedConnections.includes("Return Generated Image1"),
    "Repo-centric W2A SW0 should route base-generation work through repo-owned prep/finalization while leaving the provider, extraction, and upload seam in the workflow",
  );

  const w2bTopLevelNormalizeNode = getNode(
    w2bTopLevelWorkflow,
    "Normalize 2B Input",
  );
  const w2bTopLevelExecuteNode = getNode(
    w2bTopLevelWorkflow,
    "Execute Workflow: s2B-sw",
  );
  assert(
    w2bTopLevelNormalizeNode.type === "n8n-nodes-base.httpRequest" &&
      JSON.stringify(w2bTopLevelNormalizeNode.parameters).includes(
        "/api/internal/w2b/build-worklist",
      ) &&
      JSON.stringify(w2bTopLevelNormalizeNode.parameters).includes(
        "$json.backendUrl",
      ),
    "Repo-centric W2B top-level workflow should call the repo-owned build-worklist route through the payload-selected backendUrl",
  );
  assert(
    JSON.stringify(w2bTopLevelExecuteNode.parameters).includes(
      '"value":"4fxha79xAEaYEBYb"',
    ) &&
      JSON.stringify(w2bTopLevelExecuteNode.parameters).includes(
        "REPO - w2B-sw1-single-pose",
      ),
    "Repo-centric W2B top-level workflow should call the imported repo-centric single-pose subworkflow",
  );

  assert(
    w2aWorkflow.name === "REPO - w2A-SW1-Pose_Generation",
    "Repo-centric W2A subworkflow should carry the repo-centric workflow name",
  );
  const w2aNormalizeTestFlagCode = getCode(w2aWorkflow, "Normalize Test Flag");
  const w2aFetchNode = getNode(w2aWorkflow, "Fetch Repo W2A Pose Input");
  const w2aSchemaNode = getNode(w2aWorkflow, "Schema Check + Defaults1");
  const w2aReplayIfNode = getNode(w2aWorkflow, "IF: Replay Ready?");
  const w2aReplayOutputCode = getCode(w2aWorkflow, "Prepare Replay Output");
  const w2aReplayDownloadNode = getNode(
    w2aWorkflow,
    "Download Replay Generated Image",
  );
  const w2aReplayBinaryIfNode = getNode(
    w2aWorkflow,
    "IF: Replay Binary Ready?",
  );
  const w2aReplayRestoreNode = getNode(
    w2aWorkflow,
    "Restore Replay Fallback Context",
  );
  const w2aBuildPromptCode = getCode(w2aWorkflow, "Build Dynamic Pose Prompt");
  const w2aGenerateNode = getNode(w2aWorkflow, "Generate Character in Pose");
  const w2aExtractNode = getNode(w2aWorkflow, "Extract Generated Image");
  const w2aUploadNode = getNode(w2aWorkflow, "Upload Pose Artifact");
  const w2aUploadCode = getCode(w2aWorkflow, "Upload Pose Artifact");
  const w2aPreserveGeminiCode = getCode(
    w2aWorkflow,
    "Preserve Gemini Context",
  );
  const w2aLogSubmitCode = getCode(w2aWorkflow, "Log Workflow Job Submit");
  const w2aLogFailedCode = getCode(w2aWorkflow, "Log Workflow Job Failed");
  const w2aThrowProviderErrorCode = getCode(
    w2aWorkflow,
    "Throw Gemini Provider Error",
  );
  const w2aLogCompleteCode = getCode(w2aWorkflow, "Log Workflow Job Complete");
  const w2aLogExtractFailureCode = getCode(
    w2aWorkflow,
    "Log Workflow Job Extract Failure",
  );
  const w2aLogUploadFailureCode = getCode(
    w2aWorkflow,
    "Log Workflow Job Upload Failure",
  );
  const w2aThrowPostSubmitErrorCode = getCode(
    w2aWorkflow,
    "Throw Post-Submit Error",
  );
  const w2aFetchConnections = JSON.stringify(
    w2aWorkflow.connections?.["Fetch Repo W2A Pose Input"] ?? {},
  );
  const w2aSchemaConnections = JSON.stringify(
    w2aWorkflow.connections?.["Schema Check + Defaults1"] ?? {},
  );
  const w2aReplayIfConnections = JSON.stringify(
    w2aWorkflow.connections?.["IF: Replay Ready?"] ?? {},
  );
  const w2aReplayOutputConnections = JSON.stringify(
    w2aWorkflow.connections?.["Prepare Replay Output"] ?? {},
  );
  const w2aReplayDownloadConnections = JSON.stringify(
    w2aWorkflow.connections?.["Download Replay Generated Image"] ?? {},
  );
  const w2aReplayBinaryIfConnections = JSON.stringify(
    w2aWorkflow.connections?.["IF: Replay Binary Ready?"] ?? {},
  );
  const w2aReplayRestoreConnections = JSON.stringify(
    w2aWorkflow.connections?.["Restore Replay Fallback Context"] ?? {},
  );
  const w2aMockConnections = JSON.stringify(
    w2aWorkflow.connections?.["🧪 MOCK: Generate Character in Pose"] ?? {},
  );
  const w2aGenerateConnections = JSON.stringify(
    w2aWorkflow.connections?.["Generate Character in Pose"] ?? {},
  );
  const w2aPreserveGeminiConnections = JSON.stringify(
    w2aWorkflow.connections?.["Preserve Gemini Context"] ?? {},
  );
  const w2aGeminiIfConnections = JSON.stringify(
    w2aWorkflow.connections?.["IF: Gemini Provider Failed"] ?? {},
  );
  const w2aExtractConnections = JSON.stringify(
    w2aWorkflow.connections?.["Extract Generated Image"] ?? {},
  );
  const w2aExtractFailureIfConnections = JSON.stringify(
    w2aWorkflow.connections?.["IF: Extract Generated Image Failed"] ?? {},
  );
  const w2aUploadConnections = JSON.stringify(
    w2aWorkflow.connections?.["Upload Pose Artifact"] ?? {},
  );
  const w2aUploadFailureIfConnections = JSON.stringify(
    w2aWorkflow.connections?.["IF: Upload Pose Artifact Failed"] ?? {},
  );
  const w2aPreUploadConnections = JSON.stringify(
    w2aWorkflow.connections?.["SW1 - Pre-Upload Telemetry"] ?? {},
  );
  const w2aLogCompleteConnections = JSON.stringify(
    w2aWorkflow.connections?.["Log Workflow Job Complete"] ?? {},
  );

  assert(
    w2aNormalizeTestFlagCode.includes("streamToObject") &&
      w2aNormalizeTestFlagCode.includes("Buffer.concat") &&
      w2aNormalizeTestFlagCode.includes("const payload = unwrap($json || {}) || {}"),
    "Repo-centric W2A normalize node should unwrap execute-workflow stream payloads before calling the repo-owned pose-input route",
  );
  assert(
    w2aFetchNode.type === "n8n-nodes-base.httpRequest" &&
      JSON.stringify(w2aFetchNode.parameters).includes(
        "/api/internal/w2a/build-pose-input",
      ) &&
      JSON.stringify(w2aFetchNode.parameters).includes("$json.backendUrl"),
    "Repo-centric W2A subworkflow should call the repo-owned W2A pose-input route through the payload-selected backendUrl",
  );
  assert(
    w2aSchemaNode.type === "n8n-nodes-base.code" &&
      JSON.stringify(w2aSchemaNode.parameters).includes(
        "Could not parse W2A pose input response",
      ) &&
      JSON.stringify(w2aSchemaNode.parameters).includes(
        "poseInputSource: 'repo'",
      ) &&
      JSON.stringify(w2aSchemaNode.parameters).includes("poseNN_hyphen"),
    "Repo-centric W2A schema node should unwrap the repo-owned pose-input response and add compatibility aliases",
  );
  assert(
    w2aReplayIfNode.type === "n8n-nodes-base.if" &&
      JSON.stringify(w2aReplayIfNode.parameters).includes(
        "workflowClaimed === false",
      ) &&
      JSON.stringify(w2aReplayIfNode.parameters).includes(
        "workflowReplayReady === true",
      ) &&
      JSON.stringify(w2aReplayIfNode.parameters).includes(
        "workflowJobStatus === 'succeeded'",
      ),
    "Repo-centric W2A subworkflow should branch around Gemini for both the repo replay envelope and the existing live succeeded-job contract",
  );
  assert(
    w2aReplayOutputCode.includes("storageKey: replayUploadKey") &&
      w2aReplayOutputCode.includes("generatedPublicUrl") &&
      w2aReplayOutputCode.includes("workflowReplayReady: true") &&
      w2aReplayOutputCode.includes("pairedItem"),
    "Repo-centric W2A replay output node should preserve the stored artifact metadata and prefer the durable replay upload key over stale retry keys",
  );
  assert(
    w2aReplayOutputCode.indexOf("j.workflowReplay?.uploadKey") <
      w2aReplayOutputCode.indexOf("j.uploadKey"),
    "Repo-centric W2A replay output node should prefer the durable succeeded-job uploadKey over any stale in-memory retry uploadKey",
  );
  assert(
    w2aReplayDownloadNode.type === "n8n-nodes-base.s3" &&
      w2aReplayDownloadNode.onError === "continueRegularOutput" &&
      JSON.stringify(w2aReplayDownloadNode.parameters).includes(
        '"bucketName":"little-hero-assets"',
      ) &&
      JSON.stringify(w2aReplayDownloadNode.parameters).includes(
        "$json.uploadKey || $json.storageKey",
      ) &&
      JSON.stringify(w2aReplayDownloadNode.parameters).includes(
        '"binaryPropertyName":"generated"',
      ) &&
      w2aReplayOutputConnections.includes("Download Replay Generated Image") &&
      w2aReplayDownloadConnections.includes("IF: Replay Binary Ready?") &&
      w2aReplayBinaryIfNode.type === "n8n-nodes-base.if" &&
      JSON.stringify(w2aReplayBinaryIfNode.parameters).includes(
        "!!($binary && $binary.generated)",
      ) &&
      w2aReplayBinaryIfConnections.includes("Return Generated Image") &&
      w2aReplayBinaryIfConnections.includes("Restore Replay Fallback Context") &&
      w2aReplayRestoreNode.type === "n8n-nodes-base.code" &&
      JSON.stringify(w2aReplayRestoreNode.parameters).includes(
        "Prepare Replay Output",
      ) &&
      JSON.stringify(w2aReplayRestoreNode.parameters).includes(
        "workflowReplayFallback",
      ) &&
      w2aReplayRestoreConnections.includes("Stamp Pose Index"),
    "Repo-centric W2A replay path should rehydrate binary.generated through the R2 S3 credential flow and restore the original item before falling back to live generation if the stored replay artifact is missing",
  );
  assert(
    w2aBuildPromptCode.includes("repo-w2a-pose-input@v1") &&
      w2aBuildPromptCode.includes("repo-owned pose input") &&
      !w2aBuildPromptCode.includes("STYLE TRANSFER TASK:"),
    "Repo-centric W2A prompt node should trust the repo-owned prompt contract instead of rebuilding the large inline prompt block",
  );
  assert(
    w2aUploadCode.includes("j.uploadKey ||") &&
      w2aUploadCode.includes("j.generatedFileName ||") &&
      w2aUploadCode.includes("poseNN_hyphen"),
    "Repo-centric W2A upload node should prefer repo-owned upload keys and filenames",
  );
  assert(
    w2aGenerateNode.onError === "continueRegularOutput" &&
      w2aExtractNode.onError === "continueRegularOutput" &&
      w2aUploadNode.onError === "continueRegularOutput",
    "Repo-centric W2A Gemini generation and post-submit transforms should continue on regular output so workflow-job failure logging can run before the workflow exits",
  );
  assert(
    w2aPreserveGeminiCode.includes("TESTING - Prepare Gemini (POSE)") &&
      w2aPreserveGeminiCode.includes("Build Dynamic Pose Prompt") &&
      w2aPreserveGeminiCode.includes("Schema Check + Defaults1") &&
      w2aPreserveGeminiCode.includes("...response") &&
      w2aPreserveGeminiCode.includes("return {") &&
      !w2aPreserveGeminiCode.includes("return [{"),
    "Repo-centric W2A real-provider bridge should rehydrate upstream repo context before the Gemini failure/submit branch runs",
  );
  assert(
    w2aLogSubmitCode.includes("/api/internal/workflow-jobs/log-event") &&
      w2aLogSubmitCode.includes("eventType: 'provider-submitted'") &&
      w2aLogSubmitCode.includes("workflowJobId") &&
      w2aLogSubmitCode.includes("workflowAttemptId") &&
      w2aLogSubmitCode.includes("stripInlineDataDeep") &&
      w2aLogSubmitCode.includes("poseNumber: j.poseNumber ?? null") &&
      w2aLogSubmitCode.includes("workflowLogEvent: response && typeof response === 'object' ? response : null") &&
      !w2aLogSubmitCode.includes("...(response && typeof response === 'object' ? response : {})"),
    "Repo-centric W2A submit logger should call the workflow-jobs route without posting raw inline image data or overwriting the live Gemini response payload",
  );
  assert(
    w2aLogFailedCode.includes("eventType: 'provider-failed'") &&
      w2aLogFailedCode.includes("jobStatus: 'failed'") &&
      w2aLogFailedCode.includes("stripInlineDataDeep") &&
      w2aLogFailedCode.includes("poseNumber: j.poseNumber ?? null") &&
      w2aLogFailedCode.includes("workflowLogEvent: response && typeof response === 'object' ? response : null") &&
      !w2aLogFailedCode.includes("...(response && typeof response === 'object' ? response : {})") &&
      w2aThrowProviderErrorCode.includes("throw new Error"),
    "Repo-centric W2A failure branch should record provider-failed events before rethrowing the Gemini error",
  );
  assert(
    w2aLogCompleteCode.includes("eventType: 'completed'") &&
      w2aLogCompleteCode.includes("jobStatus: 'succeeded'") &&
      w2aLogCompleteCode.includes("resultSnapshot") &&
      w2aLogCompleteCode.includes("poseNumber: j.poseNumber ?? null") &&
      w2aLogCompleteCode.includes("workflowLogEvent: response && typeof response === 'object' ? response : null") &&
      !w2aLogCompleteCode.includes("...(response && typeof response === 'object' ? response : {})"),
    "Repo-centric W2A completion logger should record a synchronous completed event with a result snapshot",
  );
  assert(
    w2aLogExtractFailureCode.includes("eventType: 'failed'") &&
      w2aLogExtractFailureCode.includes("failurePhase: 'extract-generated-image'") &&
      w2aLogExtractFailureCode.includes("failedNode: 'Extract Generated Image'") &&
      w2aLogUploadFailureCode.includes("eventType: 'failed'") &&
      w2aLogUploadFailureCode.includes("failurePhase: 'upload-pose-artifact'") &&
      w2aLogUploadFailureCode.includes("failedNode: 'Upload Pose Artifact'") &&
      w2aThrowPostSubmitErrorCode.includes("throw new Error"),
    "Repo-centric W2A post-submit failure branch should mark the workflow job failed for extract/upload-stage errors before rethrowing",
  );
  assert(
    w2aFetchConnections.includes('"node":"Schema Check + Defaults1"'),
    "Repo-centric W2A fetch node should feed the schema/defaults node for downstream context rehydration",
  );
  assert(
    w2aSchemaConnections.includes('"node":"IF: Replay Ready?"') &&
      w2aReplayIfConnections.includes("Prepare Replay Output") &&
      w2aReplayIfConnections.includes("Stamp Pose Index") &&
      w2aReplayOutputConnections.includes("Download Replay Generated Image") &&
      w2aReplayDownloadConnections.includes("IF: Replay Binary Ready?") &&
      w2aReplayBinaryIfConnections.includes("Return Generated Image") &&
      w2aReplayBinaryIfConnections.includes("Restore Replay Fallback Context") &&
      w2aReplayRestoreConnections.includes("Stamp Pose Index"),
    "Repo-centric W2A replay-ready items should short-circuit into replay artifact download, then restore the original pose item before falling back to the normal Gemini path if the stored artifact is missing",
  );
  assert(
    w2aMockConnections.includes("Log Workflow Job Submit") &&
      w2aGenerateConnections.includes("Preserve Gemini Context") &&
      w2aPreserveGeminiConnections.includes("IF: Gemini Provider Failed") &&
      w2aGeminiIfConnections.includes("Log Workflow Job Failed") &&
      w2aGeminiIfConnections.includes("Log Workflow Job Submit") &&
      w2aExtractConnections.includes("IF: Extract Generated Image Failed") &&
      w2aExtractFailureIfConnections.includes("Log Workflow Job Extract Failure") &&
      w2aExtractFailureIfConnections.includes("Upload Pose Artifact") &&
      w2aUploadConnections.includes("IF: Upload Pose Artifact Failed") &&
      w2aUploadFailureIfConnections.includes("Log Workflow Job Upload Failure") &&
      w2aUploadFailureIfConnections.includes("SW1 - Pre-Upload Telemetry") &&
      w2aPreUploadConnections.includes("Log Workflow Job Complete") &&
      w2aLogCompleteConnections.includes("Return Generated Image"),
    "Repo-centric W2A workflow should route mock/real generation through the preserve-context bridge and then through submit, post-submit failure, and completion workflow-job log nodes",
  );

  assert(
    w2bWorkflow.name === "REPO - w2B-sw1-single-pose",
    "Repo-centric W2B subworkflow should carry the repo-centric workflow name",
  );
  const w2bNormalizeNode = getNode(w2bWorkflow, "Normalize Input");
  const w2bBuildBriaCode = getCode(w2bWorkflow, "Build Bria Payload");
  const w2bExtractTrackingCode = getCode(w2bWorkflow, "Extract Bria Tracking");
  const w2bQaKeyCode = getCode(w2bWorkflow, "QA: Key for Neon BG");
  const w2bPrepUploadCode = getCode(w2bWorkflow, "Prep Upload");
  const w2bCleanUploadCode = getCode(w2bWorkflow, "Clean Binary After Upload");
  const w2bLogSubmitNode = getNode(w2bWorkflow, "Log Workflow Job Submit");
  const w2bLogPollNode = getNode(w2bWorkflow, "Log Workflow Job Poll");
  const w2bLogFailedNode = getNode(w2bWorkflow, "Log Workflow Job Failed");
  const w2bLogCompleteNode = getNode(w2bWorkflow, "Log Workflow Job Complete");
  const w2bPreserveNormalizeCode = getCode(
    w2bWorkflow,
    "Preserve Normalize Context",
  );
  const w2bIfCompletedConnections = JSON.stringify(
    w2bWorkflow.connections?.["If Completed"] ?? {},
  );
  const w2bExtractTrackingConnections = JSON.stringify(
    w2bWorkflow.connections?.["Extract Bria Tracking"] ?? {},
  );
  const w2bDecidePollConnections = JSON.stringify(
    w2bWorkflow.connections?.["Decide Poll"] ?? {},
  );
  const w2bNormalizeScaleConnections = JSON.stringify(
    w2bWorkflow.connections?.["Normalize Pose Scale"] ?? {},
  );
  const w2bPreserveNormalizeConnections = JSON.stringify(
    w2bWorkflow.connections?.["Preserve Normalize Context"] ?? {},
  );

  assert(
    w2bNormalizeNode.type === "n8n-nodes-base.httpRequest" &&
      JSON.stringify(w2bNormalizeNode.parameters).includes(
        "/api/internal/w2b/build-pose-input",
      ) &&
      JSON.stringify(w2bNormalizeNode.parameters).includes("$json.backendUrl"),
    "Repo-centric W2B subworkflow should call the repo-owned W2B pose-input route through the payload-selected backendUrl",
  );
  assert(
    w2bBuildBriaCode.includes("Could not parse W2B pose input response") &&
      w2bBuildBriaCode.includes("payload.briaPayload") &&
      w2bBuildBriaCode.includes("bria: { payload: briaPayload }"),
    "Repo-centric W2B Bria payload node should unwrap the repo-owned pose-input response and preserve the repo-built Bria payload",
  );
  assert(
    w2bExtractTrackingCode.includes("$items('Build Bria Payload'") &&
      !w2bExtractTrackingCode.includes(
        "$items('Normalize Input', 0, $runIndex)?.[0]?.json || {}; } catch {}\\n\\nconst statusUrl",
      ),
    "Repo-centric W2B tracking extraction should prefer the normalized Bria-payload context instead of relying only on the raw HTTP node output",
  );
  assert(
    w2bQaKeyCode.includes("qaBackgroundKey") &&
      w2bQaKeyCode.includes("qaBackgroundBinary"),
    "Repo-centric W2B QA background node should use the repo-owned QA background contract",
  );
  assert(
    w2bPrepUploadCode.includes("j.bgRemovedKey ||") &&
      w2bPrepUploadCode.includes("j.bookId || 'book-mvp-simple-adventure'"),
    "Repo-centric W2B upload-prep node should prefer the repo-owned background-removed key with a book-aware fallback",
  );
  assert(
    w2bCleanUploadCode.includes("$items('Build Bria Payload'") &&
      w2bCleanUploadCode.includes(
        "if (!bgRemovedKey) bgRemovedKey = bria.bgRemovedKey;",
      ) &&
      w2bCleanUploadCode.includes("workflowJobId: workflowJobId || null,"),
    "Repo-centric W2B upload cleanup should recover context from the normalized Bria-payload node and preserve workflow job ids in the terminal result",
  );
  assert(
    w2bPreserveNormalizeCode.includes("firstNodeJson('Extract Bria Tracking')") &&
      w2bPreserveNormalizeCode.includes("firstNodeJson('Merge QA with Binary')") &&
      w2bPreserveNormalizeCode.includes("firstNodeJson('Prep Upload')"),
    "Repo-centric W2B normalize-context bridge should rehydrate workflow-job and pose context after the pose-normalizer HTTP node overwrites $json",
  );
  assert(
    JSON.stringify(w2bLogSubmitNode.parameters).includes(
      "/api/internal/workflow-jobs/log-event",
    ) &&
      JSON.stringify(w2bLogSubmitNode.parameters).includes(
        "eventType: 'provider-submitted'",
      ) &&
      JSON.stringify(w2bLogSubmitNode.parameters).includes(
        "poseNumber: ($json.poseNumber ?? null)",
      ),
    "Repo-centric W2B submit logger should report provider-submitted events to the workflow-jobs route and preserve poseNumber 0 in the payload",
  );
  assert(
    JSON.stringify(w2bLogPollNode.parameters).includes(
      "/api/internal/workflow-jobs/log-event",
    ) &&
      JSON.stringify(w2bLogPollNode.parameters).includes(
        "eventType: 'poll-tick'",
      ) &&
      JSON.stringify(w2bLogPollNode.parameters).includes(
        "poseNumber: ($json.poseNumber ?? null)",
      ),
    "Repo-centric W2B poll logger should report poll-tick events to the workflow-jobs route and preserve poseNumber 0 in the payload",
  );
  assert(
    JSON.stringify(w2bLogFailedNode.parameters).includes(
      "jobStatus: 'failed'",
    ) &&
      JSON.stringify(w2bLogCompleteNode.parameters).includes(
        "jobStatus: 'succeeded'",
      ) &&
      JSON.stringify(w2bLogFailedNode.parameters).includes(
        "poseNumber: ($json.poseNumber ?? null)",
      ) &&
      JSON.stringify(w2bLogCompleteNode.parameters).includes(
        "poseNumber: ($json.poseNumber ?? null)",
      ),
    "Repo-centric W2B terminal loggers should split failed and completed transitions explicitly and preserve poseNumber 0 in payload/result snapshots",
  );
  assert(
    w2bExtractTrackingConnections.includes("Log Workflow Job Submit") &&
      w2bDecidePollConnections.includes("Log Workflow Job Poll") &&
      w2bIfCompletedConnections.includes("Log Workflow Job Failed") &&
      w2bNormalizeScaleConnections.includes("Preserve Normalize Context") &&
      w2bPreserveNormalizeConnections.includes("Log Workflow Job Complete"),
    "Repo-centric W2B workflow should route submit, poll, failed, and completed branches through the workflow-job logger nodes with normalize-context rehydration before completion logging",
  );

  assert(
    w3Workflow.name === "REPO - w3-Book-Assembly",
    "Repo-centric W3 workflow should carry the repo-centric workflow name",
  );
  const w3GetReadyConnections = JSON.stringify(
    w3Workflow.connections?.["Get Order Ready for Assembly"] ?? {},
  );
  const w3IdempotencyCode = getCode(w3Workflow, "Idempotency Check");
  const w3ExtractAssemblyInputNode = getNode(
    w3Workflow,
    "Extract Manifest URL (3)",
  );
  const w3ExtractAssemblyInputCode = getCode(
    w3Workflow,
    "Extract Manifest URL (3)",
  );
  const w3BuildAssemblyInputCode = getCode(
    w3Workflow,
    "Build Assembly Input From Manifest",
  );
  const w3GetReadyCode = getCode(w3Workflow, "Get Order Ready for Assembly");
  const w3PreviewPlanCode = getCode(w3Workflow, "Load Canonical Assets");
  const w3PreviewPlanConnections = JSON.stringify(
    w3Workflow.connections?.["Load Canonical Assets"] ?? {},
  );
  const w3LoadStoryCode = getCode(w3Workflow, "Load Story & Character Poses (3A)");
  const w3NormalizeInputsCode = getCode(w3Workflow, "Normalize Inputs (3A Phase 1)1");
  const w3ResolveAssetsCode = getCode(w3Workflow, "Resolve Asset Paths (3A Phase 1)1");
  const w3GenerateCompleteAmazonCode = getCode(
    w3Workflow,
    "Generate Complete HTML (Amazon)",
  );
  const w3GenerateCompleteStandardCode = getCode(
    w3Workflow,
    "Generate Complete HTML (Standard)",
  );
  const w3GeneratePagesCode = getCode(w3Workflow, "Generate Page Preview Images");
  const w3GenerateCoverHtmlAmazonCode = getCode(
    w3Workflow,
    "Generate Cover HTML (AMAZON)",
  );
  const w3GenerateCoverHtmlStandardCode = getCode(
    w3Workflow,
    "Generate Cover HTML (STANDARD)",
  );
  const w3SetCoverCode = getCode(w3Workflow, "Set Cover PNG Filenames/Keys");
  const w3GeneratePageImageNode = getNode(
    w3Workflow,
    "Generate Page Image with PDFMonkey",
  );
  const w3GeneratePageImageCode = getCode(
    w3Workflow,
    "Generate Page Image with PDFMonkey",
  );
  const w3PagePollCode = getCode(w3Workflow, "Poll PDFMonkey Image until ready");
  const w3DownloadPageImageNode = getNode(
    w3Workflow,
    "Download Page Image from PDFMonkey",
  );
  const w3DownloadPageImageCode = getCode(
    w3Workflow,
    "Download Page Image from PDFMonkey",
  );
  const w3CarryPageKeysNode = getNode(
    w3Workflow,
    "Carry Page Keys Forward (PNG)",
  );
  const w3CarryPageKeysCode = getCode(
    w3Workflow,
    "Carry Page Keys Forward (PNG)",
  );
  const w3UploadPagePreviewNode = getNode(
    w3Workflow,
    "Upload Page Preview Image to R2",
  );
  const w3UploadPagePreviewCode = getCode(
    w3Workflow,
    "Upload Page Preview Image to R2",
  );
  const w3UploadPageCloudflareNode = getNode(
    w3Workflow,
    "Upload Preview Image to Cloudflare Images1",
  );
  const w3UploadPageCloudflareCode = getCode(
    w3Workflow,
    "Upload Preview Image to Cloudflare Images1",
  );
  const w3StorePageCloudflareNode = getNode(
    w3Workflow,
    "Store Cloudflare Images ID1",
  );
  const w3StorePageCloudflareCode = getCode(
    w3Workflow,
    "Store Cloudflare Images ID1",
  );
  const w3GenerateCoverNode = getNode(
    w3Workflow,
    "Generate Cover Image with PDFMonkey (3A)1",
  );
  const w3GenerateCoverCode = getCode(
    w3Workflow,
    "Generate Cover Image with PDFMonkey (3A)1",
  );
  const w3CoverPollCode = getCode(w3Workflow, "Poll Cover Image (3A)1");
  const w3DownloadCoverNode = getNode(
    w3Workflow,
    "Download Cover Image (3A)1",
  );
  const w3DownloadCoverCode = getCode(
    w3Workflow,
    "Download Cover Image (3A)1",
  );
  const w3CarryCoverNode = getNode(
    w3Workflow,
    "Carry Cover Keys Forward1",
  );
  const w3CarryCoverCode = getCode(
    w3Workflow,
    "Carry Cover Keys Forward1",
  );
  const w3UploadCoverNode = getNode(
    w3Workflow,
    "Upload Cover Preview Image to R2 (3A)1",
  );
  const w3UploadCoverCode = getCode(
    w3Workflow,
    "Upload Cover Preview Image to R2 (3A)1",
  );
  const w3UploadCoverCloudflareNode = getNode(
    w3Workflow,
    "Upload Preview Image to Cloudflare Images",
  );
  const w3UploadCoverCloudflareCode = getCode(
    w3Workflow,
    "Upload Preview Image to Cloudflare Images",
  );
  const w3StoreCoverCloudflareNode = getNode(
    w3Workflow,
    "Store Cloudflare Images ID",
  );
  const w3StoreCoverCloudflareCode = getCode(
    w3Workflow,
    "Store Cloudflare Images ID",
  );
  const w3CollectPreviewsCode = getCode(w3Workflow, "Collect Page Preview Images");
  const w3BuildManifestCode = getCode(w3Workflow, "Build 3A Manifest");
  const w3PublishManifestNode = getNode(w3Workflow, "Prep Manifest Upload (3)");
  const w3PublishManifestCode = getCode(w3Workflow, "Prep Manifest Upload (3)");
  const w3UploadManifestNode = getNode(w3Workflow, "Upload 3 Manifest to R2");
  const w3UploadManifestCode = getCode(w3Workflow, "Upload 3 Manifest to R2");
  const w3MergeReviewStagesNode = getNode(w3Workflow, "Fetch and Merge Review Stages (3)");
  const w3MergeReviewStagesCode = getCode(w3Workflow, "Fetch and Merge Review Stages (3)");
  const w3SupabaseUpsertNode = getNode(w3Workflow, "Supabase Upsert 3");
  const w3SupabaseUpsertCode = getCode(w3Workflow, "Supabase Upsert 3");
  const w3MarkReadyCode = getCode(w3Workflow, "Mark Previews Ready (3A status)");
  const w3CompleteCode = getCode(w3Workflow, "Complete Workflow Job (3)");
  const siblingW11PrepW3Code = getCode(
    siblingW11Workflow,
    "Prep Workflow 3 Orders",
  );
  const siblingW11VerifyClaimW3Code = getCode(
    siblingW11Workflow,
    "Verify Order Claimed (3)",
  );
  const siblingW11TriggerW3Node = getNode(
    siblingW11Workflow,
    "Trigger Workflow 3",
  );
  const w3SupabaseConnections = JSON.stringify(
    w3Workflow.connections?.["Supabase Upsert 3"] ?? {},
  );
  const w3CompleteConnections = JSON.stringify(
    w3Workflow.connections?.["Complete Workflow Job (3)"] ?? {},
  );

  assert(
    w3IdempotencyCode.includes("return $input.all();") &&
      !w3IdempotencyCode.includes("getWorkflowStaticData") &&
      w3ExtractAssemblyInputNode.type === "n8n-nodes-base.code" &&
      w3ExtractAssemblyInputCode.includes("this.helpers.httpRequest") &&
      w3ExtractAssemblyInputCode.includes("/api/internal/w3/build-assembly-input") &&
      w3ExtractAssemblyInputCode.includes("const payload = input.body ?? input") &&
      w3ExtractAssemblyInputCode.includes("body: payload") &&
      w3ExtractAssemblyInputCode.includes("json: true") &&
      w3ExtractAssemblyInputCode.includes("const normalized = response") &&
      w3ExtractAssemblyInputCode.includes("normalized.workflowSkipped === true") &&
      w3ExtractAssemblyInputCode.includes("return [];") &&
      w3ExtractAssemblyInputCode.includes(
        "Bearer e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646",
      ) &&
      w3BuildAssemblyInputCode.includes("return $input.all();") &&
      !w3BuildAssemblyInputCode.includes("parseJsonPrefix") &&
      !w3BuildAssemblyInputCode.includes(
        "Could not parse W3 assembly input response",
      ),
    "Repo-centric W3 should rely on the repo-owned build-assembly-input route for durable job idempotency and normalized assembly payloads, leaving the workflow entry nodes as thin adapters",
  );
  assert(
    w3GetReadyConnections.includes('"node":"Load Canonical Assets"') &&
      !w3GetReadyConnections.includes('"node":"Normalize Inputs (3A Phase 1)1"') &&
      w3GetReadyCode.includes("this.helpers.httpRequest") &&
      w3GetReadyCode.includes("/api/internal/w3/prepare-assembly-run") &&
      w3GetReadyCode.includes("const payload = input.body ?? input") &&
      w3GetReadyCode.includes("body: payload") &&
      !w3GetReadyCode.includes("Missing required order data: orderId or characterHash") &&
      !w3GetReadyCode.includes("No processed images received from Workflow 2B") &&
      w3PreviewPlanConnections.includes('"node":"Load Story & Character Poses (3A)"') &&
      w3PreviewPlanConnections.includes('"node":"Normalize Inputs (3A Phase 1)1"') &&
      w3PreviewPlanCode.includes("this.helpers.httpRequest") &&
      w3PreviewPlanCode.includes("/api/internal/w3/build-preview-plan") &&
      w3PreviewPlanCode.includes("body: {") &&
      w3PreviewPlanCode.includes("...j") &&
      w3PreviewPlanCode.includes("json: true") &&
      w3PreviewPlanCode.includes(
        "Bearer e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646",
      ),
    "Repo-centric W3 preview planning should be repo-owned behind the build-preview-plan route, with the workflow only fanning that response into the legacy cover/page branches",
  );
  assert(
    w3LoadStoryCode.includes("return $input.all();") &&
      w3NormalizeInputsCode.includes("return $input.all();") &&
      w3ResolveAssetsCode.includes("return $input.all();") &&
      w3GenerateCompleteAmazonCode.includes("return $input.all();") &&
      w3GenerateCompleteStandardCode.includes("return $input.all();") &&
      !w3GenerateCompleteAmazonCode.includes("const CHAR =") &&
      !w3NormalizeInputsCode.includes("dedicationMessage") &&
      !w3ResolveAssetsCode.includes("coversBgAmazon"),
    "Repo-centric W3 should no longer carry the large inline planning and HTML-building code blocks after the preview-plan extraction",
  );
  assert(
    w3GeneratePagesCode.includes("src.pagePreviewItems") &&
      w3GeneratePagesCode.includes("missing pagePreviewItems") &&
      !w3GeneratePagesCode.includes("interiorPagesHTML[] or pages_html is required") &&
      w3GenerateCoverHtmlAmazonCode.includes("coverPreviewItem") &&
      w3GenerateCoverHtmlStandardCode.includes("coverPreviewItem") &&
      w3SetCoverCode.includes("return $input.all();"),
    "Repo-centric W3 should treat page and cover preview items as repo-built envelopes, with only thin workflow selectors before the shared PDFMonkey transport nodes",
  );
  assert(
    w3GeneratePageImageNode.type === "n8n-nodes-base.code" &&
      w3GeneratePageImageCode.includes("this.helpers.httpRequest") &&
      w3GeneratePageImageCode.includes("/api/internal/w3/render-preview-document") &&
      w3GeneratePageImageCode.includes("documentKind: 'page-preview'") &&
      w3GeneratePageImageCode.includes("body: {") &&
      w3GeneratePageImageCode.includes("...j") &&
      w3GeneratePageImageCode.includes("json: true") &&
      w3GeneratePageImageCode.includes(
        "Bearer e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646",
      ),
    "Repo-centric W3 page preview generation should use a thin code-node adapter so the repo-owned render-preview endpoint always receives a real JSON object with backend bearer auth",
  );
  assert(
    w3GenerateCoverNode.type === "n8n-nodes-base.code" &&
      w3GenerateCoverCode.includes("this.helpers.httpRequest") &&
      w3GenerateCoverCode.includes("/api/internal/w3/render-preview-document") &&
      w3GenerateCoverCode.includes("documentKind: 'cover-preview'") &&
      w3GenerateCoverCode.includes("body: {") &&
      w3GenerateCoverCode.includes("...j") &&
      w3GenerateCoverCode.includes("json: true") &&
      w3GenerateCoverCode.includes(
        "Bearer e41d510ce6ed6e9c7f602fea860f2591cc7ec75fe63e448336a97c4b73898646",
      ),
    "Repo-centric W3 cover preview generation should use a thin code-node adapter so the repo-owned render-preview endpoint always receives a real JSON object with backend bearer auth",
  );
  assert(
    w3PagePollCode.includes("const current = $json || {}") &&
      w3PagePollCode.includes("const binary = $binary || {}") &&
      w3PagePollCode.includes("return {") &&
      !w3PagePollCode.includes("/api/internal/workflow-jobs/log-event") &&
      !w3PagePollCode.includes("externalProvider: 'pdfmonkey'"),
    "Repo-centric W3 page poll node should now be a pass-through because provider submit/poll logging moved into the repo-owned render-preview endpoint",
  );
  assert(
    w3CoverPollCode.includes("return $input.all();") &&
      !w3CoverPollCode.includes("/api/internal/workflow-jobs/log-event") &&
      !w3CoverPollCode.includes("externalProvider: 'pdfmonkey'"),
    "Repo-centric W3 cover poll node should now be a pass-through because provider submit/poll logging moved into the repo-owned render-preview endpoint",
  );
  assert(
    w3DownloadPageImageNode.type === "n8n-nodes-base.code" &&
      w3DownloadPageImageCode.includes("this.helpers.httpRequest") &&
      w3DownloadPageImageCode.includes("/api/internal/w3/materialize-preview-artifact") &&
      w3DownloadPageImageCode.includes("documentKind: 'page-preview'") &&
      w3CarryPageKeysNode.type === "n8n-nodes-base.code" &&
      w3CarryPageKeysCode.includes("return $input.all();") &&
      w3UploadPagePreviewNode.type === "n8n-nodes-base.code" &&
      w3UploadPagePreviewCode.includes("return $input.all();") &&
      w3UploadPageCloudflareNode.type === "n8n-nodes-base.code" &&
      w3UploadPageCloudflareCode.includes("return $input.all();") &&
      w3StorePageCloudflareNode.type === "n8n-nodes-base.code" &&
      w3StorePageCloudflareCode.includes("return $input.all();"),
    "Repo-centric W3 page preview artifact download and upload should now be repo-owned behind the materialize-preview-artifact route, with the legacy transport nodes reduced to thin pass-through adapters",
  );
  assert(
    w3DownloadCoverNode.type === "n8n-nodes-base.code" &&
      w3DownloadCoverCode.includes("this.helpers.httpRequest") &&
      w3DownloadCoverCode.includes("/api/internal/w3/materialize-preview-artifact") &&
      w3DownloadCoverCode.includes("documentKind: 'cover-preview'") &&
      w3CarryCoverNode.type === "n8n-nodes-base.code" &&
      w3CarryCoverCode.includes("return $input.all();") &&
      w3UploadCoverNode.type === "n8n-nodes-base.code" &&
      w3UploadCoverCode.includes("return $input.all();") &&
      w3UploadCoverCloudflareNode.type === "n8n-nodes-base.code" &&
      w3UploadCoverCloudflareCode.includes("return $input.all();") &&
      w3StoreCoverCloudflareNode.type === "n8n-nodes-base.code" &&
      w3StoreCoverCloudflareCode.includes("return $input.all();"),
    "Repo-centric W3 cover preview artifact download and upload should now be repo-owned behind the materialize-preview-artifact route, with the legacy transport nodes reduced to thin pass-through adapters",
  );
  assert(
    w3CollectPreviewsCode.includes("this.helpers.httpRequest") &&
      w3CollectPreviewsCode.includes("/api/internal/w3/collect-preview-images") &&
      w3CollectPreviewsCode.includes("previewItems = safeNodeItems('Generate Page Preview Images')") &&
      w3CollectPreviewsCode.includes("cloudflareItems = ($input.all() || []).map") &&
      w3CollectPreviewsCode.includes("body: {") &&
      w3CollectPreviewsCode.includes("current,") &&
      w3CollectPreviewsCode.includes("ready,") &&
      w3CollectPreviewsCode.includes("build,") &&
      !w3CollectPreviewsCode.includes("Collect Page Preview Images could not resolve current child orderId") &&
      !w3CollectPreviewsCode.includes("No preview items found for orderId="),
    "Repo-centric W3 preview collection should now be repo-owned behind the collect-preview-images route, with the workflow only forwarding the current preview and Cloudflare result sets",
  );
  assert(
    w3BuildManifestCode.includes("this.helpers.httpRequest") &&
      w3BuildManifestCode.includes("/api/internal/w3/build-manifest") &&
      w3BuildManifestCode.includes("$items('Load Canonical Assets'") &&
      w3BuildManifestCode.includes("...base") &&
      w3BuildManifestCode.includes("...current") &&
      w3BuildManifestCode.includes("json: true"),
    "Repo-centric W3 manifest assembly should be repo-owned behind the build-manifest route, with the workflow passing the collected preview artifacts plus the original preview-plan context",
  );
  assert(
    w3PublishManifestNode.type === "n8n-nodes-base.code" &&
      w3PublishManifestCode.includes("this.helpers.httpRequest") &&
      w3PublishManifestCode.includes("/api/internal/w3/publish-manifest") &&
      w3PublishManifestCode.includes("...current") &&
      w3PublishManifestCode.includes("json: true") &&
      w3UploadManifestNode.type === "n8n-nodes-base.code" &&
      w3UploadManifestCode.includes("return $input.all();") &&
      w3MergeReviewStagesNode.type === "n8n-nodes-base.code" &&
      w3MergeReviewStagesCode.includes("return $input.all();") &&
      w3SupabaseUpsertNode.type === "n8n-nodes-base.code" &&
      w3SupabaseUpsertCode.includes("return $input.all();") &&
      !w3PublishManifestCode.includes("Buffer.from(") &&
      !w3PublishManifestCode.includes("manifests/3-manifest.json") &&
      !w3MergeReviewStagesCode.includes("supabase.co/rest/v1/orders") &&
      !w3SupabaseUpsertCode.includes("resolution=merge-duplicates"),
    "Repo-centric W3 manifest publish and order persistence should now be repo-owned behind the publish-manifest route, with the legacy R2 and Supabase nodes reduced to thin pass-through adapters",
  );
  assert(
    w3MarkReadyCode.includes("this.helpers.httpRequest") &&
      w3MarkReadyCode.includes("/api/internal/w3/mark-previews-ready") &&
      w3MarkReadyCode.includes("const collected = safeNodeFirst('Collect Page Preview Images')") &&
      w3MarkReadyCode.includes("const prep = safeNodeFirst('Prep Manifest Upload (3)')") &&
      w3MarkReadyCode.includes("body: {") &&
      w3MarkReadyCode.includes("current,") &&
      w3MarkReadyCode.includes("collected,") &&
      w3MarkReadyCode.includes("ready,") &&
      w3MarkReadyCode.includes("prep,") &&
      !w3MarkReadyCode.includes("book_assembly_previews_ready") &&
      !w3MarkReadyCode.includes("averageTimePerPage"),
    "Repo-centric W3 preview-ready finalization should now be repo-owned behind the mark-previews-ready route, with the workflow only forwarding the collected preview state and manifest upload context",
  );
  assert(
    w3CompleteCode.includes("/api/webhooks/workflow-3-complete") &&
      w3CompleteCode.includes("j.manifest_3_url ||") &&
      w3CompleteCode.includes("j.manifest3Key ? backendUrl + '/api/manifests/' + j.manifest3Key : null") &&
      w3CompleteCode.includes("workflowJobCompletion") &&
      w3SupabaseConnections.includes('"node":"Complete Workflow Job (3)"') &&
      w3CompleteConnections.includes('"node":"Mark Previews Ready (3A status)"'),
    "Repo-centric W3 finalization should accept persisted manifest fields after the repo-owned publish-manifest route and call the backend workflow-3-complete webhook so workflow_jobs are marked complete before downstream status logging",
  );
  assert(
    siblingW11PrepW3Code.includes("const oneManifestKey = firstNonEmpty") &&
      siblingW11PrepW3Code.includes("const manifest2bUrl = firstNonEmpty") &&
      siblingW11PrepW3Code.includes("const manifest3Url = firstNonEmpty") &&
      siblingW11PrepW3Code.includes("const orderPrefix = extractOrderPrefix") &&
      siblingW11PrepW3Code.includes("missing W3 manifest context") &&
      siblingW11PrepW3Code.includes("error_type: 'missing_manifest_context'") &&
      siblingW11PrepW3Code.includes("manifest3Url: manifest3Url || undefined") &&
      siblingW11PrepW3Code.includes("assetPrefix: assetPrefix || undefined") &&
      !siblingW11PrepW3Code.includes("missing 1-manifest.json") &&
      !siblingW11PrepW3Code.includes("const prefix = 'book-mvp-simple-adventure/orders'"),
    "Sibling W1.1 W3 prep should forward manifest/path hints into the repo-owned W3 resolver and only hard-fail when all usable W3 manifest context is missing",
  );
  assert(
    siblingW11VerifyClaimW3Code.includes("rootOrderId: row.rootOrderId") &&
      siblingW11VerifyClaimW3Code.includes("orderPrefix: row.orderPrefix") &&
      siblingW11VerifyClaimW3Code.includes("manifest2bUrl: row.manifest2bUrl") &&
      siblingW11VerifyClaimW3Code.includes("manifest3Url: row.manifest3Url") &&
      siblingW11VerifyClaimW3Code.includes("oneManifestUrl: row.oneManifestUrl") &&
      siblingW11VerifyClaimW3Code.includes("assetPrefix: row.assetPrefix"),
    "Sibling W1.1 W3 claim verification should preserve the manifest/path hints produced by prep before posting into the repo-owned W3 webhook",
  );
  assert(
    siblingW11TriggerW3Node.parameters?.url ===
      "https://thepeakbeyond.app.n8n.cloud/webhook/book-assembly-repo",
    "Sibling W1.1 should trigger the active repo-owned W3 webhook path instead of the legacy book-assembly-sibtest endpoint",
  );

  console.log("W2/W3 workflow contract checks passed");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
