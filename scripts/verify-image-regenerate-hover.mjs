import { readFileSync } from "node:fs";

const source = readFileSync(new URL("../client/src/components/canvas/InfiniteCanvas.tsx", import.meta.url), "utf8");

const requiredPatterns = [
  ["regenerate detail type", /type ImageRegenerateRequestDetail = \{/],
  ["generation metadata helper", /function getImageGenerationNodeMetadata\(detail: ImageGeneratorPayload\)/],
  ["regenerable node guard", /function getRegenerableImageNodeDetail\(nodeId: string, data: Record<string, unknown>/],
  ["hover button label", /aria-label="再次生成"/],
  ["hover button size", /width: 60,[\s\S]*?height: 60/],
  ["green button color", /background: "#C5ED47"/],
  ["request event dispatch", /new CustomEvent<ImageRegenerateRequestDetail>\("asset-regenerate-request"/],
  ["request listener", /window\.addEventListener\("asset-regenerate-request", handleAssetRegenerateRequest\)/],
  ["edit metadata source image", /generationSourceImageSrc: detail\.sourceImageSrc \|\| detail\.sourceBackgroundSrc/],
  ["edit mode metadata", /generationEditMode: detail\.editMode === true/],
  ["edit-mode skips background text-to-image", /if \(detail\.editMode !== true\) \{[\s\S]*?ensureBackgroundImageGeneration/],
  ["edit-mode regenerate uses image edit", /if \(detail\.editMode && detail\.imageSrc\) \{[\s\S]*?editImageWithPrompt/],
  ["single image result only", /const requestedCount = 1;[\s\S]*?\.slice\(0, requestedCount\)/],
  ["failed branch refreshes current node", /if \(detail\.status === "failed"\)[\s\S]*?setNodes\(nds => nds\.map/],
  ["failed branch creates fresh task id", /const generationId = `image-regenerate-\$\{startedAt\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 7\)\}`/],
  ["failed branch clears old image", /localSrc: undefined/],
  ["completed branch creates new task", /const generationId = `regenerate-\$\{startedAt\}-\$\{Math\.random\(\)\.toString\(36\)\.slice\(2, 7\)\}`[\s\S]*?dispatchImageGenerationTask/],
];

for (const [label, pattern] of requiredPatterns) {
  if (!pattern.test(source)) {
    throw new Error(`Image regenerate hover behavior missing: ${label}`);
  }
}

if (/label: "智能编辑", action: "quick-edit"/.test(source)) {
  throw new Error("Asset floating toolbar should not expose the 智能编辑 command.");
}

console.log("Image nodes expose hover regenerate with success/new-node and failure/in-place behavior.");
