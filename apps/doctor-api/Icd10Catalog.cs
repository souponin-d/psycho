using System.Text.Json.Nodes;
using System.Security.Cryptography;
using System.Text.RegularExpressions;

namespace Doctor.Api;

// Both runtimes consume the same versioned artifact. Never use client-provided labels as a lookup.
internal static class Icd10Catalog
{
  private static readonly JsonObject Catalog = Load();
  private static readonly JsonObject Legacy = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Icd10Legacy.json")))!.AsObject();
  private static readonly string Version = Domain.S(Catalog["source"], "sourceVersion");
  private static readonly Dictionary<string, string> Current = Catalog["records"]!.AsArray().OfType<JsonObject>()
    .Where(r => r["active"]!.GetValue<bool>() && Domain.S(r, "kind") == "code")
    .ToDictionary(r => Domain.S(r, "code"), r => Domain.S(r, "title"), StringComparer.Ordinal);
  private static readonly Dictionary<string, string> Historical = Legacy["entries"]!.AsArray().OfType<JsonObject>()
    .ToDictionary(r => Domain.S(r, "code"), r => Domain.S(r, "title"), StringComparer.Ordinal);
  private static readonly string[] Keys = ["system", "sourceOid", "sourceVersion", "code", "title"];
  private static readonly SearchRow[] SearchRows = BuildSearchRows();
  private sealed record SearchRow(JsonObject Selection, string Code, string Title, string Context, string[] AncestorCodes);

  private static JsonObject Load()
  {
    var bytes = File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory, "Icd10Ru.json"));
    var manifest = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Icd10Ru.manifest.json")))!.AsObject();
    if (!Convert.ToHexString(SHA256.HashData(bytes)).Equals(Domain.S(manifest, "artifactSha256"), StringComparison.OrdinalIgnoreCase)) throw new InvalidDataException("Контрольная сумма МКБ-10 не совпадает.");
    return JsonNode.Parse(bytes)!.AsObject();
  }
  public static void Initialize() { _ = SearchRows.Length; }
  private static string Normalize(string value) => Regex.Replace(value.Trim().ToLowerInvariant().Replace('ё', 'е'), @"\s+", " ");
  private static SearchRow[] BuildSearchRows()
  {
    var nodes = Catalog["records"]!.AsArray().OfType<JsonObject>().ToDictionary(r => Domain.S(r, "id"));
    return nodes.Values.Where(r => r["active"]!.GetValue<bool>() && Domain.S(r, "kind") == "code").Select(r => {
      var ancestors = new List<string>(); var ancestorCodes = new List<string>(); var parent = Domain.S(r, "parentId");
      while (parent != "") { var node = nodes[parent]; ancestors.Add($"{Domain.S(node, "code")} {Domain.S(node, "title")}"); ancestorCodes.Add(Domain.S(node, "code").ToLowerInvariant()); parent = Domain.S(node, "parentId"); }
      var code = Domain.S(r, "code"); var title = Domain.S(r, "title");
      return new SearchRow(new JsonObject { ["system"] = "ICD-10-RU", ["sourceOid"] = "1.2.643.5.1.13.13.11.1005", ["sourceVersion"] = Version, ["code"] = code, ["title"] = title }, code.ToLowerInvariant(), Normalize(title), Normalize(string.Join(' ', ancestors)), ancestorCodes.ToArray());
    }).ToArray();
  }
  public static JsonObject Search(string query, int page, int pageSize)
  {
    if (query.Length > 250 || page < 1 || pageSize is < 1 or > 100) throw new DomainException("Запрос: до 250 символов; страница от 1; размер страницы 1–100.");
    var needle = Normalize(query); var code = needle.Replace(" ", ""); var words = needle.Split(' ');
    var chapter = Regex.Match(needle, @"^класс\s+([ivx]+)$");
    var matches = SearchRows.Where(r => chapter.Success ? r.AncestorCodes.Contains(chapter.Groups[1].Value) : needle == "" || r.Code.Contains(code, StringComparison.Ordinal) || words.All(r.Title.Contains) || words.All(r.Context.Contains))
      .OrderByDescending(r => r.Code == code).ToArray();
    var offset = (long)(page - 1) * pageSize;
    var items = offset >= matches.Length ? [] : matches.Skip((int)offset).Take(pageSize).Select(r => (JsonNode)r.Selection.DeepClone()).ToArray();
    return new JsonObject { ["sourceVersion"] = Version, ["total"] = matches.Length, ["page"] = page, ["pageSize"] = pageSize, ["items"] = new JsonArray(items) };
  }

  public static bool Allowed(JsonObject value, JsonArray? previous = null)
  {
    if (Domain.S(value, "system") != "ICD-10-RU" || Domain.S(value, "sourceOid") != "1.2.643.5.1.13.13.11.1005") return false;
    var code = Domain.S(value, "code"); var title = Domain.S(value, "title"); var version = Domain.S(value, "sourceVersion");
    if (version == Version && Current.TryGetValue(code, out var expected) && title == expected) return true;
    return version == Domain.S(Legacy, "sourceVersion") && Historical.TryGetValue(code, out var old) && title == old &&
      previous is not null && previous.OfType<JsonObject>().Any(p => Keys.All(k => Domain.S(p, k) == Domain.S(value, k)));
  }
}
