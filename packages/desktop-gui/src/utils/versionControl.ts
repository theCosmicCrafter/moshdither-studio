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
