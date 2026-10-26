using System.Text.Json.Nodes;

namespace Doctor.Api;

// Source evidence is not clinical activation or physician approval.
internal static class ClinicalProtocols
{
  private static readonly JsonArray Catalog = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "ClinicalProtocols.json")))!.AsArray();
  public static JsonObject? Find(string version) => Catalog.OfType<JsonObject>().FirstOrDefault(p => Domain.S(p, "version") == version)?.DeepClone().AsObject();
  public static JsonArray Context() => new(Catalog.OfType<JsonObject>().OrderBy(p => Domain.S(p, "version"), StringComparer.Ordinal).Select(p => (JsonNode?)new JsonObject { ["version"] = Domain.S(p, "version"), ["contentHash"] = Domain.S(p, "contentHash") }).ToArray());
  public static JsonObject? Describe(JsonObject protocol, int? score)
  {
    var known = Find(Domain.S(protocol, "version"));
    if (known is null || Domain.S(protocol, "status") != "evidence-reviewed" || Domain.S(known, "scale") != Domain.S(protocol, "scale") || score is null || score < known["minimum"]!.GetValue<int>() || score > known["maximum"]!.GetValue<int>()) return null;
    var severity = score < 5 ? "Минимальная" : score < 10 ? "Лёгкая" : score < 15 ? "Умеренная" : Domain.S(known, "scale") == "PHQ-9" && score < 20 ? "Умеренно тяжёлая" : "Тяжёлая";
    var symptom = Domain.S(known, "scale") == "GAD-7" ? "тревожных" : "депрессивных";
    return new JsonObject { ["label"] = $"{severity} выраженность {symptom} симптомов", ["sourceUrl"] = "https://archive.thepcc.org/sites/default/files/resources/instructions.pdf", ["diagnostic"] = false };
  }
}
