using System.Text.Json.Nodes;
using Microsoft.Extensions.Configuration;
using Doctor.Api;
var beforeEnvironment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
var doctor = new Actor("synthetic-doctor", "Синтетический врач", "psychiatrist", "synthetic-clinic");
var patient = new JsonObject { ["clinicId"] = doctor.ClinicId };
int passed = 0;
void Check(bool condition,string text) { if(!condition) throw new Exception(text); passed++; }
void Denied(Action action) { try {action();throw new Exception("Policy bypass");} catch(DomainException e) when(e.Status==403){passed++;} }
IConfiguration Config(bool enabled=false,string clinics="")=>new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?> { ["Clinical:SyntheticEnabled"]=enabled.ToString(),["Clinical:SyntheticClinicIds"]=clinics }).Build();
try {
 foreach(var environment in new string?[]{"Production","Staging",null,"development"}) {
  Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT",environment);ClinicalExecutionPolicy.Configure(Config());Denied(()=>ClinicalExecutionPolicy.AssertAllowed(patient,doctor));
 }
 Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT","Development");ClinicalExecutionPolicy.Configure(Config());ClinicalExecutionPolicy.AssertAllowed(patient,doctor);passed++;
 Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT","Production");ClinicalExecutionPolicy.Configure(Config(true,"synthetic-clinic"));ClinicalExecutionPolicy.AssertAllowed(patient,doctor);passed++;
 Denied(()=>ClinicalExecutionPolicy.AssertAllowed(patient,doctor with{ClinicId="another-clinic"}));
 Denied(()=>ClinicalExecutionPolicy.AssertAllowed(new JsonObject{["clinicId"]="another-clinic"},doctor));
 Denied(()=>ClinicalExecutionPolicy.AssertAllowed(patient,doctor with{PatientId="synthetic-patient",Specialty="patient"}));
 foreach(var bad in new[]{"","*","synthetic-clinic,*"}) {try {ClinicalExecutionPolicy.Configure(Config(true,bad));throw new Exception("Invalid configuration accepted");}catch(InvalidOperationException){passed++;}}
 ClinicalExecutionPolicy.Configure(Config(false,"synthetic-clinic"));Denied(()=>ClinicalExecutionPolicy.AssertAllowed(patient,doctor));
 ClinicalExecutionPolicy.Configure(Config(true,"synthetic-clinic"));
 // All command entry points must reject a different clinic before mutating state.
 foreach(var (name,type) in new[]{("ClinicalWorkflow","workflow.submit"),("ClinicalSupport","support.evaluate"),("Adherence","adherence.schedule")}) {
  var entry=typeof(Domain).Assembly.GetType("Doctor.Api."+name)!.GetMethod("Apply")!;
  var p=new JsonObject{["clinicId"]="another-clinic"};var original=p.ToJsonString();
  try {entry.Invoke(null,new object[]{p,new JsonObject{["type"]=type},doctor,"2026-10-26T10:00:00.000Z"});throw new Exception("Entry point bypass");}
  catch(System.Reflection.TargetInvocationException e) when(e.InnerException is DomainException d&&d.Status==403){passed++;}
  Check(p.ToJsonString()==original,"Denied clinical command changed state");
 }
 Console.WriteLine($"PASS clinical synthetic policy: {passed} checks; Production/clinic/role/default denial and unchanged state");
} finally {Environment.SetEnvironmentVariable("ASPNETCORE_ENVIRONMENT",beforeEnvironment);ClinicalExecutionPolicy.Configure(Config());}
