import { invoke } from "@tauri-apps/api/core";
import { open, save } from "@tauri-apps/plugin-dialog";
import { useCallback } from "react";
import { useAppStore, type StackEntry } from "../store";
import { logger } from "../utils/logger";
import { clearAutoSave } from "./useProjectSession";

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
  audioFilePath?: string | null;
  inPoint?: number | null;
  outPoint?: number | null;
  ffglitchMode?: string;
  ffglitchParams?: Record<string, Record<string, number | boolean | string>>;
  exportFormat?: string;
  exportQuality?: "draft" | "good" | "best";
  viewportGuides?: {
    safeArea: boolean;
    ruleOfThirds: boolean;
    crosshairs: boolean;
    pixelGrid: boolean;
  };
  watermark?: import("../utils/watermark").WatermarkSettings | null;
}

const PROJECT_VERSION = 1;

export function useProject() {
  const setFilePath = useAppStore((s) => s.setFilePath);
  const setStatusMessage = useAppStore((s) => s.setStatusMessage);
  const allEffects = useAppStore((s) => s.allEffects);

  const saveProject = useCallback(
    async (saveAs = false) => {
      try {
        const store = useAppStore.getState();
        let path = store.currentProjectPath;

        if (saveAs || !path) {
          logger.log("SAVE", "Opening save dialog...");
          path = await save({
            filters: [{ name: "MoshDither Project", extensions: ["moshdither"] }],
            defaultPath: path ?? "project.moshdither",
          });
          logger.log("SAVE", "Dialog returned path", { path });
          if (!path || typeof path !== "string") {
            logger.log("SAVE", "No path returned (user cancelled?)");
            return false;
          }
          store.setCurrentProjectPath(path);
        }

        const project: ProjectFile = {
          version: PROJECT_VERSION,
          createdAt: new Date().toISOString(),
          effectStack: JSON.parse(JSON.stringify(store.effectStack)),
          keyframes: JSON.parse(JSON.stringify(store.keyframes)),
          audioBindings: JSON.parse(JSON.stringify(store.audioBindings)),
          mediaFilePath: store.filePath,
          activeMask: store.activeMask,
          audioFilePath: store.audioFilePath,
          inPoint: store.inPoint,
          outPoint: store.outPoint,
          ffglitchMode: store.ffglitchMode,
          ffglitchParams: JSON.parse(JSON.stringify(store.ffglitchParams)),
          exportFormat: store.exportFormat,
          exportQuality: store.exportQuality,
          viewportGuides: JSON.parse(JSON.stringify(store.viewportGuides)),
          watermark: JSON.parse(JSON.stringify(store.watermark)),
        };

        logger.log("SAVE", "Project object built, calling save_file...");
        await invoke("save_file", { path, contents: JSON.stringify(project, null, 2) });
        logger.log("SAVE", "save_file succeeded");
        clearAutoSave();
        setStatusMessage(`Project saved: ${path}`);
        return true;
      } catch (err) {
        logger.error("SAVE", "Save failed", { err });
        setStatusMessage(`Save failed: ${err}`);
        return false;
      }
    },
    [setStatusMessage]
  );

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

      if (project.audioFilePath !== undefined) {
        store.setAudioFilePath(project.audioFilePath);
      }
      // In/out have to wait for the media's real length: setInPoint and
      // setOutPoint clamp against `duration`, which right now is still the
      // PREVIOUS media's (or the store default). setDuration applies these
      // once the probe comes back. With no media to load there is nothing to
      // wait for, so they are applied directly.
      if (project.inPoint !== undefined || project.outPoint !== undefined) {
        const points = {
          inPoint: project.inPoint ?? null,
          outPoint: project.outPoint ?? null,
        };
        if (project.mediaFilePath) {
          store.setPendingInOut(points);
        } else {
          store.setInPoint(points.inPoint);
          store.setOutPoint(points.outPoint);
        }
      } else {
        // A project without them must not inherit the last session's range.
        store.setPendingInOut(null);
        store.clearInOut();
      }
      if (project.ffglitchMode) {
        store.setFfglitchMode(project.ffglitchMode);
      }
      if (project.ffglitchParams) {
        for (const [mode, params] of Object.entries(project.ffglitchParams)) {
          for (const [paramId, val] of Object.entries(params)) {
            store.setFfglitchParam(mode, paramId, val);
          }
        }
      }
      if (project.exportFormat) {
        store.setExportFormat(project.exportFormat);
      }
      if (project.exportQuality) {
        store.setExportQuality(project.exportQuality);
      }
      if (project.viewportGuides) {
        store.setViewportGuides(project.viewportGuides);
      }
      if (project.watermark) {
        store.setWatermark(project.watermark);
      }
      store.setCurrentProjectPath(path);

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
