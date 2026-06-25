import csv
import os
import subprocess
import sys
import time
from datetime import datetime

import psutil

# Configuration
TAURI_PROCESS_NAME = "moshdither-studio"
SAM3_KEYWORD = "sam3"  # Look for this in the command line of python processes
OUTPUT_FILE = "resource_profile.csv"

def get_vram_usage():
    try:
        # Get VRAM usage per process using nvidia-smi
        result = subprocess.run(
            ['nvidia-smi', '--query-compute-apps=pid,used_memory', '--format=csv,noheader,nounits'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True
        )
        if result.returncode != 0:
            return {}

        vram_map = {}
        for line in result.stdout.strip().split('\n'):
            if line:
                parts = line.split(',')
                if len(parts) == 2:
                    pid = int(parts[0].strip())
                    vram_mb = float(parts[1].strip())
                    vram_map[pid] = vram_mb
        return vram_map
    except Exception:
        return {}

def find_target_processes():
    tauri_pids = []
    sam3_pids = []

    for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
        try:
            name = proc.info['name']
            cmdline = proc.info['cmdline']

            if name and TAURI_PROCESS_NAME in name.lower():
                tauri_pids.append(proc.info['pid'])
            elif cmdline and any(SAM3_KEYWORD in arg.lower() for arg in cmdline):
                sam3_pids.append(proc.info['pid'])
        except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
            pass

    return tauri_pids, sam3_pids

def check_terminated_processes(current_pids: set):
    """Detect processes that terminated since last check and log crash info."""
    terminated = known_pids - current_pids
    for pid in terminated:
        try:
            # On Windows, check the exit code via WaitForSingleObject if still accessible
            # Otherwise, query the Windows Event Log for application errors
            crash_info = query_windows_event_log(pid)
            if crash_info:
                log_crash(pid, crash_info)
        except Exception as e:
            print(f"  [WARN] Could not query crash info for PID {pid}: {e}")
    known_pids.clear()
    known_pids.update(current_pids)

def query_windows_event_log(pid: int) -> dict | None:
    """Query Windows Application Event Log for crash events matching our PID."""
    if sys.platform != "win32":
        return None
    try:
        # Use wevtutil to query Application log for Application Error events
        result = subprocess.run(
            ['wevtutil', 'qe', 'Application', '/q:*[System[Provider[@Name="Application Error"]]]', '/c:10', '/f:Text'],
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
            timeout=10
        )
        if result.returncode != 0:
            return None

        # Parse the text output for our PID and heap corruption
        lines = result.stdout.split('\n')
        for i, line in enumerate(lines):
            if str(pid) in line and 'moshdither' in lines[max(0, i-5):i+10].__str__().lower():
                # Check for heap corruption in nearby lines
                context = '\n'.join(lines[max(0, i-10):i+10])
                is_heap_corruption = hex(HEAP_CORRUPTION_CODE) in context or '0xc0000374' in context.lower()
                return {
                    'pid': pid,
                    'event_log_context': context[:500],
                    'is_heap_corruption': is_heap_corruption,
                    'timestamp': datetime.now().isoformat(),
                }
        return None
    except Exception:
        return None

def log_crash(pid: int, info: dict):
    """Log a crash event to crash_log.csv."""
    file_exists = os.path.exists(CRASH_LOG_FILE)
    with open(CRASH_LOG_FILE, 'a', newline='') as f:
        writer = csv.writer(f)
        if not file_exists:
            writer.writerow(['timestamp', 'pid', 'is_heap_corruption', 'event_log_snippet'])
        writer.writerow([
            info.get('timestamp', datetime.now().isoformat()),
            pid,
            info.get('is_heap_corruption', False),
            info.get('event_log_context', '')[:200]
        ])

    crash_type = "HEAP_CORRUPTION (0xc0000374)" if info.get('is_heap_corruption') else "UNEXPECTED_EXIT"
    print(f"\n  *** CRASH DETECTED *** PID {pid} — {crash_type}")
    print(f"  Logged to {CRASH_LOG_FILE}\n")

def log_resources():
    print(f"Starting resource profiling. Logging to {OUTPUT_FILE}")
    print("Press Ctrl+C to stop.")

    with open(OUTPUT_FILE, 'w', newline='') as f:
        writer = csv.writer(f)
        writer.writerow(['timestamp', 'tauri_ram_mb', 'tauri_vram_mb', 'sam3_ram_mb', 'sam3_vram_mb'])

        try:
            while True:
                tauri_pids, sam3_pids = find_target_processes()
                all_pids = set(tauri_pids + sam3_pids)
                check_terminated_processes(all_pids)
                vram_map = get_vram_usage()

                tauri_ram = 0
                tauri_vram = 0
                for pid in tauri_pids:
                    try:
                        p = psutil.Process(pid)
                        tauri_ram += p.memory_info().rss / (1024 * 1024)
                        tauri_vram += vram_map.get(pid, 0)
                    except:
                        pass

                sam3_ram = 0
                sam3_vram = 0
                for pid in sam3_pids:
                    try:
                        p = psutil.Process(pid)
                        sam3_ram += p.memory_info().rss / (1024 * 1024)
                        sam3_vram += vram_map.get(pid, 0)
                    except:
                        pass

                writer.writerow([
                    datetime.now().isoformat(),
                    round(tauri_ram, 2),
                    round(tauri_vram, 2),
                    round(sam3_ram, 2),
                    round(sam3_vram, 2)
                ])
                f.flush()

                print(f"[{datetime.now().strftime('%H:%M:%S')}] "
                      f"Tauri (RAM: {tauri_ram:.1f}MB, VRAM: {tauri_vram:.1f}MB) | "
                      f"SAM3 (RAM: {sam3_ram:.1f}MB, VRAM: {sam3_vram:.1f}MB)")

                time.sleep(2)
        except KeyboardInterrupt:
            print("\nProfiling stopped.")

if __name__ == "__main__":
    log_resources()
