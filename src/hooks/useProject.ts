import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useAppStore, type StackEntry } from "../store";
import { logger } from "../utils/logger";

export interface ProjectFile {
  version: number;
  createdAt: string;
  effectStack: StackEntry[];
  keyframes: Record<
    string,
    Record<string, { id: string; time: number; value: number; easing: string }[]>
  >;
  audioBindings: Record<string, Record<string, unknown>>;
  mediaFilePath: string | null;
  activeMask: string | null;
}

const PROJECT_VERSION = 1;

export function useProject() {
  const effectStack = useAppStore((s) => s.effectStack);
  const keyframes = useAppStore((s) => s.keyframes);
  const audioBindings = useAppStore((s) => s.audioBindings);
  const filePath = useAppStore((s) => s.filePath);
  const activeMask = useAppStore((s) => s.activeMask);
  const setFilePath = useAppStore((s) => s.setFilePath);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const allEffects = useAppStore((s) => s.allEffects);

  const saveProject = useCallback(async () => {
    try {
      logger.log("SAVE", "Opening save dialog...");
      const path = await save({
        filters: [{ name: "MoshDither Project", extensions: ["moshdither"] }],
        defaultPath: "project.moshdither",
      });
      logger.log("SAVE", "Dialog returned path", { path });
      if (!path) {
        logger.log("SAVE", "No path returned (user cancelled?)");
        return false;
      }

      const project: ProjectFile = {
        version: PROJECT_VERSION,
        createdAt: new Date().toISOString(),
        effectStack: JSON.parse(JSON.stringify(effectStack)),
        keyframes: JSON.parse(JSON.stringify(keyframes)),
        audioBindings: JSON.parse(JSON.stringify(audioBindings)),
        mediaFilePath: filePath,
        activeMask,
      };

      logger.log("SAVE", "Project object built, calling save_file...");
      await invoke("save_file", { path, contents: JSON.stringify(project, null, 2) });
      logger.log("SAVE", "save_file succeeded");
      setStatusMessage(`Project saved: ${path}`);
      return true;
    } catch (err) {
      logger.error("SAVE", "Save failed", { err });
      setStatusMessage(`Save failed: ${err}`);
      return false;
    }
  }, [effectStack, keyframes, audioBindings, filePath, activeMask, setStatusMessage]);

  const openProject = useCallback(async () => {
    try {
      const path = await open({
        filters: [{ name: "MoshDither Project", extensions: ["moshdither"] }],
        multiple: false,
      });
      if (!path || typeof path !== "string") return false;

      const raw = await invoke<string>("read_file", { path });

      // Validate BEFORE touching the user's work.
      //
      // This used to `clearStack()` first and rebuild inside a setTimeout with
      // no shape check and no try/catch, then report "Project loaded". A file
      // containing `{}` -- an older project, a truncated write, anything not a
      // project at all -- wiped the open stack, claimed success, and threw
      // "project.effectStack is not iterable" a tick later, with the autosave
      // overwritten five seconds after that.
      let project: ProjectFile;
      try {
        project = JSON.parse(raw) as ProjectFile;
      } catch {
        setStatusMessage(`Could not open that file: it is not valid project data`, "error");
        return false;
      }
      if (!project || typeof project !== "object" || !Array.isArray(project.effectStack)) {
        setStatusMessage(`Could not open that file: it is not a MoshDither project`, "error");
        return false;
      }

      if (project.version !== PROJECT_VERSION) {
        setStatusMessage(`Warning: project version ${project.version} may not be fully compatible`);
      }

      // Build the whole stack first, then swap it in as ONE undoable step.
      // Nothing is cleared unless the rebuild succeeds.
      const store = useAppStore.getState();
      const restored: StackEntry[] = [];
      let skipped = 0;
      for (const entry of project.effectStack) {
        if (!entry || typeof entry !== "object" || typeof entry.effectId !== "string") {
          skipped++;
          continue;
        }
        const effect = allEffects.find((e) => e.id === entry.effectId);
        if (!effect) {
          // An effect that no longer exists in this build. Skipping it is
          // right, but the user has to be told the look is not what was saved.
          skipped++;
          continue;
        }
        restored.push({
          id: `${entry.effectId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          effectId: entry.effectId,
          effectName: effect.name ?? entry.effectName ?? entry.effectId,
          params: entry.params ? JSON.parse(JSON.stringify(entry.params)) : {},
          enabled: entry.enabled !== false,
          maskId: entry.maskId ?? null,
          // The saved snapshot, not a recomputed one: setStackItemMask resolves
          // maskB64 from the CURRENT activeMask/sam3Masks, and SAM3 masks are
          // session-local, so a "sam3-N" assignment would come back empty.
          maskB64: entry.maskB64 ?? null,
          maskMode: entry.maskMode ?? "inside",
        });
      }

      store.replaceStack(restored);
      if (project.keyframes)
        store.setKeyframes(project.keyframes as Record<string, import("../store").KeyframeTrack>);
      if (project.audioBindings)
        store.setAudioBindings(
          project.audioBindings as Record<string, Record<string, import("../store").AudioBinding>>
        );
      if (project.activeMask !== undefined) store.setActiveMask(project.activeMask);

      if (project.mediaFilePath) {
        setFilePath(project.mediaFilePath);
        // Actually load it. Setting the path alone left the app showing the
        // previously-open file while every operation targeted the new one --
        // and it still said "Project loaded".
        store.requestMediaReload();
      }

      setStatusMessage(
        skipped > 0
          ? `Project loaded: ${path} (${skipped} effect${skipped === 1 ? "" : "s"} from this file are not in this version and were left out)`
          : `Project loaded: ${path}`
      );
      return true;
    } catch (err) {
      setStatusMessage(`Open failed: ${err}`);
      return false;
    }
  }, [allEffects, setFilePath, setStatusMessage]);

  return { saveProject, openProject };
}
