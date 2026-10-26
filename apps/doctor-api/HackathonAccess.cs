using System.Globalization;
using System.Security.Claims;

namespace Doctor.Api;

/// <summary>Opt-in access to one synthetic patient; never grants doctor rights.</summary>
public sealed class HackathonAccess
{
  public const string ModeClaim = "syncli-access-mode";
  public bool Enabled { get; }
  public string PatientUserId { get; }
  public DateTimeOffset ExpiresAt { get; }
  private readonly string codeHash;
  public HackathonAccess(IConfiguration configuration)
  {
    Enabled = configuration.GetValue<bool>("Hackathon:Enabled");
    PatientUserId = configuration["Hackathon:PatientUserId"]?.Trim() ?? "";
    codeHash = configuration["Hackathon:CodeHash"] ?? "";
    if (!Enabled) return;
    if (PatientUserId.Length == 0 || codeHash.Length == 0 || !DateTimeOffset.TryParse(configuration["Hackathon:ExpiresAt"], CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal, out var expiry))
      throw new InvalidOperationException("Для хакатонного доступа задайте PatientUserId, CodeHash и ExpiresAt.");
    ExpiresAt = expiry;
  }
  public bool Active => Enabled && DateTimeOffset.UtcNow < ExpiresAt;
  public bool VerifyCode(string code) => Active && Passwords.Verify(code, codeHash);
  public bool Allows(Actor actor) => Active && actor.Id == PatientUserId && actor.PatientId is not null && actor.Specialty == "patient";
  public static bool IsCodeSession(ClaimsPrincipal principal) => principal.HasClaim(ModeClaim, "hackathon");
}

public record PatientAccessRequest(string? Code);
