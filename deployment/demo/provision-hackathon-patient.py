"""Provision only the dedicated synthetic patient after its card exists through API."""
import json
import os
from pathlib import Path
import shlex
import subprocess
import sys
import uuid

assert os.geteuid() == 0
config = json.loads(Path(sys.argv[1]).read_text())
for key in ("patientUserId", "patientId", "clinicId"):
    uuid.UUID(config[key])
environment = dict(os.environ)
for line in Path("/etc/syncli/api.env").read_text().splitlines():
    if line and not line.startswith("#"):
        key, value = line.split("=", 1)
        environment[key] = shlex.split(value)[0]
query = f"SELECT count(*) FROM clinic_users WHERE id='{config['patientUserId']}' AND patient_id='{config['patientId']}' AND clinic_id='{config['clinicId']}' AND specialty='patient';"
result = subprocess.run(["runuser", "-u", "postgres", "--", "psql", "-At", "-d", "syncli_hackathon"], input=query, text=True, capture_output=True, check=True)
if result.stdout.strip() != "1":
    environment.update({"Provision__Id": config["patientUserId"], "Provision__ClinicId": config["clinicId"],
        "Provision__Name": "Синтетический пациент хакатона", "Provision__Specialty": "patient",
        "Provision__PatientId": config["patientId"], "Provision__Email": config["patientUserId"] + "@example.test",
        "Provision__Password": config["patientPassword"]})
    result = subprocess.run(["runuser", "-u", "syncli", "--", "/usr/bin/dotnet", "/opt/syncli/current/api/Doctor.Api.dll", "--provision"],
        cwd="/opt/syncli/current/api", env=environment, text=True, capture_output=True)
    assert result.returncode == 0, "Patient provisioning failed; no secrets are printed"
print("Dedicated synthetic patient account is provisioned; normal password differs from access code")
