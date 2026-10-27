"""External HTTP measurements. TLS stays enabled; output never contains response bodies/cookies."""
import argparse
import concurrent.futures
import datetime
import http.cookiejar
import json
import math
import os
import pathlib
import socket
import struct
import threading
import time
import urllib.error
import urllib.request
import uuid


def percentile(values, percent):
    if not values:
        return None
    ordered = sorted(values)
    return round(ordered[max(0, math.ceil(len(ordered) * percent / 100) - 1)], 3)


def summarize(rows):
    def distribution(values):
        return {**{f"p{p}": percentile(values, p) for p in (50, 95, 99)},
                "max": round(max(values), 3) if values else None}
    errors = sum(not r["ok"] for r in rows)
    return {"attempts": len(rows), "errors": errors,
            "error_rate": errors / len(rows) if rows else None,
            "success_ms": distribution([r["ms"] for r in rows if r["ok"]]),
            "all_ms": distribution([r["ms"] for r in rows])}


def wifi_route(source, interface):
    original = socket.create_connection

    def connect(address, timeout=socket._GLOBAL_DEFAULT_TIMEOUT, source_address=None,
                *args, **kwargs):
        if address[0] != "176.32.37.10":
            return original(address, timeout, source_address, *args, **kwargs)
        conn = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        try:
            conn.settimeout(timeout if isinstance(timeout, (int, float)) else None)
            conn.setsockopt(socket.IPPROTO_IP, 31, struct.pack("!I", interface))
            conn.bind((source, 0))
            conn.connect(address)
            return conn
        except BaseException:
            conn.close()
            raise
    socket.create_connection = connect


class Client:
    def __init__(self, origin):
        self.origin = origin.rstrip("/")
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({}), urllib.request.HTTPCookieProcessor(self.jar))
        self.token = ""

    def call(self, route, method="GET", body=None, expected=200, csrf=True):
        headers = {"Accept": "application/json", "Origin": self.origin}
        if csrf and self.token:
            headers["X-CSRF-TOKEN"] = self.token
        if body is not None:
            headers["Content-Type"] = "application/json"
        start = time.perf_counter()
        try:
            request = urllib.request.Request(self.origin + "/api" + route,
                data=None if body is None else json.dumps(body).encode(),
                headers=headers, method=method)
            try:
                response = self.opener.open(request, timeout=20)
            except urllib.error.HTTPError as error:
                response = error
            raw = response.read()
            try:
                data = json.loads(raw)
            except (ValueError, UnicodeDecodeError):
                data = None
            if isinstance(data, dict):
                self.token = data.get("csrfToken", data.get("token", self.token))
            row = {"status": response.status, "ok": response.status == expected,
                   "bytes": len(raw), "ms": round((time.perf_counter() - start) * 1000, 3)}
            return row, data
        except (OSError, ValueError) as error:
            return {"status": None, "ok": False, "bytes": 0,
                    "error": type(error).__name__,
                    "ms": round((time.perf_counter() - start) * 1000, 3)}, None

    def require(self, route, method="GET", body=None, expected=200):
        row, data = self.call(route, method, body, expected)
        if not row["ok"]:
            raise RuntimeError(f"{method} {route.split('?')[0]}: {row['status']}")
        return data

    def clone(self):
        other = Client(self.origin)
        for cookie in self.jar:
            other.jar.set_cookie(cookie)
        other.token = self.token
        return other


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--origin", required=True)
    parser.add_argument("--config", required=True)
    parser.add_argument("--output", required=True)
    parser.add_argument("--iterations", type=int, default=100)
    parser.add_argument("--levels", default="")
    parser.add_argument("--stage-seconds", type=int, default=60)
    parser.add_argument("--think-seconds", type=float, default=1)
    parser.add_argument("--wifi-source")
    parser.add_argument("--wifi-interface", type=int, default=13)
    parser.add_argument("--write-synthetic", action="store_true")
    args = parser.parse_args()
    if not 1 <= args.iterations <= 10000 or not 1 <= args.stage_seconds <= 600 or args.think_seconds < 0.5:
        parser.error("iterations 1..10000, stage-seconds 1..600 and think-seconds >=0.5 required")
    if any(not 1 <= int(value) <= 100 for value in args.levels.split(",") if value):
        parser.error("levels must be between 1 and 100")
    if args.wifi_source:
        wifi_route(args.wifi_source, args.wifi_interface)
    if not args.origin.startswith("https://") and not args.origin.startswith("http://127.0.0.1:"):
        raise ValueError("Only verified HTTPS or isolated loopback HTTP is allowed")
    config = json.loads(pathlib.Path(args.config).read_text(encoding="utf-8"))
    output = pathlib.Path(args.output)
    output.parent.mkdir(parents=True, exist_ok=True)
    evidence = {"started_at": datetime.datetime.now(datetime.timezone.utc).isoformat(),
                "origin": args.origin, "protocol": "urllib-new-connection-per-request",
                "generator": {"pid": os.getpid(), "platform": os.name},
                "series": {}, "checks": [], "stages": []}
    def save():
        output.write_text(json.dumps(evidence, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    doctor = Client(args.origin)
    health = doctor.require("/health")
    evidence["health"] = health
    doctor.require("/csrf")
    doctor.require("/login", "POST", {"email": config["doctorEmail"],
                                       "password": config["doctorPassword"]})
    doctor.require("/session")
    def check(name, condition):
        evidence["checks"].append({"name": name, "ok": bool(condition)})
        save()
    routes = {"health": "/health", "patient-list": "/patients",
              "icd-search": "/terminology/icd10?q=F32"}
    for label, route in routes.items():
        rows = []
        for _ in range(args.iterations):
            row, _ = doctor.call(route)
            rows.append(row)
        evidence["series"][label] = {"raw": rows, "summary": summarize(rows)}
        print(label, json.dumps(evidence["series"][label]["summary"]), flush=True)
        save()
    anonymous = Client(args.origin)
    row, _ = anonymous.call("/patients", expected=401)
    check("anonymous cannot read doctor records", row["ok"])
    if config.get("accessCode"):
        patient = Client(args.origin)
        patient.require("/csrf")
        patient.require("/patient/access", "POST", {"code": config["accessCode"]})
        patient.require("/patient/session")
        patient_record = patient.require("/patient/record")
        row, _ = patient.call("/patients", expected=403)
        check("patient cannot read doctor API", row["ok"])
        row, _ = patient.call("/patient/commands", "POST", {}, expected=400, csrf=False)
        check("mutation without CSRF rejected", row["ok"])
        check("session cookies have Secure on HTTPS", not args.origin.startswith("https") or
              all(c.secure for c in patient.jar))
        row, _ = patient.call("/patient/commands", "POST", {
            "commandId": str(uuid.uuid4()), "mutation": {"type": "measurement.invalid"}}, expected=403)
        check("unknown patient command rejected", row["ok"])
        if args.write_synthetic:
            target_id = patient_record["patientId"]
            record = next(p for p in doctor.require("/patients") if p["id"] == target_id)
            if "синтетическ" not in record["profile"]["name"].lower():
                raise ValueError("Writes require an explicitly synthetic patient")
            timings = []
            for _ in range(5):
                command_id = str(uuid.uuid4())
                text = "Синтетический технический замер #58 " + command_id
                body = {"commandId": command_id, "mutation": {"type": "message.patient", "text": text}}
                start = time.perf_counter()
                row, first = patient.call("/patient/commands", "POST", body)
                retry, again = patient.call("/patient/commands", "POST", body)
                records = doctor.require("/patients")
                found = next(p for p in records if p["id"] == target_id)
                count = sum(m["id"] == command_id and m["text"] == text for m in found["messages"])
                timings.append({"ok": row["ok"] and retry["ok"] and count == 1,
                                "write_status": row["status"], "retry_status": retry["status"],
                                "matching_records": count,
                                "ms": round((time.perf_counter() - start) * 1000, 3)})
            evidence["series"]["message-write-retry-read"] = {
                "raw": timings, "summary": summarize(timings)}
            check("five message retries preserve exactly one matching record each", all(r["ok"] for r in timings))
    for level in [int(x) for x in args.levels.split(",") if x]:
        if doctor.require("/health").get("release") != health.get("release"):
            raise RuntimeError("Release changed: stop comparing runs")
        clients = [doctor.clone() for _ in range(level)]
        ready = threading.Barrier(level + 1)
        stage_start = time.perf_counter()
        deadline = stage_start + args.stage_seconds
        def worker(index):
            rows = []
            client = clients[index]
            ready.wait()
            seq = 0
            while time.perf_counter() < deadline:
                # 80% full patient-list reads, 20% terminology search; no writes under load.
                route = routes["icd-search"] if seq % 5 == 4 else routes["patient-list"]
                row, _ = client.call(route)
                row["operation"] = "icd-search" if seq % 5 == 4 else "patient-list"
                rows.append(row)
                seq += 1
                remaining = deadline - time.perf_counter()
                if remaining > 0:
                    time.sleep(min(args.think_seconds, remaining))
            return rows
        with concurrent.futures.ThreadPoolExecutor(max_workers=level) as executor:
            futures = [executor.submit(worker, n) for n in range(level)]
            ready.wait()
            rows = [row for future in futures for row in future.result()]
        elapsed = time.perf_counter() - stage_start
        summary = summarize(rows)
        stage = {"concurrent_workers": level, "distinct_authenticated_sessions": 1,
                 "duration_seconds": elapsed, "think_seconds": args.think_seconds,
                 "rps": len(rows) / elapsed, "summary": summary, "raw": rows}
        evidence["stages"].append(stage)
        print("stage", level, json.dumps(summary), flush=True)
        save()
        if summary["error_rate"] and summary["error_rate"] > 0.05:
            evidence["stop_reason"] = "more than 5% unexpected HTTP failures"
            break
        if (summary["success_ms"]["p95"] or 0) > 10000:
            evidence["stop_reason"] = "successful p95 exceeded 10 seconds"
            break
    evidence["completed_at"] = datetime.datetime.now(datetime.timezone.utc).isoformat()
    evidence["health_after"] = doctor.require("/health")
    check("release remained unchanged", evidence["health_after"].get("release") == health.get("release"))
    save()
    return 0 if all(check["ok"] for check in evidence["checks"]) else 2


if __name__ == "__main__":
    raise SystemExit(main())
