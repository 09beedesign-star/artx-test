import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  CrossBorderComposeInput,
  CrossBorderGenerationContext,
} from "../shared/cross-border-commerce-agent";

export type CrossBorderCommerceGenerationRecord = {
  id: string;
  userId?: string;
  username?: string;
  createdAt: string;
  input: CrossBorderComposeInput;
  marketPackageVersion: string;
  platformSpecVersion: string;
  templateVersion: string;
  riskConclusion: CrossBorderGenerationContext["risk"];
  skillId: CrossBorderGenerationContext["skillId"];
  finalPrompt: string;
};

const DATA_DIR =
  process.env.ARTX_DATA_DIR || path.join(process.cwd(), ".artx-data");
const RECORDS_FILE = path.join(
  DATA_DIR,
  "cross-border-commerce-generations.json"
);

async function readRecords(): Promise<
  CrossBorderCommerceGenerationRecord[]
> {
  try {
    const parsed = JSON.parse(await fs.readFile(RECORDS_FILE, "utf8"));
    return Array.isArray(parsed) ? parsed : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

export async function recordCrossBorderCommerceGeneration(input: {
  request: CrossBorderComposeInput;
  context: CrossBorderGenerationContext;
  user?: { id: string; username: string };
}) {
  const record: CrossBorderCommerceGenerationRecord = {
    id: crypto.randomUUID(),
    userId: input.user?.id,
    username: input.user?.username,
    createdAt: new Date().toISOString(),
    input: input.request,
    marketPackageVersion: input.context.marketPackageVersion,
    platformSpecVersion: input.context.placement.size.source.verifiedAt,
    templateVersion: input.context.template.trendEvidence.validUntil,
    riskConclusion: input.context.risk,
    skillId: input.context.skillId,
    finalPrompt: input.context.prompt,
  };
  const records = await readRecords();
  records.push(record);
  await fs.mkdir(DATA_DIR, { recursive: true });
  const temporaryFile = `${RECORDS_FILE}.tmp`;
  await fs.writeFile(
    temporaryFile,
    `${JSON.stringify(records.slice(-1000), null, 2)}\n`,
    "utf8"
  );
  await fs.rename(temporaryFile, RECORDS_FILE);
  return record;
}
