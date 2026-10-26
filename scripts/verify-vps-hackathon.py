"""Seed/verify a dedicated synthetic VPS over verified HTTPS. Secrets stay in private JSON."""
import argparse
import http.cookiejar
import json
from pathlib import Path
import urllib.error
import urllib.request
import uuid


class Client:
    def __init__(self, origin, proxy=None):
        self.origin, self.token = origin, ""
        self.jar = http.cookiejar.CookieJar()
        self.opener = urllib.request.build_opener(
            urllib.request.ProxyHandler({"https": proxy} if proxy else {}),
            urllib.request.HTTPCookieProcessor(self.jar))

    def call(self, route, method="GET", body=None):
        headers = {"Accept": "application/json"}
        if self.token:
            headers["X-CSRF-TOKEN"] = self.token
        if body is not None:
            headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.origin + "/api" + route,
            data=None if body is None else json.dumps(body).encode(), headers=headers, method=method)
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
        return response.status, data, response.headers

    def ok(self, route, method="GET", body=None, status=200):
        actual, data, _ = self.call(route, method, body)
        assert actual == status, f"{method} {route}: HTTP {actual}, expected {status}"
        return data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("config")
    parser.add_argument("--origin", default="https://176.32.37.10")
    parser.add_argument("--proxy")
    parser.add_argument("--seed", action="store_true")
    args = parser.parse_args()
    assert args.origin.startswith("https://")
    config = json.loads(Path(args.config).read_text())
    new = lambda: Client(args.origin, args.proxy)
    doctor = new()
    assert doctor.ok("/health")["storage"] == "postgresql"
    doctor.ok("/csrf")
    doctor.ok("/login", "POST", {"email": config["doctorEmail"], "password": config["doctorPassword"]})
    assert doctor.ok("/session")["actor"]["id"] == config["doctorId"]
    records = doctor.ok("/patients")
    record = next((p for p in records if p["id"] == config["patientId"]), None)
    if args.seed:
        if record is None:
            record = doctor.ok("/patients", "POST", {"id": config["patientId"], "profile": {
                "name": "Синтетический пациент хакатона", "birthDate": "1995-01-01"}}, status=201)
        if not any(c["purpose"] == "communication" and c["status"] == "documented" for c in record["consents"]):
            doctor.ok(f"/patients/{config['patientId']}/commands", "POST", {
                "commandId": str(uuid.uuid4()), "expectedRevision": record["revision"], "mutation": {
                    "type": "consent.add", "value": {"id": str(uuid.uuid4()), "createdAt": "", "author": "",
                    "purpose": "communication", "status": "documented", "signedOn": "2026-10-26",
                    "documentReference": "Синтетический пример хакатона", "person": "Синтетический пациент",
                    "scope": "Тестовый обмен сообщениями", "informing": "Только синтетические данные"}}})
        print("PASS verified public HTTPS, doctor login, synthetic patient and communication fixture")
        return
    assert record is not None
    patient = new()
    patient.ok("/csrf")
    patient.ok("/patient/access", "POST", {"code": "INVALID-CODE-123456"}, status=401)
    patient.ok("/patient/access", "POST", {"code": config["accessCode"]})
    assert patient.ok("/patient/session")["actor"]["patientId"] == config["patientId"]
    assert patient.ok("/patient/record")["patientId"] == config["patientId"]
    patient.ok("/patients", status=403)
    assert all(c.secure for c in patient.jar if c.name in ("syncli-csrf", "syncli-doctor-session"))
    command_id = str(uuid.uuid4())
    command = {"commandId": command_id, "mutation": {"type": "message.patient", "text": "Проверка публичного HTTPS: сообщение пациента " + command_id}}
    patient.ok("/patient/commands", "POST", command)
    again = patient.ok("/patient/commands", "POST", command)
    assert sum(m["id"] == command_id for m in again["messages"]) == 1
    record = next(p for p in doctor.ok("/patients") if p["id"] == config["patientId"])
    assert any(m["id"] == command_id for m in record["messages"])
    reply = "Проверка публичного HTTPS: ответ врача " + command_id
    doctor.ok(f"/patients/{config['patientId']}/commands", "POST", {
        "commandId": str(uuid.uuid4()), "expectedRevision": record["revision"],
        "mutation": {"type": "message.send", "text": reply}})
    assert any(m["text"] == reply for m in patient.ok("/patient/record")["messages"])
    missing = new()
    missing.ok("/patient/access", "POST", {"code": config["accessCode"]}, status=400)
    print("PASS public HTTPS: health, doctor login, code/rejected code, binding, roles, secure cookies, CSRF, idempotent message and doctor reply")


if __name__ == "__main__":
    main()
