import importlib.util
import tempfile
import hashlib,json
from pathlib import Path
import unittest
spec=importlib.util.spec_from_file_location('update',Path(__file__).resolve().parents[1]/'deployment/demo/update-api.py')
update=importlib.util.module_from_spec(spec);spec.loader.exec_module(update)
class UpdateChecks(unittest.TestCase):
 def test_environment_keeps_production_secrets_and_existing_settings(self):
  original='ASPNETCORE_ENVIRONMENT="Production"\nConnectionStrings__Doctor="synthetic-connection"\nDoctor__KeyCertificatePassword="synthetic-secret"\nHackathon__Enabled="true"\n'
  value=update.updated_environment(original,'synthetic-clinic','release-44')
  for line in original.splitlines(): self.assertIn(line,value)
  self.assertIn('Clinical__SyntheticEnabled="true"',value);self.assertIn('Clinical__SyntheticClinicIds="synthetic-clinic"',value);self.assertIn('Syncli__ReleaseId="release-44"',value)
 def test_replaces_old_allowlist_instead_of_accumulating_permissions(self):
  value=update.updated_environment('ASPNETCORE_ENVIRONMENT="Production"\nClinical__SyntheticClinicIds="old-clinic"\n','new-clinic','release-44')
  self.assertNotIn('old-clinic',value);self.assertEqual(value.count('Clinical__SyntheticClinicIds='),1)
 def test_refuses_development_and_unbounded_clinic(self):
  for env,clinic in [('ASPNETCORE_ENVIRONMENT=Development\n','synthetic'),('ASPNETCORE_ENVIRONMENT=Production\n','*'),('ASPNETCORE_ENVIRONMENT=Production\n','a,b')]:
   with self.assertRaises(ValueError):update.updated_environment(env,clinic,'release-44')
 def test_refuses_missing_or_modified_release_files(self):
  with tempfile.TemporaryDirectory() as folder:
   with self.assertRaises(ValueError):update.validate_stage(Path(folder),'release-44')
 def test_rejects_a_checksum_valid_release_without_required_sources(self):
  with tempfile.TemporaryDirectory() as folder:
   stage=Path(folder);(stage/'api').mkdir();files={}
   for name in update.REQUIRED:
    if name=='Sources.json':continue
    target=stage/'api'/name;target.parent.mkdir(parents=True,exist_ok=True);target.write_bytes(b'synthetic')
    files[name]=hashlib.sha256(target.read_bytes()).hexdigest()
   (stage/'RELEASE.json').write_text(json.dumps({'releaseId':'release-44','apiFiles':files}))
   with self.assertRaises(ValueError):update.validate_stage(stage,'release-44')
 def test_activation_success_preserves_order(self):
  steps=[];update.transactional_activate(lambda:steps.append('activate'),lambda:steps.append('restart'),lambda:True,lambda:steps.append('restore'))
  self.assertEqual(steps,['activate','restart'])
 def test_failed_health_restores_pointer_and_environment_and_restarts_previous(self):
  steps=[]
  with self.assertRaises(RuntimeError):update.transactional_activate(lambda:steps.append('activate'),lambda:steps.append('restart'),lambda:False,lambda:steps.append('restore'))
  self.assertEqual(steps,['activate','restart','restore','restart'])
 def test_activation_failure_also_restores_previous_state(self):
  steps=[]
  def activate():steps.append('activate');raise OSError('synthetic')
  with self.assertRaises(OSError):update.transactional_activate(activate,lambda:steps.append('restart'),lambda:True,lambda:steps.append('restore'))
  self.assertEqual(steps,['activate','restore','restart'])
if __name__=='__main__':unittest.main()

