import { normalizeApiBaseUrl } from "./api-base-url";

export type ArtxBuildInfo = {
  app: string;
  environment: string;
  commitSha: string;
  shortCommit: string;
  branch: string;
  buildTime: string;
  repository: string;
  githubRunId: string;
  frontendUrl: string;
  backendUrl: string;
  pagesBasePath: string;
};

export const buildInfo: ArtxBuildInfo = {
  app: "artx",
  environment: import.meta.env.VITE_DEPLOY_ENV || (import.meta.env.PROD ? "production" : "local"),
  commitSha: import.meta.env.VITE_COMMIT_SHA || "local",
  shortCommit: (import.meta.env.VITE_COMMIT_SHA || "local").slice(0, 7),
  branch: import.meta.env.VITE_DEPLOY_BRANCH || "local",
  buildTime: import.meta.env.VITE_BUILD_TIME || new Date().toISOString(),
  repository: import.meta.env.VITE_DEPLOY_REPOSITORY || "",
  githubRunId: import.meta.env.VITE_GITHUB_RUN_ID || "",
  frontendUrl: import.meta.env.VITE_TEST_FRONTEND_URL || "https://backstage.artxsd.com",
  backendUrl: normalizeApiBaseUrl(import.meta.env.VITE_TEST_BACKEND_URL || import.meta.env.VITE_API_BASE_URL || "https://backstage.artxsd.com"),
  pagesBasePath: import.meta.env.BASE_URL,
};

declare global {
  interface Window {
    __ARTX_BUILD__?: ArtxBuildInfo;
  }
}

export function exposeBuildInfo() {
  if (typeof window === "undefined") return;

  window.__ARTX_BUILD__ = buildInfo;
  document.documentElement.dataset.artxCommit = buildInfo.shortCommit;
  document.documentElement.dataset.artxEnv = buildInfo.environment;

  if (import.meta.env.PROD) {
    console.info(
      `[ArtX] build ${buildInfo.shortCommit} (${buildInfo.branch}) ${buildInfo.buildTime}; backend ${buildInfo.backendUrl}`,
    );
  }
}
