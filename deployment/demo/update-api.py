"""Update only the existing synthetic VPS API; preserve web, database and protection keys.
Root: python3 update-api.py STAGE RELEASE --clinic CLINIC --backup-password-file PRIVATE_FILE
Rollback: python3 update-api.py --rollback RELEASE --backup-password-file PRIVATE_FILE
"""
import argparse
import hashlib
import json
import os
from pathlib import Path
import re
import shutil
import subprocess
import tarfile
import tempfile
import time
import urllib.request
import uuid

RELEASES=Path('/opt/syncli/releases')
CURRENT=Path('/opt/syncli/current')
ENV_FILE=Path('/etc/syncli/api.env')
BACKUPS=Path('/root/syncli-backups')
REQUIRED={'Sources.json','Icd10Legacy.json','Migrations/001_initial.sql','Doctor.Api.dll','Doctor.Api.deps.json','Doctor.Api.runtimeconfig.json','Grls.json.gz','GrlsManifest.json','Icd10Ru.json','Icd10Ru.manifest.json','ClinicalProtocols.json','ClinicalSupportCatalog.json','AviandrRules.json','doctor.openapi.json'}

def run(args,*,data=None):
 result=subprocess.run(args,input=data,stdout=subprocess.PIPE,stderr=subprocess.PIPE)
 if result.returncode:raise RuntimeError('Operation failed: '+str(args[0]))
 return result.stdout

def valid_release(value):
 if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9-]{0,99}',value):raise ValueError('Invalid release ID')
 return value

def updated_environment(original,clinic,release):
 valid_release(release)
 if not re.fullmatch(r'[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}',clinic):raise ValueError('One explicit synthetic clinic is required')
 lines=original.splitlines()
 environment=[line.split('=',1)[1].strip().strip('"') for line in lines if line.startswith('ASPNETCORE_ENVIRONMENT=')]
 if environment!=['Production']:raise ValueError('Existing Production environment is required')
 updates={'Clinical__SyntheticEnabled':'true','Clinical__SyntheticClinicIds':clinic,'Syncli__ReleaseId':release}
 kept=[line for line in lines if line.split('=',1)[0] not in updates]
 return '\n'.join(kept+[f'{key}="{value}"' for key,value in updates.items()])+'\n'

def validate_stage(stage,release):
 try:
  manifest=json.loads((stage/'RELEASE.json').read_text())
  if manifest['releaseId']!=valid_release(release):raise ValueError('Release mismatch')
  files=manifest['apiFiles']
  if not REQUIRED.issubset(files):raise ValueError('Incomplete API release')
  actual={str(p.relative_to(stage/'api')).replace('\\','/') for p in (stage/'api').rglob('*') if p.is_file()}
  if actual!=set(files):raise ValueError('Unexpected API file')
  for name,digest in files.items():
   target=stage/'api'/name
   if target.is_symlink() or not target.resolve().is_relative_to((stage/'api').resolve()):raise ValueError('Unsafe release path')
   if hashlib.sha256(target.read_bytes()).hexdigest()!=digest:raise ValueError('Release checksum mismatch')
  return manifest
 except (OSError,KeyError,TypeError,json.JSONDecodeError) as error:raise ValueError('Invalid release package') from error

def transactional_activate(activate,restart,healthy,restore):
 try:
  activate();restart()
  if not healthy():raise RuntimeError('Release health check failed')
 except BaseException:
  restore();restart();raise

def write_environment(content):
 metadata=ENV_FILE.stat();temp=ENV_FILE.with_name('api.env.update-'+uuid.uuid4().hex)
 try:
  temp.write_text(content);os.chmod(temp,metadata.st_mode&0o777);os.chown(temp,metadata.st_uid,metadata.st_gid);os.replace(temp,ENV_FILE)
 finally:temp.unlink(missing_ok=True)

def point_current(target):
 resolved=Path(target).resolve()
 if not resolved.is_relative_to(RELEASES.resolve()) or not (resolved/'api/Doctor.Api.dll').is_file():raise ValueError('Invalid current target')
 temp=CURRENT.with_name('current-update-'+uuid.uuid4().hex)
 try:temp.symlink_to(resolved,target_is_directory=True);os.replace(temp,CURRENT)
 finally:temp.unlink(missing_ok=True)

def backup(database,password_file,release):
 if not re.fullmatch(r'syncli_[a-z0-9_]{1,45}',database):raise ValueError('Dedicated synthetic database required')
 if not password_file.is_file() or password_file.stat().st_mode&0o077:raise ValueError('Private backup password file required')
 BACKUPS.mkdir(exist_ok=True);BACKUPS.chmod(0o700)
 encrypted=BACKUPS/(release+'.tar.enc')
 if encrypted.exists():raise ValueError('Backup must not be overwritten')
 with tempfile.TemporaryDirectory(prefix='update-',dir=BACKUPS) as folder:
  folder=Path(folder);dump=folder/'database.dump'
  dump.write_bytes(run(['runuser','-u','postgres','--','pg_dump','-Fc',database]))
  plain=folder/'payload.tar'
  with tarfile.open(plain,'w') as archive:
   for source,name in [(dump,'database.dump'),(ENV_FILE,'api.env'),(Path('/etc/syncli/dataprotection.pfx'),'dataprotection.pfx'),(Path('/var/lib/syncli/keys'),'keys')]:archive.add(source,arcname=name)
  run(['openssl','enc','-aes-256-cbc','-pbkdf2','-iter','600000','-salt','-in',str(plain),'-out',str(encrypted),'-pass','file:'+str(password_file)])
  restored=folder/'verified.tar'
  run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','600000','-in',str(encrypted),'-out',str(restored),'-pass','file:'+str(password_file)])
  if hashlib.sha256(plain.read_bytes()).digest()!=hashlib.sha256(restored.read_bytes()).digest():raise RuntimeError('Backup integrity failed')
  # Restore into a unique disposable database before touching the running release.
  check='syncli_updatecheck_'+uuid.uuid4().hex[:12]
  run(['runuser','-u','postgres','--','createdb',check])
  try:
   run(['runuser','-u','postgres','--','pg_restore','--no-owner','--exit-on-error','-d',check],data=dump.read_bytes())
   query=b"SELECT count(*),coalesce(sum(jsonb_array_length(document->'messages')),0) FROM patient_records;"
   def counts(name):return run(['runuser','-u','postgres','--','psql','-At','-d',name],data=query).strip()
   if counts(check)!=counts(database):raise RuntimeError('Backup restore check differs; retry on a stable synthetic chart')
  finally:
   if re.fullmatch(r'syncli_updatecheck_[0-9a-f]{12}',check):run(['runuser','-u','postgres','--','dropdb',check])
 encrypted.chmod(0o600)
 return encrypted

def health(release):
 for _ in range(12):
  try:
   with urllib.request.urlopen('https://176.32.37.10/api/health',timeout=3) as response:
    value=json.load(response)
    if value.get('release')==release and value.get('status')=='ready':return True
  except Exception:pass
  time.sleep(0.5)
 return False

def rollback(release,password_file):
 state=json.loads((RELEASES/valid_release(release)/'UPDATE.json').read_text())
 old=Path(state['previous']).resolve()
 if not old.is_relative_to(RELEASES.resolve()):raise ValueError('Invalid rollback target')
 encrypted=BACKUPS/(release+'.tar.enc')
 with tempfile.TemporaryDirectory(prefix='rollback-',dir=BACKUPS) as folder:
  plain=Path(folder)/'backup.tar'
  run(['openssl','enc','-d','-aes-256-cbc','-pbkdf2','-iter','600000','-in',str(encrypted),'-out',str(plain),'-pass','file:'+str(password_file)])
  with tarfile.open(plain) as archive:
   stream=archive.extractfile('api.env')
   if stream is None:raise RuntimeError('Backup environment missing')
   original=stream.read().decode()
  write_environment(original);point_current(old);run(['systemctl','restart','syncli-api'])
 print('Previous API and environment restored; database and protection keys retained')

def main():
 os.umask(0o077)
 if os.geteuid()!=0:raise PermissionError('root required')
 parser=argparse.ArgumentParser();parser.add_argument('stage',nargs='?');parser.add_argument('release',nargs='?');parser.add_argument('--clinic');parser.add_argument('--database',default='syncli_hackathon');parser.add_argument('--backup-password-file',type=Path,required=True);parser.add_argument('--rollback')
 args=parser.parse_args()
 if args.rollback:rollback(args.rollback,args.backup_password_file);return
 if not args.stage or not args.release or not args.clinic:parser.error('stage, release and --clinic are required')
 stage=Path(args.stage).resolve();manifest=validate_stage(stage,args.release)
 if not CURRENT.is_symlink():raise ValueError('Existing managed current symlink required')
 previous=CURRENT.resolve();original=ENV_FILE.read_text();new_environment=updated_environment(original,args.clinic,args.release)
 if not previous.is_relative_to(RELEASES.resolve()):raise ValueError('Invalid previous release')
 target=RELEASES/args.release
 if target.exists():raise ValueError('Release must be new')
 encrypted=backup(args.database,args.backup_password_file,args.release)
 target.mkdir(mode=0o750);shutil.copytree(stage/'api',target/'api');shutil.copy2(stage/'RELEASE.json',target/'RELEASE.json')
 import grp
 gid=grp.getgrnam('syncli').gr_gid
 for p in [target,*target.rglob('*')]:os.chown(p,0,gid);p.chmod(0o750 if p.is_dir() else 0o640)
 state={'previous':str(previous),'releaseId':args.release,'backup':str(encrypted),'sourceCommit':manifest.get('sourceCommit')}
 (target/'UPDATE.json').write_text(json.dumps(state));(target/'UPDATE.json').chmod(0o600)
 def activate():write_environment(new_environment);point_current(target)
 def restore():write_environment(original);point_current(previous)
 transactional_activate(activate,lambda:run(['systemctl','restart','syncli-api']),lambda:health(args.release),restore)
 print('PASS API release '+args.release+'; encrypted backup verified and restored into an isolated database; previous release retained')

if __name__=='__main__':main()

