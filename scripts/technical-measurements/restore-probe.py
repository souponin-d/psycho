"""VPS-only restore drill: exported snapshot, separate DBs, no service stop or source overwrite."""
import datetime
import hashlib
import json
import os
import pathlib
import subprocess
import time

source = "syncli_hackathon"
tag = "measure58_" + str(int(time.time()))
os.umask(0o077)
directory = pathlib.Path("/var/tmp") / tag
directory.mkdir(mode=0o700)
subprocess.run(["chown", "postgres:postgres", str(directory)], check=True)
tables = ["schema_migrations", "clinic_users", "patient_records", "care_relationships",
          "record_versions", "command_receipts", "access_audit", "creation_receipts"]
fingerprint_sql = "SELECT json_build_object(" + ",".join(
    "'%s',(SELECT json_build_object('rows',count(*),'digest',md5(coalesce(string_agg(md5(row_to_json(t)::text),'' ORDER BY row_to_json(t)::text),''))) FROM %s t)" % (table, table)
    for table in tables) + ");"


def run(*args):
    result = subprocess.run(args, capture_output=True, text=True)
    if result.returncode:
        raise RuntimeError("Command failed: " + args[0])
    return result.stdout.strip()


def psql(database, query):
    return run("runuser", "-u", "postgres", "--", "psql", "-XqAt", "-v", "ON_ERROR_STOP=1",
               "-d", database, "-c", query)


evidence = {"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
            "source_database": source, "source_service_stopped": False,
            "scope": "PostgreSQL dump/restore, not full host or application recovery", "trials": []}
try:
    for n in range(3):
        database = tag + "_" + str(n)
        dump = directory / (database + ".dump")
        session = subprocess.Popen(["runuser", "-u", "postgres", "--", "psql", "-XqAt", "-v",
            "ON_ERROR_STOP=1", "-d", source], stdin=subprocess.PIPE, stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL, text=True, bufsize=1)
        created = False
        try:
            session.stdin.write("BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY; SELECT pg_export_snapshot();\n")
            session.stdin.flush()
            snapshot = session.stdout.readline().strip()
            if not snapshot or "-" not in snapshot:
                raise RuntimeError("Snapshot export failed")
            start = time.perf_counter()
            run("runuser", "-u", "postgres", "--", "pg_dump", "-Fc", "--snapshot=" + snapshot,
                "-d", source, "-f", str(dump))
            dump_seconds = time.perf_counter() - start
            session.stdin.write(fingerprint_sql + "\n")
            session.stdin.flush()
            expected = json.loads(session.stdout.readline())
            session.stdin.write("ROLLBACK;\n\\q\n")
            session.stdin.flush()
            session.wait(timeout=20)
            start = time.perf_counter()
            run("runuser", "-u", "postgres", "--", "createdb", database)
            created = True
            run("runuser", "-u", "postgres", "--", "pg_restore", "--exit-on-error", "-d", database, str(dump))
            restored_at = time.perf_counter()
            actual = json.loads(psql(database, fingerprint_sql))
            checked_at = time.perf_counter()
            evidence["trials"].append({"dump_seconds": dump_seconds,
                "restore_seconds": restored_at - start, "restore_and_verify_seconds": checked_at - start,
                "dump_bytes": dump.stat().st_size,
                "dump_sha256": hashlib.sha256(dump.read_bytes()).hexdigest(),
                "snapshot_fingerprints_match": actual == expected,
                "table_rows": {table: expected[table]["rows"] for table in tables},
                "tables_verified": len(tables)})
            if actual != expected:
                raise RuntimeError("Snapshot mismatch")
        finally:
            if session.poll() is None:
                session.terminate()
                session.wait(timeout=10)
            if created:
                if not database.startswith("measure58_"):
                    raise RuntimeError("Unexpected cleanup target")
                run("runuser", "-u", "postgres", "--", "dropdb", database)
    print(json.dumps(evidence), flush=True)
finally:
    # Delete only this drill's own dumps; refuse unknown contents or symlink paths.
    if directory.parent != pathlib.Path("/var/tmp") or directory.is_symlink() or not directory.name.startswith("measure58_"):
        raise RuntimeError("Unexpected restore cleanup directory")
    for file in directory.iterdir():
        if file.is_symlink() or not file.is_file() or file.suffix != ".dump" or not file.name.startswith(directory.name + "_"):
            raise RuntimeError("Unexpected restore cleanup file")
        file.unlink()
    directory.rmdir()
