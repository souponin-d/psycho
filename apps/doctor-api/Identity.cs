using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;

namespace Doctor.Api;

public record Actor(string Id, string Name, string Specialty, string ClinicId, string? PatientId = null, int SecurityVersion = 1)
{
  public static Actor From(ClaimsPrincipal principal) => new(
      principal.FindFirstValue(ClaimTypes.NameIdentifier)!, principal.Identity!.Name!,
      principal.FindFirstValue("specialty")!, principal.FindFirstValue("clinic")!,
      principal.FindFirstValue("patient"), int.Parse(principal.FindFirstValue("version")!));

  public ClaimsPrincipal Principal()
  {
    var claims = new List<Claim> { new(ClaimTypes.NameIdentifier, Id), new(ClaimTypes.Name, Name),
            new("specialty", Specialty), new("clinic", ClinicId), new("version", SecurityVersion.ToString()),
            new(ClaimTypes.Role, PatientId is null ? "doctor" : "patient") };
    if (PatientId is not null) claims.Add(new("patient", PatientId));
    return new(new ClaimsIdentity(claims, "Cookies"));
  }
}
public static class Passwords
{
  private const int Iterations = 600_000;
  public static string Hash(string password)
  {
    if (password.Length < 14 || password.Length > 200) throw new InvalidOperationException("Пароль должен содержать от 14 до 200 символов.");
    var salt = RandomNumberGenerator.GetBytes(24);
    var hash = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), salt, Iterations, HashAlgorithmName.SHA256, 32);
    return $"{Iterations}:{Convert.ToBase64String(salt)}:{Convert.ToBase64String(hash)}";
  }
  public static bool Verify(string password, string stored)
  {
    if (password.Length > 200) return false;
    var parts = stored.Split(':');
    if (parts.Length != 3 || !int.TryParse(parts[0], out var iterations)) return false;
    var hash = Rfc2898DeriveBytes.Pbkdf2(Encoding.UTF8.GetBytes(password), Convert.FromBase64String(parts[1]), iterations, HashAlgorithmName.SHA256, 32);
    return CryptographicOperations.FixedTimeEquals(hash, Convert.FromBase64String(parts[2]));
  }
}
public class DomainException(string message, int status = 400) : Exception(message)
{
  public int Status { get; } = status;
}
