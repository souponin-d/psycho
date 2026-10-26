"""Install the explicitly authorized synthetic hackathon snapshot on its dedicated VPS.

Run as root: python3 install-hackathon.py STAGE PRIVATE_JSON RELEASE_ID.
No patient database is copied, reset or dropped; secret values are never printed.
"""
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import sys


def run(args, *, data=None, env=None, cwd=None):
    result = subprocess.run(args, input=data, text=True, capture_output=True, env=env, cwd=cwd)
    if result.returncode:
        raise RuntimeError("Command failed: " + args[0])
    return result.stdout.strip()


def activate_services(command=run):
    command(["systemctl", "daemon-reload"])
    command(["systemctl", "enable", "--now", "syncli-api"])
    command(["systemctl", "enable", "--now", "caddy"])
    command(["systemctl", "reload", "caddy"])


def main():
    import grp
    import pwd

    assert os.geteuid() == 0, "root required"
    stage, private, release_id = Path(sys.argv[1]).resolve(), Path(sys.argv[2]).resolve(), sys.argv[3]
    assert re.fullmatch(r"[a-zA-Z0-9-]+", release_id)
    config = json.loads(private.read_text())
    for name in ("databasePassword", "protectionPassword"):
        assert re.fullmatch(r"[0-9a-f]{48}", config[name])
    api_root = Path("/opt/syncli/releases") / release_id
    web_root = Path("/srv/syncli/releases") / release_id
    assert not api_root.exists() and not web_root.exists(), "release must be new"
    uid, gid = pwd.getpwnam("syncli").pw_uid, grp.getgrnam("syncli").gr_gid
    for directory in (Path("/etc/syncli"), Path("/opt/syncli/releases")):
        directory.mkdir(parents=True, exist_ok=True)
        os.chown(directory, 0, gid)
        directory.chmod(0o750)
    keys = Path("/var/lib/syncli/keys")
    keys.mkdir(parents=True, exist_ok=True)
    os.chown(keys, uid, gid)
    keys.chmod(0o700)
    db = "syncli_hackathon"
    psql = ["runuser", "-u", "postgres", "--", "psql", "-v", "ON_ERROR_STOP=1", "-At", "-d", "postgres"]
    if run(psql, data=f"SELECT 1 FROM pg_roles WHERE rolname='{db}';") != "1":
        run(psql, data=f"CREATE ROLE {db} LOGIN PASSWORD '{config['databasePassword']}';")
    if run(psql, data=f"SELECT 1 FROM pg_database WHERE datname='{db}';") != "1":
        run(psql, data=f"CREATE DATABASE {db} OWNER {db};")
    cert = Path("/etc/syncli/dataprotection.pfx")
    assert not cert.exists(), "existing Data Protection certificate must be preserved and configured explicitly"
    pass_file = stage / "protection-password"
    key_file, pem_file = stage / "protection.key", stage / "protection.pem"
    pass_file.write_text(config["protectionPassword"])
    pass_file.chmod(0o600)
    try:
        run(["openssl", "req", "-x509", "-newkey", "rsa:3072", "-nodes", "-keyout", str(key_file), "-out", str(pem_file), "-days", "365", "-subj", "/CN=Syncli Data Protection"])
        run(["openssl", "pkcs12", "-export", "-inkey", str(key_file), "-in", str(pem_file), "-out", str(cert), "-passout", "file:" + str(pass_file)])
    finally:
        for path in (pass_file, key_file, pem_file):
            path.unlink(missing_ok=True)
    os.chown(cert, 0, gid)
    cert.chmod(0o640)
    environment = {
        "ASPNETCORE_ENVIRONMENT": "Production", "ASPNETCORE_URLS": "http://127.0.0.1:5080",
        "ASPNETCORE_HTTPS_PORT": "443", "AllowedHosts": "176.32.37.10",
        "ConnectionStrings__Doctor": f"Host=127.0.0.1;Port=5432;Database={db};Username={db};Password={config['databasePassword']};Include Error Detail=false",
        "Doctor__KeyDirectory": str(keys), "Doctor__KeyCertificatePath": str(cert),
        "Doctor__KeyCertificatePassword": config["protectionPassword"],
        "Hackathon__Enabled": "true", "Hackathon__PatientUserId": config["patientUserId"],
        "Hackathon__CodeHash": config["accessCodeHash"], "Hackathon__ExpiresAt": config["expiresAt"],
    }
    assert all('"' not in value and "\n" not in value for value in environment.values())
    env_file = Path("/etc/syncli/api.env")
    assert not env_file.exists(), "existing service configuration must not be overwritten"
    env_file.write_text("\n".join(f'{key}="{value}"' for key, value in environment.items()) + "\n")
    os.chown(env_file, 0, gid)
    env_file.chmod(0o640)
    api_root.mkdir()
    shutil.copytree(stage / "api", api_root / "api")
    web_root.parent.mkdir(parents=True, exist_ok=True)
    shutil.copytree(stage / "web", web_root)
    run(["caddy", "validate", "--config", str(stage / "Caddyfile.ip"), "--adapter", "caddyfile"])
    provisioning = {**os.environ, **environment,
        "Provision__Id": config["doctorId"], "Provision__ClinicId": config["clinicId"],
        "Provision__Name": "Врач хакатона", "Provision__Email": config["doctorEmail"],
        "Provision__Password": config["doctorPassword"], "Provision__Specialty": "psychiatrist"}
    run(["runuser", "-u", "syncli", "--", "/usr/bin/dotnet", str(api_root / "api/Doctor.Api.dll"), "--provision"], env=provisioning, cwd=str(api_root / "api"))
    for link, target in ((Path("/opt/syncli/current"), api_root), (Path("/srv/syncli/current"), web_root)):
        assert not link.exists() and not link.is_symlink(), "existing release must not be replaced implicitly"
        link.symlink_to(target, target_is_directory=True)
    shutil.copy2(stage / "syncli-api.service", "/etc/systemd/system/syncli-api.service")
    backups = Path("/etc/syncli/backups")
    backups.mkdir(exist_ok=True)
    backups.chmod(0o700)
    shutil.copy2("/etc/caddy/Caddyfile", backups / ("Caddyfile-" + release_id))
    shutil.copy2(stage / "Caddyfile.ip", "/etc/caddy/Caddyfile")
    activate_services()
    print("Installed synthetic release " + release_id + "; API and Caddy enabled. Public HTTPS verification is still required.")


if __name__ == "__main__":
    main()
