"""Run on the Linux VPS via SSH stdin. Outputs only aggregate, non-secret evidence."""
import datetime
import json
import os
import pathlib
import subprocess
import time


def command(*args):
    result = subprocess.run(args, capture_output=True, text=True, check=True)
    return result.stdout.strip()


def sql(query):
    return command("runuser", "-u", "postgres", "--", "psql", "-XAt", "-d",
                   "syncli_hackathon", "-c", query)


def emit(data):
    print(json.dumps(data), flush=True)


emit({"kind": "inventory", "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
      "cpu_count": os.cpu_count(), "kernel": os.uname().release,
      "memory": pathlib.Path("/proc/meminfo").read_text().splitlines()[:3],
      "release": os.path.realpath("/opt/syncli/current"),
      "runtimes": command("dotnet", "--list-runtimes").splitlines(),
      "postgres": command("psql", "--version"),
      "caddy": command("caddy", "version"),
      "database_bytes": int(sql("SELECT pg_database_size(current_database())")),
      "table_counts": json.loads(sql("SELECT json_object_agg(relname,n_live_tup) FROM pg_stat_user_tables")),
      "listeners": command("ss", "-lnt").splitlines(),
      "file_permissions": [command("stat", "-c", "%a %U:%G %n", p) for p in
                           ("/etc/syncli/api.env", "/etc/syncli/dataprotection.pfx", "/var/lib/syncli/keys")]})
previous = None
for _ in range(360):
    started = time.monotonic()
    cpu = [int(x) for x in pathlib.Path("/proc/stat").read_text().splitlines()[0].split()[1:]]
    total, idle = sum(cpu[:8]), cpu[3] + cpu[4]
    percent = None if previous is None else round(100 * (1 - (idle - previous[1]) / (total - previous[0])), 2)
    previous = (total, idle)
    pid = command("systemctl", "show", "syncli-api", "-p", "MainPID", "--value")
    status = pathlib.Path(f"/proc/{pid}/status").read_text().splitlines()
    rss = next((int(x.split()[1]) for x in status if x.startswith("VmRSS:")), None)
    mem = {x.split(":")[0]: int(x.split()[1]) for x in pathlib.Path("/proc/meminfo").read_text().splitlines()}
    emit({"kind": "sample", "utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
          "cpu_busy_percent": percent, "api_rss_kib": rss,
          "memory_available_kib": mem["MemAvailable"], "loadavg": pathlib.Path("/proc/loadavg").read_text().split()[:3],
          "db": json.loads(sql("SELECT json_build_object('connections',numbackends,'commits',xact_commit,'rollbacks',xact_rollback,'blocks_read',blks_read,'blocks_hit',blks_hit,'deadlocks',deadlocks,'temp_bytes',temp_bytes) FROM pg_stat_database WHERE datname=current_database()"))})
    time.sleep(max(0, 2 - (time.monotonic() - started)))
