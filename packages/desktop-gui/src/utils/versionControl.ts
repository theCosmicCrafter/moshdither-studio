/**
 * Version Control Integration for MoshDither Studio.
 *
 * Provides Git-friendly project file format (.moshproject)
 * and optional Git LFS support for large video assets.
 */

export interface MoshProjectFile {
  version: string;
  name: string;
  createdAt: string;
  modifiedAt: string;
  effects: Array<{
    id: string;
    type: string;
    enabled: boolean;
    params: Record<string, unknown>;
  }>;
  mediaReferences: Array<{
    id: string;
    path: string; // Relative path from project root
    hash: string; // SHA-256 of file content (for integrity)
  }>;
  settings: {
    outputFormat: string;
    quality: string;
    fps: number;
  };
}

export interface ProjectBranch {
  name: string;
  createdAt: string;
  projectSnapshot: MoshProjectFile;
  description?: string;
}

export interface GitLfsStatus {
  installed: boolean;
  initialized: boolean;
  trackedPatterns: string[];
}

/**
 * Create a .moshproject JSON blob from current project state.
 */
export function serializeProject(
  name: string,
  effects: MoshProjectFile["effects"],
  mediaRefs: MoshProjectFile["mediaReferences"],
  settings: MoshProjectFile["settings"],
): string {
  const project: MoshProjectFile = {
    version: "1.0.0",
    name,
    createdAt: new Date().toISOString(),
    modifiedAt: new Date().toISOString(),
    effects,
    mediaReferences: mediaRefs,
    settings,
  };
  return JSON.stringify(project, null, 2);
}

/**
 * Parse a .moshproject file.
 */
export function deserializeProject(json: string): MoshProjectFile | null {
  try {
    const parsed = JSON.parse(json) as MoshProjectFile;
    if (!parsed.version || !parsed.effects) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generate a .gitattributes snippet for Git LFS tracking
 * of large media files referenced by the project.
 */
export function generateGitAttributes(): string {
  return `# MoshDither Git LFS tracking
*.mp4 filter=lfs diff=lfs merge=lfs -text
*.mov filter=lfs diff=lfs merge=lfs -text
*.avi filter=lfs diff=lfs merge=lfs -text
*.mkv filter=lfs diff=lfs merge=lfs -text
*.webm filter=lfs diff=lfs merge=lfs -text
*.png filter=lfs diff=lfs merge=lfs -text
*.jpg filter=lfs diff=lfs merge=lfs -text
*.exr filter=lfs diff=lfs merge=lfs -text
*.prores filter=lfs diff=lfs merge=lfs -text
*.moshproject text eol=lf
`;
}

/**
 * Generate a .gitignore snippet for the project.
 */
export function generateGitIgnore(): string {
  return `# MoshDither project ignore rules
outputs/
renders/
.moshdither/
*.log
node_modules/
`;
}

// ---------------------------------------------------------------------------
// Project branching (local snapshots)
// ---------------------------------------------------------------------------

const BRANCHES_KEY = "moshdither:projectBranches";

function loadBranches(): Record<string, ProjectBranch[]> {
  try {
    const saved = localStorage.getItem(BRANCHES_KEY);
    return saved ? JSON.parse(saved) : {};
  } catch {
    return {};
  }
}

function saveBranches(branches: Record<string, ProjectBranch[]>): void {
  try {
    localStorage.setItem(BRANCHES_KEY, JSON.stringify(branches));
  } catch {
    /* ignore quota exceeded */
  }
}

export function createBranch(
  projectId: string,
  branchName: string,
  snapshot: MoshProjectFile,
  description?: string,
): ProjectBranch {
  const branches = loadBranches();
  const list = branches[projectId] || [];
  const branch: ProjectBranch = {
    name: branchName,
    createdAt: new Date().toISOString(),
    projectSnapshot: snapshot,
    description,
  };
  list.push(branch);
  branches[projectId] = list;
  saveBranches(branches);
  return branch;
}

export function getBranches(projectId: string): ProjectBranch[] {
  return loadBranches()[projectId] || [];
}

export function deleteBranch(projectId: string, branchName: string): void {
  const branches = loadBranches();
  if (branches[projectId]) {
    branches[projectId] = branches[projectId].filter(
      (b) => b.name !== branchName,
    );
    saveBranches(branches);
  }
}

export function restoreBranch(
  projectId: string,
  branchName: string,
): MoshProjectFile | null {
  const branches = loadBranches();
  const branch = branches[projectId]?.find((b) => b.name === branchName);
  return branch ? branch.projectSnapshot : null;
}

// ---------------------------------------------------------------------------
// Diff detection
// ---------------------------------------------------------------------------

export interface ProjectDiff {
  effectsAdded: string[];
  effectsRemoved: string[];
  effectsChanged: string[];
  mediaAdded: string[];
  mediaRemoved: string[];
  settingsChanged: boolean;
}

export function diffProjects(
  oldProj: MoshProjectFile,
  newProj: MoshProjectFile,
): ProjectDiff {
  const oldEffectIds = new Set(oldProj.effects.map((e) => e.id));
  const newEffectIds = new Set(newProj.effects.map((e) => e.id));
  const effectsAdded = newProj.effects
    .filter((e) => !oldEffectIds.has(e.id))
    .map((e) => e.id);
  const effectsRemoved = oldProj.effects
    .filter((e) => !newEffectIds.has(e.id))
    .map((e) => e.id);

  const effectsChanged: string[] = [];
  for (const newFx of newProj.effects) {
    const oldFx = oldProj.effects.find((e) => e.id === newFx.id);
    if (oldFx && JSON.stringify(oldFx) !== JSON.stringify(newFx)) {
      effectsChanged.push(newFx.id);
    }
  }

  const oldMediaIds = new Set(oldProj.mediaReferences.map((m) => m.id));
  const newMediaIds = new Set(newProj.mediaReferences.map((m) => m.id));
  const mediaAdded = newProj.mediaReferences
    .filter((m) => !oldMediaIds.has(m.id))
    .map((m) => m.id);
  const mediaRemoved = oldProj.mediaReferences
    .filter((m) => !newMediaIds.has(m.id))
    .map((m) => m.id);

  const settingsChanged =
    JSON.stringify(oldProj.settings) !== JSON.stringify(newProj.settings);

  return {
    effectsAdded,
    effectsRemoved,
    effectsChanged,
    mediaAdded,
    mediaRemoved,
    settingsChanged,
  };
}

// ---------------------------------------------------------------------------
// Git LFS status helpers
// ---------------------------------------------------------------------------

export async function checkGitLfsStatus(): Promise<GitLfsStatus> {
  if (!window.ipcRenderer) {
    return { installed: false, initialized: false, trackedPatterns: [] };
  }
  try {
    return await window.ipcRenderer.invoke("git:lfs-status");
  } catch {
    return { installed: false, initialized: false, trackedPatterns: [] };
  }
}

export async function initGitLfs(projectPath: string): Promise<boolean> {
  if (!window.ipcRenderer) return false;
  try {
    return await window.ipcRenderer.invoke("git:init-lfs", projectPath);
  } catch {
    return false;
  }
}

export async function writeGitAttributes(
  projectPath: string,
): Promise<boolean> {
  if (!window.ipcRenderer) return false;
  try {
    return await window.ipcRenderer.invoke(
      "git:write-attributes",
      projectPath,
      generateGitAttributes(),
    );
  } catch {
    return false;
  }
}
