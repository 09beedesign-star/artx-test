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
const SESSION_FALLBACK_KEY = "artx:workspace-project-history:fallback";
const MAX_HISTORY_PROJECTS = 40;
const MAX_COVER_LENGTH = 180_000;

function formatTimestamp(date = new Date()) {
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

export function readWorkspaceProjectHistory(): WorkspaceHistoryProject[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY) || window.sessionStorage.getItem(SESSION_FALLBACK_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is WorkspaceHistoryProject => {
      return Boolean(item && typeof item.id === "string" && typeof item.title === "string");
    }).map(normalizeWorkspaceHistoryProject);
  } catch {
    return [];
  }
}

function normalizeCover(cover: unknown) {
  if (typeof cover !== "string" || !cover) return null;
  return cover.length <= MAX_COVER_LENGTH ? cover : null;
}

function normalizeWorkspaceHistoryProject(project: WorkspaceHistoryProject): WorkspaceHistoryProject {
  return {
    ...project,
    cover: normalizeCover(project.cover),
  };
}

function compactWorkspaceProjectHistory(projects: WorkspaceHistoryProject[], keepCovers: boolean) {
  return projects.slice(0, MAX_HISTORY_PROJECTS).map(project => ({
    ...normalizeWorkspaceHistoryProject(project),
    cover: keepCovers ? normalizeCover(project.cover) : null,
  }));
}

function writeWorkspaceProjectHistory(projects: WorkspaceHistoryProject[]) {
  if (typeof window === "undefined") return;
  const attempts = [
    compactWorkspaceProjectHistory(projects, true),
    compactWorkspaceProjectHistory(projects, false),
    compactWorkspaceProjectHistory(projects.slice(0, 20), false),
    compactWorkspaceProjectHistory(projects.slice(0, 8), false),
  ];
  for (const attempt of attempts) {
    const serialized = JSON.stringify(attempt);
    try {
      window.localStorage.setItem(STORAGE_KEY, serialized);
      window.sessionStorage.removeItem(SESSION_FALLBACK_KEY);
      return;
    } catch {
      try {
        window.sessionStorage.setItem(SESSION_FALLBACK_KEY, serialized);
      } catch {
        /* try a smaller history payload */
      }
    }
  }
}

export function upsertWorkspaceProjectHistory(project: WorkspaceHistoryProject) {
  const projects = readWorkspaceProjectHistory().filter(item => item.id !== project.id);
  writeWorkspaceProjectHistory([normalizeWorkspaceHistoryProject(project), ...projects]);
}

export function updateWorkspaceProjectHistory(id: string, patch: Partial<WorkspaceHistoryProject>) {
  const projects = readWorkspaceProjectHistory();
  const existingIndex = projects.findIndex(item => item.id === id);
  if (existingIndex >= 0) {
    projects[existingIndex] = normalizeWorkspaceHistoryProject({ ...projects[existingIndex], ...patch });
    writeWorkspaceProjectHistory(projects);
    return;
  }

  const createdAt = patch.createdAt || formatTimestamp();
  const project: WorkspaceHistoryProject = {
    id,
    title: patch.title || `新建画布 ${createdAt}`,
    cover: normalizeCover(patch.cover),
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
