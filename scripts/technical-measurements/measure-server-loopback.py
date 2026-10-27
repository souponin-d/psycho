"""Diagnostic production HTTPS run on the VPS: separates WAN path from server processing.

The generator shares VPS resources; this is not an external capacity measurement.
Only two login fields enter SSH stdin; temporary private configuration is removed.
"""
import argparse
import json
import pathlib
import subprocess

parser = argparse.ArgumentParser(description=__doc__)
parser.add_argument("--config", required=True)
parser.add_argument("--output", required=True)
parser.add_argument("--ssh-key", required=True)
parser.add_argument("--known-hosts", required=True)
parser.add_argument("--proxy-command", required=True)
args = parser.parse_args()
config = json.loads(pathlib.Path(args.config).read_text(encoding="utf-8-sig"))
source = pathlib.Path("scripts/measure-technical-http.py").read_text(encoding="utf-8")
remote = r'''
import contextlib, json, pathlib, shutil, socket, sys, tempfile
payload=json.load(sys.stdin)
directory=pathlib.Path(tempfile.mkdtemp(prefix="measure58-loopback-",dir="/var/tmp"))
try:
    config=directory/"private.json"
    config.write_text(json.dumps(payload["config"]))
    config.chmod(0o600)
    output=directory/"result.json"
    scope={"__name__":"measurement_module"}
    exec(compile(payload["source"],"measure-technical-http.py","exec"),scope)
    original=socket.create_connection
    def loopback(address,*args,**kwargs):
        return original(("127.0.0.1",address[1]) if address[0]=="176.32.37.10" else address,*args,**kwargs)
    socket.create_connection=loopback
    sys.argv=["measure","--origin","https://176.32.37.10","--config",str(config),"--output",str(output),"--iterations","30"]
    with contextlib.redirect_stdout(sys.stderr):
        scope["main"]()
    result=json.loads(output.read_text())
    result["scope"]="Production Caddy/API/PostgreSQL via verified HTTPS loopback; generator shares VPS resources"
    print(json.dumps(result))
finally:
    if directory.parent==pathlib.Path("/var/tmp") and directory.name.startswith("measure58-loopback-"):
        shutil.rmtree(directory)
'''
command = ["ssh", "-4", "-T", "-o", "BatchMode=yes", "-o", "IdentitiesOnly=yes", "-o",
    "StrictHostKeyChecking=yes", "-o", "ConnectTimeout=15", "-o", "UserKnownHostsFile=" + args.known_hosts,
    "-o", "ProxyCommand=" + args.proxy_command, "-i", args.ssh_key, "root@176.32.37.10",
    "python3 -c " + "'" + remote.replace("'", "'\"'\"'") + "'"]
result = subprocess.run(command, input=json.dumps({"source": source,
    "config": {k: config[k] for k in ("doctorEmail", "doctorPassword")}}),
    capture_output=True, text=True, timeout=300)
if result.returncode:
    raise RuntimeError("Remote diagnostic failed; private stderr withheld")
data = json.loads(result.stdout)
pathlib.Path(args.output).write_text(json.dumps(data, indent=2) + "\n", encoding="utf-8")
print(json.dumps({"scope": "sequential diagnostic only, one request at a time", "series": {
    name: values["summary"] for name, values in data["series"].items()}}))
