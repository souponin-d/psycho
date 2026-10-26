using System.IO.Compression;
using System.Security.Cryptography;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Doctor.Api;

internal static class GrlsCatalog
{
  private static readonly JsonSerializerOptions Options = new(JsonSerializerDefaults.Web);
  private sealed record CatalogData(string SourceVersion, string SnapshotDate, Medicine[] Records);
  internal sealed record Medicine(string RecordId, string RegistrationNumber, string TradeName, string Inn, string Forms, string Manufacturers, string Holder, string RegisteredOn, string ExpiresOn, string CancelledOn, string RegistrationStatus);
  private static readonly CatalogData Data = Load();
  private static readonly Dictionary<string, Medicine> ById = Data.Records.ToDictionary(r=>r.RecordId,StringComparer.Ordinal);
  private static readonly HashSet<string> Active = ["Действующий","Выдано по правилам ЕАЭС","Действует, на подтверждении государственной регистрации","Действует, в иностранных упаковках"];
  private static readonly string[] Keys = ["system","sourceVersion","recordId","registrationNumber","tradeName","inn","forms","manufacturers","holder","registeredOn","expiresOn","cancelledOn","registrationStatus"];
  private static readonly (Medicine Item, string Text)[] Index = Data.Records.Select(r=>(r, Normalize($"{r.RegistrationNumber} {r.TradeName} {r.Inn} {r.Forms} {r.Manufacturers} {r.Holder}"))).ToArray();
  private static CatalogData Load() {
    var bytes=File.ReadAllBytes(Path.Combine(AppContext.BaseDirectory,"Grls.json.gz"));
    var manifest=JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory,"GrlsManifest.json")))!;
    if(!Convert.ToHexString(SHA256.HashData(bytes)).Equals(Domain.S(manifest,"artifactSha256"),StringComparison.OrdinalIgnoreCase))throw new InvalidDataException("SHA-256 ГРЛС не совпадает.");
    using var gzip=new GZipStream(new MemoryStream(bytes),CompressionMode.Decompress);
    var data=JsonSerializer.Deserialize<CatalogData>(gzip,Options) ?? throw new InvalidDataException("Пустой ГРЛС.");
    if(data.SourceVersion!=Domain.S(manifest,"sourceVersion")||data.Records.Length!=manifest["currentRecords"]!.GetValue<int>())throw new InvalidDataException("Неполный ГРЛС.");
    return data;
  }
  public static void Initialize(){_ = Index.Length;}
  private static string Normalize(string value)=>Regex.Replace(value.ToLowerInvariant().Replace('ё','е').Trim(),@"\s+"," ");
  private static bool Current(Medicine r,string on)=>Active.Contains(r.RegistrationStatus)&&(r.RegistrationStatus=="Действует, на подтверждении государственной регистрации"||r.ExpiresOn==""||string.CompareOrdinal(r.ExpiresOn,on)>=0)&&(r.CancelledOn==""||string.CompareOrdinal(r.CancelledOn,on)>0);
  private static JsonObject Selection(Medicine r)=>new(){["system"]="GRLS",["sourceVersion"]=Data.SourceVersion,["recordId"]=r.RecordId,["registrationNumber"]=r.RegistrationNumber,["tradeName"]=r.TradeName,["inn"]=r.Inn,["forms"]=r.Forms,["manufacturers"]=r.Manufacturers,["holder"]=r.Holder,["registeredOn"]=r.RegisteredOn,["expiresOn"]=r.ExpiresOn,["cancelledOn"]=r.CancelledOn,["registrationStatus"]=r.RegistrationStatus};
  private static bool Shape(JsonObject value)=>value.Count==Keys.Length && Keys.All(k=>value[k] is JsonValue v&&v.TryGetValue<string>(out var s)&&s.Length<=1_000_000)&&Domain.S(value,"system")=="GRLS";
  public static bool IsCurrent(JsonObject value,string on) => Shape(value)&&ById.TryGetValue(Domain.S(value,"recordId"),out var r)&&Current(r,on)&&Keys.All(k=>Domain.S(value,k)==Domain.S(Selection(r),k));
  public static bool Allowed(JsonObject value,JsonObject? previous,string on)=>IsCurrent(value,on)||(previous is not null&&Shape(value)&&Shape(previous)&&Keys.All(k=>Domain.S(value,k)==Domain.S(previous,k)));
  public static JsonObject Search(string query,int page,int pageSize){
    if(query.Length>250||page<1||pageSize is <1 or >100)throw new DomainException("Проверьте запрос и страницу ГРЛС.");
    var on=DateTimeOffset.UtcNow.ToString("yyyy-MM-dd");var words=Normalize(query).Split(' ');
    var matches=Index.Where(r=>Current(r.Item,on)&&words.All(r.Text.Contains)).ToArray();
    var offset=(long)(page-1)*pageSize;
    var items=offset>=matches.Length?[]:matches.Skip((int)offset).Take(pageSize).Select(r=>(JsonNode)Selection(r.Item)).ToArray();
    return new JsonObject{["sourceVersion"]=Data.SourceVersion,["snapshotDate"]=Data.SnapshotDate,["total"]=matches.Length,["page"]=page,["pageSize"]=pageSize,["items"]=new JsonArray(items)};
  }
}
