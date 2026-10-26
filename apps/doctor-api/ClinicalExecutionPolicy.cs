using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Doctor.Api;

/// <summary>Server-only opt-in for the dedicated synthetic clinic, never a clinical approval.</summary>
public static class ClinicalExecutionPolicy
{
  private sealed record Settings(bool Enabled, string[] ClinicIds);
  private static Settings settings = new(false, []);
  public static void Configure(IConfiguration configuration)
  {
    var enabled = configuration.GetValue<bool>("Clinical:SyntheticEnabled");
    var ids = (configuration["Clinical:SyntheticClinicIds"] ?? "").Split(',', StringSplitOptions.TrimEntries | StringSplitOptions.RemoveEmptyEntries).Distinct(StringComparer.Ordinal).ToArray();
    if (ids.Length > 100 || ids.Any(id => !Regex.IsMatch(id, @"^[A-Za-z0-9][A-Za-z0-9_.:-]{0,127}$")) || enabled && ids.Length == 0)
      throw new InvalidOperationException("Синтетический клинический режим требует явного списка допустимых clinic ID без wildcard.");
    Volatile.Write(ref settings, new Settings(enabled, ids));
  }
  public static void AssertAllowed(JsonObject patient, Actor actor)
  {
    var environment = Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT");
    var current = Volatile.Read(ref settings);
    var allowedEnvironment = environment == "Development" || environment == "Production" && current.Enabled && current.ClinicIds.Contains(actor.ClinicId, StringComparer.Ordinal);
    var sameClinic = patient["clinicId"] is JsonValue clinic && clinic.TryGetValue<string>(out var id) && id == actor.ClinicId && !string.IsNullOrWhiteSpace(id);
    if (!allowedEnvironment || !sameClinic || actor.PatientId is not null || actor.Specialty == "patient")
      throw new DomainException("Учебные команды доступны только врачу своей клиники в Development или в явно разрешённом синтетическом контуре Production.", 403);
  }
}
