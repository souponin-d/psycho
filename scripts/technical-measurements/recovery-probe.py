"""Crash/restart an isolated copy on VPS port 5098. Never stops syncli-api.service."""
import datetime
import http.client
import json
import os
import pathlib
import re
import shutil
import signal
import subprocess
import tempfile
import time
import uuid

os.umask(0o077)
directory = pathlib.Path(tempfile.mkdtemp(prefix="measure58-recovery-", dir="/var/tmp"))
database = "measure58_recovery_" + str(int(time.time()))
directory.chmod(0o711)
dump = directory / "database.dump"
subprocess.run(["chown", "postgres:postgres", str(directory)], check=True)
process = None
created = False
log = None


def run(*args, env=None, cwd=None):
    result = subprocess.run(args, env=env, cwd=cwd, capture_output=True, text=True)
    if result.returncode:
        reason = (result.stderr or result.stdout)[:2000]
        for key, value in (env or {}).items():
            if value and len(value) >= 8 and re.search("password|connection|secret|token", key, re.I):
                reason = reason.replace(value, "[redacted]")
                for secret in re.findall(r"(?i)(?:password|pwd)=([^;]+)", value):
                    reason = reason.replace(secret, "[redacted]")
        reason = re.sub(r"(?i)((?:password|pwd|token)\s*[=:]\s*)[^;\s]+", r"\1[redacted]", reason)
        raise RuntimeError("Isolated recovery command failed: " + args[0] + ": " + reason[:700])
    return result.stdout.strip()


def start():
    return subprocess.Popen(["runuser", "-u", "syncli", "--", "dotnet", str(directory / "api/Doctor.Api.dll")],
        cwd=directory / "api", env=environment, stdout=log, stderr=log, start_new_session=True)


cookies = {}
token = ""


def call(route, method="GET", body=None, expected=200):
    global token
    conn = http.client.HTTPConnection("127.0.0.1", 5098, timeout=5)
    headers = {"Host": "176.32.37.10", "X-Forwarded-For": "198.51.100.58",
        "X-Forwarded-Proto": "https", "Origin": "https://176.32.37.10", "Accept": "application/json"}
    if cookies:
        headers["Cookie"] = "; ".join(k + "=" + v for k, v in cookies.items())
    if token:
        headers["X-CSRF-TOKEN"] = token
    if body is not None:
        headers["Content-Type"] = "application/json"
    try:
        conn.request(method, "/api" + route, None if body is None else json.dumps(body), headers)
        response = conn.getresponse()
        for key, value in response.getheaders():
            if key.lower() == "set-cookie":
                name, value = value.split(";", 1)[0].split("=", 1)
                cookies[name] = value
        raw = response.read()
        if response.status != expected:
            raise RuntimeError("Isolated API " + method + " " + route.split("?")[0] + ": " + str(response.status))
        data = json.loads(raw) if raw else None
        if isinstance(data, dict):
            token = data.get("csrfToken", data.get("token", token))
        return data
    finally:
        conn.close()


def ready():
    deadline = time.monotonic() + 45
    while time.monotonic() < deadline:
        if process.poll() is not None:
            raise RuntimeError("Isolated API exited before readiness")
        try:
            if call("/health")["status"] == "ready":
                return
        except (OSError, RuntimeError):
            pass
        time.sleep(0.1)
    raise RuntimeError("Isolated API readiness timeout")


try:
    # A bind check prevents accidentally using another task's process.
    import socket
    probe = socket.socket()
    probe.bind(("127.0.0.1", 5098))
    probe.close()
    started = time.perf_counter()
    run("runuser", "-u", "postgres", "--", "pg_dump", "-Fc", "-d", "syncli_hackathon", "-f", str(dump))
    owner = run("runuser", "-u", "postgres", "--", "psql", "-XqAt", "-d", "postgres", "-c",
        "SELECT pg_get_userbyid(datdba) FROM pg_database WHERE datname='syncli_hackathon'")
    if not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", owner):
        raise RuntimeError("Unexpected source database owner")
    run("runuser", "-u", "postgres", "--", "createdb", "--owner=" + owner, database)
    created = True
    run("runuser", "-u", "postgres", "--", "pg_restore", "--exit-on-error", "-d", database, str(dump))
    database_restored = time.perf_counter()
    shutil.copytree("/opt/syncli/current/api", directory / "api")
    shutil.copytree("/var/lib/syncli/keys", directory / "keys")
    shutil.copy2("/etc/syncli/dataprotection.pfx", directory / "protection.pfx")
    for path in (directory / "api", directory / "keys", directory / "protection.pfx"):
        run("chown", "-R", "syncli:syncli", str(path))
    environment = dict(os.environ)
    for line in pathlib.Path("/etc/syncli/api.env").read_text().splitlines():
        if line and not line.startswith("#") and "=" in line:
            key, value = line.split("=", 1)
            environment[key] = value.strip().strip('"').strip("'")
    old_connection = environment["ConnectionStrings__Doctor"]
    connection, replacements = re.subn(r"(?i)(Database=)[^;]+", lambda m: m[1] + database, old_connection)
    if replacements != 1:
        raise RuntimeError("Cannot safely select isolated database")
    environment.update({"ConnectionStrings__Doctor": connection,
        "ASPNETCORE_URLS": "http://127.0.0.1:5098", "Doctor__KeyDirectory": str(directory / "keys"),
        "Doctor__KeyCertificatePath": str(directory / "protection.pfx")})
    actor_id, clinic_id = str(uuid.uuid4()), str(uuid.uuid4())
    password = uuid.uuid4().hex
    email = "measure58-" + uuid.uuid4().hex + "@example.test"
    provision = {**environment, "Provision__Id": actor_id, "Provision__ClinicId": clinic_id,
        "Provision__Name": "Синтетический врач замера 58", "Provision__Specialty": "psychiatrist",
        "Provision__Email": email, "Provision__Password": password}
    run("runuser", "-u", "syncli", "--", "dotnet", str(directory / "api/Doctor.Api.dll"), "--provision", env=provision, cwd=directory / "api")
    log = open(directory / "api-private.log", "w")
    process = start()
    ready()
    call("/csrf")
    call("/login", "POST", {"email": email, "password": password})
    call("/session")
    pid = str(uuid.uuid4())
    record = call("/patients", "POST", {"id": pid, "profile": {
        "name": "Синтетический пациент восстановления 58", "birthDate": "1995-01-01"}}, 201)
    day = datetime.datetime.now(datetime.timezone.utc).date().isoformat()
    consent = {"commandId": str(uuid.uuid4()), "expectedRevision": record["revision"], "mutation": {
        "type": "consent.add", "value": {"id": str(uuid.uuid4()), "createdAt": "", "author": "",
        "purpose": "communication", "status": "documented", "signedOn": day,
        "documentReference": "Синтетический технический пример", "person": "Синтетический пациент",
        "scope": "Испытание восстановления", "informing": "Синтетические сведения"}}}
    record = call("/patients/" + pid + "/commands", "POST", consent)
    cid = str(uuid.uuid4())
    message = {"commandId": cid, "expectedRevision": record["revision"],
        "mutation": {"type": "message.send", "text": "Синтетическая подтверждённая запись перед сбоем #58"}}
    record = call("/patients/" + pid + "/commands", "POST", message)
    pending_id = str(uuid.uuid4())
    pending = {"commandId": pending_id, "expectedRevision": record["revision"],
        "mutation": {"type": "message.send", "text": "Синтетическая неподтверждённая команда во время сбоя #58"}}
    before_crash = time.perf_counter()
    os.killpg(process.pid, signal.SIGKILL)
    process.wait(timeout=10)
    unavailable_confirmed = False
    try:
        call("/patients/" + pid + "/commands", "POST", pending)
    except (OSError, http.client.HTTPException):
        unavailable_confirmed = True
    if not unavailable_confirmed:
        raise RuntimeError("Isolated endpoint unexpectedly remained available during crash")
    process = start()
    ready()
    health_ready = time.perf_counter()
    # Keep the pre-crash cookies and CSRF token: key/config consistency is actually exercised.
    restored = next(r for r in call("/patients") if r["id"] == pid)
    after = call("/patients/" + pid + "/commands", "POST", message)
    duplicate_count = sum(m["id"] == cid for m in after["messages"])
    delivered_pending = call("/patients/" + pid + "/commands", "POST", pending)
    verified = time.perf_counter()
    print(json.dumps({"utc": datetime.datetime.now(datetime.timezone.utc).isoformat(),
        "scope": "Isolated API process crash on real VPS with restored DB, copied API, keys and certificate",
        "main_service_stopped": False, "backup_and_db_restore_seconds": database_restored - started,
        "prepare_start_login_write_seconds": before_crash - database_restored,
        "crash_to_health_seconds": health_ready - before_crash,
        "crash_to_verified_read_retry_seconds": verified - before_crash,
        "pre_crash_session_survived": True,
        "confirmed_messages_before_crash": 1,
        "confirmed_messages_after_crash": sum(m["id"] == cid for m in restored["messages"]),
        "matching_messages_after_retry": duplicate_count,
        "request_during_outage_failed_without_false_ack": unavailable_confirmed,
        "pending_command_delivered_after_restart": sum(m["id"] == pending_id for m in delivered_pending["messages"]) == 1,
        "pending_client_scope": "Measurement client memory; not a durable mobile queue test",
        "confirmed_message_loss_count": 1 - sum(m["id"] == cid for m in restored["messages"]),
        "limitation": "API crash/restart only; not physical host loss, disk failure, WAN availability or offsite recovery"}))
finally:
    if process and process.poll() is None:
        os.killpg(process.pid, signal.SIGTERM)
        process.wait(timeout=15)
    if log:
        log.close()
    if created and database.startswith("measure58_recovery_"):
        run("runuser", "-u", "postgres", "--", "dropdb", database)
    if directory.parent == pathlib.Path("/var/tmp") and directory.name.startswith("measure58-recovery-"):
        shutil.rmtree(directory)
