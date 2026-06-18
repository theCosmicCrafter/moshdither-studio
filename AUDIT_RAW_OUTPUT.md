============================================================
MoshDither Studio ù CrewAI Multi-Agent Audit
============================================================
+-------------------------[CrewAIEventsBus] Sync handler error in on_crew_started: 'charmap' codec can't 
encode character '\U0001f680' in position 1: character maps to <undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_task_started: 'charmap' codec can't 
encode character '\U0001f4cb' in position 1: character maps to <undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_started: 'charmap' codec 
can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
[35m[Finalize] todos_count=0, todos_with_results=0[0m
+------------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_execution: 'charmap' 
codec can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_task_completed: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_task_started: 'charmap' codec can't 
encode character '\U0001f680' in position 1: character maps to <undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_started: 'charmap' codec 
can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
[35m[Finalize] todos_count=0, todos_with_results=0[0m
+------------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_execution: 'charmap' 
codec can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_task_completed: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_task_started: 'charmap' codec can't 
encode character '\U0001f680' in position 1: character maps to <undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_started: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
[35m[Finalize] todos_count=0, todos_with_results=0[0m
+-------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_execution: 'charmap' 
codec can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_task_completed: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_task_started: 'charmap' codec can't 
encode character '\U0001f680' in position 1: character maps to <undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_started: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
[35m[Finalize] todos_count=0, todos_with_results=0[0m
+-------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_execution: 'charmap' 
codec can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_task_completed: 'charmap' codec 
can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_task_started: 'charmap' codec can't 
encode character '\U0001f4cb' in position 1: character maps to <undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_started: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
[35m[Finalize] todos_count=0, todos_with_results=0[0m
+-------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_execution: 'charmap' 
codec can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_task_completed: 'charmap' codec 
can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_task_started: 'charmap' codec can't 
encode character '\U0001f4cb' in position 1: character maps to <undefined>
+------------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_started: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
[35m[Finalize] todos_count=0, todos_with_results=0[0m
+-------------------------[CrewAIEventsBus] Sync handler error in on_agent_logs_execution: 'charmap' 
codec can't encode character '\U0001f680' in position 1: character maps to 
<undefined>
+-------------------------[CrewAIEventsBus] Sync handler error in on_task_completed: 'charmap' codec 
can't encode character '\U0001f680' in position 1: character maps to 
<undefined>

============================================================
AUDIT COMPLETE
============================================================
### DevOps / Build Audit Findings  
#### P0 Issues  
1. **Critical**: Missing `ort` dependency exacerbates dependency risks; data inconsistencies arise during deployment.  
2. **High**: SSR module `ffmpeg` path hardcoded introduces runtime crashes if unavailable.  

#### P1 Issues  
3. **Medium**: Incompatible image file formats in segmentation tasks limit compatibility.  
4. **Critical**: Missing Pillar SDK integration for Tauri rendering pipelines causes unresolved conflicts.  

#### P2 Issues  
5. **High**: 3D mask refinement logic missing leads to unreliable results in complex operations.  
6. **High**: Legacy design choices for `mask.stride` compromise scalability and maintenance ease.  

#### P3 Issues  
7. **Low-Medium**: Inadequate type definitions for cross-component processing introduce brittleness.  
8. **Critical**: Unhandled type mismatches in `boxes.py` cause crash failures under load.  

---  
### Notes on Systemic Gaps  
- **Priority 1**: Resolve P0 and P2 high-severity issues to ensure stable core components.  
- **Systemic Risks**: Fix binaries, enforce dependency management, and standardize runtime validation across modules.  
- **Mitigation**: Update Ffmpeg binaries with dynamic fallbacks; audit Tauri environment compatibility before deployment.  

#### Additional Findings Summary  
9. Security misconfigurations persist in bridge interfaces (P1).  
10. Canvas alignment issues compound under load (P3).  

Systemic corrections are required to address dependencies, enforce reproducibility, and support scalability. Immediate action prevents cascading failures.
Traceback (most recent call last):
  File "c:\Users\richk\CascadeProjects\moshdither-studio\audit_crew.py", line 308, in <module>
    out_path.write_text(str(result), encoding="utf-8")
  File "C:\Users\richk\Anaconda3\Lib\pathlib.py", line 1047, in write_text
+------------------------------[CrewAIEventsBus] Sync handler error in on_crew_completed: 'charmap' codec 
can't encode character '\U0001f4cb' in position 1: character maps to 
<undefined>
    with self.open(mode='w', encoding=encoding, errors=errors, newline=newline) as f:
         ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
  File "C:\Users\richk\Anaconda3\Lib\pathlib.py", line 1013, in open
    return io.open(self, mode, buffering, encoding, errors, newline)
           ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
PermissionError: [Errno 13] Permission denied: 'c:\\Users\\richk\\CascadeProjects\\moshdither-studio\\AUDIT_RAW_OUTPUT.md'
