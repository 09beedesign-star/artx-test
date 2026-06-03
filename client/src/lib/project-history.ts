export interface WorkspaceHistoryProject {
  id: string;
  title: string;
  cover: string | null;
  updatedAt: string;
  nodeCount: number;
  createdAt: string;
  initialPrompt?: string;
}

const STORAGE_KEY = "artx:workspace-project-history";

function formatTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function readWorkspaceProjectHistory(): WorkspaceHistoryProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WorkspaceHistoryProject => {
      return Boolean(item && typeof item.id === "string" && typeof item.title === "string");
    });
  } catch {
    return [];
  }
}

function writeWorkspaceProjectHistory(projects: WorkspaceHistoryProject[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
}

export function upsertWorkspaceProjectHistory(project: WorkspaceHistoryProject) {
  const projects = readWorkspaceProjectHistory().filter(item => item.id !== project.id);
  writeWorkspaceProjectHistory([project, ...projects]);
}

export function updateWorkspaceProjectHistory(id: string, patch: Partial<WorkspaceHistoryProject>) {
  const projects = readWorkspaceProjectHistory();
  const existingIndex = projects.findIndex(item => item.id === id);
  if (existingIndex >= 0) {
    projects[existingIndex] = { ...projects[existingIndex], ...patch };
    writeWorkspaceProjectHistory(projects);
    return;
  }

  const createdAt = patch.createdAt || formatTimestamp();
  const project: WorkspaceHistoryProject = {
    id,
    title: patch.title || `新建画布 ${createdAt}`,
    cover: patch.cover ?? null,
    updatedAt: patch.updatedAt || createdAt,
    nodeCount: patch.nodeCount ?? 0,
    createdAt,
    initialPrompt: patch.initialPrompt,
  };
  writeWorkspaceProjectHistory([project, ...projects]);
}

export function removeWorkspaceProjectHistory(ids: string[]) {
  const idSet = new Set(ids);
  writeWorkspaceProjectHistory(readWorkspaceProjectHistory().filter(item => !idSet.has(item.id)));
}

export function createWorkspaceHistoryProject(title?: string, initialPrompt?: string): WorkspaceHistoryProject {
  const createdAt = formatTimestamp();
  const project: WorkspaceHistoryProject = {
    id: `canvas-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: title || `新建画布 ${createdAt}`,
    cover: null,
    updatedAt: createdAt,
    nodeCount: 0,
    createdAt,
    initialPrompt,
  };
  upsertWorkspaceProjectHistory(project);
  return project;
}
