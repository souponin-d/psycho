using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Doctor.Api;

internal static class ClinicalFacts
{
  private static readonly string[] Categories=["diagnosis","somatic","medication","allergy"];
  private static string S(JsonNode? value,string key)=>value is null ? "" : Domain.S(value,key);
  private static void Check(bool ok,string message,int status=400){if(!ok)throw new DomainException(message,status);}
  private static void Only(JsonObject obj,params string[] keys)=>Check(obj.All(p=>keys.Contains(p.Key)),"Клинический факт содержит неизвестные поля.");
  private static string Text(JsonObject obj,string key,bool required=false,int maximum=20000){Check(obj[key] is JsonValue scalar&&scalar.TryGetValue<string>(out _),$"Проверьте {key}.");var value=S(obj,key);Check(value.Length<=maximum&&(!required||!string.IsNullOrWhiteSpace(value)),$"Проверьте {key}.");return value;}
  private static JsonObject Object(JsonNode obj,string key)=>Domain.Object(obj,key);
  private static JsonArray Array(JsonNode obj,string key)=>Domain.Array(obj,key);
  private static bool Equal(JsonNode? a,JsonNode? b)=>JsonNode.DeepEquals(a,b);
  private static JsonObject ActorJson(Actor actor)=>new(){["id"]=actor.Id,["name"]=actor.Name,["specialty"]=actor.Specialty,["clinicId"]=actor.ClinicId};
  public static JsonObject Latest(JsonObject fact)=>fact["versions"]!.AsArray().Last()!.AsObject();
  public static JsonArray Legacy(JsonObject patient,bool includeRecorded=false){
    var result=new JsonArray();var profile=Object(patient,"profile");
    void Add(string key,JsonObject content,string quote,string label){
      if(string.IsNullOrWhiteSpace(quote))return;
      var origin=new JsonObject{["kind"]="legacy",["reference"]=key,["quote"]=quote,["observedAt"]="",["legacyContent"]=content.DeepClone()};
      var previous=(patient["clinicalFacts"] as JsonArray??[]).OfType<JsonObject>().SelectMany(f=>Array(f,"versions").OfType<JsonObject>()).Where(v=>S(v["origin"],"kind")=="legacy"&&S(v["origin"],"reference")==key).ToArray();
      if(!includeRecorded&&previous.Any(v=>Equal(v["origin"],origin)))return;
      result.Add(new JsonObject{["key"]=key,["content"]=content,["origin"]=origin,["label"]=label,["changed"]=previous.Length>0});
    }
    foreach(var (field,category,label) in new[]{("allergies","allergy","Аллергии из профиля"),("currentMedication","medication","Лекарства из профиля")}){var text=S(profile,field);Add($"profile:{field}",new(){["category"]=category,["state"]="unresolved",["text"]=text},text,label);}
    var conditions=Array(Object(profile,"clinicalContext"),"somaticConditions");for(var i=0;i<conditions.Count;i++){var c=conditions[i]!;Add($"profile:somatic:{i}",new(){["category"]="somatic",["state"]="known",["condition"]=c.DeepClone()},$"{S(c,"code")} {S(c,"title")} · {S(c,"sourceVersion")}","Соматика из профиля");}
    foreach(var e in Array(patient,"episodes").OfType<JsonObject>()){if(S(e,"status")=="closed"||string.IsNullOrWhiteSpace(S(e,"diagnosis")))continue;var content=e["diagnosisCode"] is not null?new JsonObject{["category"]="diagnosis",["state"]="known",["condition"]=e["diagnosisCode"]!.DeepClone(),["diagnosticStatus"]=S(e,"diagnosisStatus")}:new JsonObject{["category"]="diagnosis",["state"]="unresolved",["text"]=S(e,"diagnosis")};Add($"episode:{S(e,"id")}",content,$"{S(e,"diagnosis")} · {S(e,"diagnosisStatus")}",$"Эпизод: {S(e,"title")}");}
    foreach(var visit in Array(patient,"visits").OfType<JsonObject>().Where(v=>S(v,"status")!="cancelled")){var diagnoses=Array(visit,"diagnoses");for(var i=0;i<diagnoses.Count;i++){var d=diagnoses[i]!.DeepClone().AsObject();var status=S(d,"status");d.Remove("status");Add($"visit:{S(visit,"id")}:{i}",new(){["category"]="diagnosis",["state"]="known",["condition"]=d,["diagnosticStatus"]=status},$"{S(d,"code")} {S(d,"title")} · {status} · {S(d,"sourceVersion")}",$"Диагноз из приёма {S(visit,"scheduledAt")}");}}
    foreach(var plan in Array(patient,"plan").OfType<JsonObject>().Where(p=>S(p,"kind")=="medication"&&S(p,"status")=="confirmed")){var content=plan["medicine"] is not null?new JsonObject{["category"]="medication",["state"]="known",["medicine"]=plan["medicine"]!.DeepClone(),["details"]="Назначено в плане; фактический приём не подтверждён"}:new JsonObject{["category"]="medication",["state"]="unresolved",["text"]=S(plan,"title")};Add($"plan:{S(plan,"id")}",content,$"{S(plan,"title")} · {S(plan,"dose")} · {S(plan,"schedule")}","Назначение в плане, не подтверждение приёма");}
    return result;
  }
  private static void ValidateOrigin(JsonObject patient,JsonObject origin,JsonObject? previous,string now){
    Only(origin,"kind","reference","quote","observedAt","legacyContent");var kind=Text(origin,"kind");Check(kind=="legacy"||!origin.ContainsKey("legacyContent"),"Снимок прежней записи допустим только для её источника.");Check(new[]{"patient","document","clinician","relative","legacy"}.Contains(kind),"Неизвестное происхождение факта.");var reference=Text(origin,"reference",true,500);var quote=Text(origin,"quote",true,100000);var date=Text(origin,"observedAt");
    if(date!="")Check(Regex.IsMatch(date,@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$")&&DateTimeOffset.TryParse(date,CultureInfo.InvariantCulture,DateTimeStyles.None,out var timestamp)&&timestamp<=DateTimeOffset.Parse(now,CultureInfo.InvariantCulture),"Проверьте дату источника.");
    if(kind=="document"){var doc=Array(patient,"documents").OfType<JsonObject>().FirstOrDefault(d=>S(d,"id")==reference);Check(doc is not null&&S(doc,"status")!="excluded"&&S(doc,"text").Contains(quote,StringComparison.Ordinal),"Документ или цитата не найдены в текущей карте либо документ исключён.");}
    if(kind=="legacy")Check(Legacy(patient,true).Any(r=>Equal(r?["origin"],origin))||(previous is not null&&Equal(previous["origin"],origin)),"Прежняя запись не найдена; источник нельзя выдумать.");
  }
  private static JsonNode? Condition(JsonNode? content)=>S(content,"state")=="known"&&S(content,"category") is "diagnosis" or "somatic"?content?["condition"]:null;
  private static JsonObject? Medicine(JsonNode? content)=>S(content,"state")=="known"&&S(content,"category")=="medication"?content?["medicine"] as JsonObject:null;
  private static void ValidateContent(JsonObject content,JsonObject? previous,JsonObject? legacy,Actor actor,string now){
    var category=Text(content,"category");var state=Text(content,"state");Check(Categories.Contains(category),"Неизвестная категория факта.");if(legacy is not null)Check(S(legacy["content"],"category")==category,"Категория прежней записи не совпадает.");if(previous is not null)Check(S(previous["content"],"category")==category,"Категорию факта нельзя переписать; создайте отдельный факт.");
    if(state=="unknown"){Only(content,"category","state");return;}
    if(state=="unresolved"){Only(content,"category","state","text");Text(content,"text",true);Check((legacy is not null&&Equal(legacy["content"],content))||(previous is not null&&Equal(previous["content"],content)),"Неразобранный текст сохраняется только из прежней записи; уточните структуру.");return;}
    if(category=="allergy"&&state=="none-known"){Only(content,"category","state");return;}
    Check(state=="known","Неизвестное состояние факта.");
    if(category is "diagnosis" or "somatic"){
      Only(content,category=="diagnosis"?["category","state","condition","diagnosticStatus"]:["category","state","condition"]);var condition=Object(content,"condition");Only(condition,"system","sourceOid","sourceVersion","code","title");foreach(var field in new[]{"system","sourceOid","sourceVersion","code","title"})Text(condition,field,true);
      var prior=new JsonArray();var old=Condition(previous?["content"]);var source=Condition(legacy?["content"]);if(old is not null)prior.Add(old.DeepClone());if(source is not null)prior.Add(source.DeepClone());Check(Icd10Catalog.Allowed(condition,prior),"Выберите запись МКБ-10.");
      if(category=="diagnosis"){var diagnosticStatus=Text(content,"diagnosticStatus");Check(new[]{"hypothesis","confirmed"}.Contains(diagnosticStatus),"Проверьте статус диагноза.");if(diagnosticStatus=="confirmed")Check(actor.Specialty=="psychiatrist"||(legacy is not null&&Equal(legacy["content"],content))||(previous is not null&&Equal(previous["content"],content)),"Подтверждение диагноза доступно психиатру.",403);}
    }else if(category=="medication"){
      Only(content,"category","state","medicine","details");Text(content,"details");var prior=Medicine(previous?["content"])??Medicine(legacy?["content"]);Check(GrlsCatalog.Allowed(Object(content,"medicine"),prior,now[..10]),"Выберите препарат из ГРЛС либо сохраните исходный исторический снимок.");
    }else {Only(content,"category","state","substance","reaction");Text(content,"substance",true,500);Text(content,"reaction");}
  }
  public static void Apply(JsonObject patient,JsonObject mutation,Actor actor,string now){
    var save=S(mutation,"type")=="fact.save";Only(mutation,save?["type","value"]:["type","id","expectedVersion","decision","reason"]);var draft=save?Object(mutation,"value"):mutation;if(save)Only(draft,"id","expectedVersion","content","origin","reason");
    var id=Text(draft,"id",true,100);var reason=Text(draft,"reason");Check(draft["expectedVersion"] is JsonValue scalar&&scalar.TryGetValue<int>(out var version)&&version>=0,"Проверьте версию факта.");var expected=draft["expectedVersion"]!.GetValue<int>();
    patient["clinicalFacts"]??=new JsonArray();var list=Array(patient,"clinicalFacts");var fact=list.OfType<JsonObject>().FirstOrDefault(f=>S(f,"id")==id);var previous=fact is not null?Latest(fact):null;
    Check((previous?["version"]?.GetValue<int>()??0)==expected,"Версия клинического факта изменилась. Загрузите актуальные сведения.",409);Check(previous is null||S(previous,"status")!="inactive","Неактуальный факт остаётся в истории; создайте новый факт.");
    JsonObject content,origin;string status;
    if(save){
      content=Object(draft,"content");origin=Object(draft,"origin");ValidateOrigin(patient,origin,previous,now);var legacy=S(origin,"kind")=="legacy"?Legacy(patient,true).OfType<JsonObject>().FirstOrDefault(r=>Equal(r["origin"],origin)):null;
      if(previous is null&&legacy is not null)Check(!list.OfType<JsonObject>().Any(f=>Array(f,"versions").Any(v=>Equal(v?["origin"],legacy["origin"]))),"Эта прежняя запись уже перенесена в контекст.",409);
      ValidateContent(content,previous,legacy,actor,now);if(previous is not null||(legacy is not null&&!Equal(legacy["content"],content)))Check(!string.IsNullOrWhiteSpace(reason),"Укажите причину исправления.");status=S(content,"state")=="unknown"?"unknown":"unverified";
    }else{
      Check(previous is not null,"Клинический факт не найден.");content=Object(previous!,"content");origin=Object(previous!,"origin");var decision=Text(mutation,"decision");status=decision switch{"confirm"=>"confirmed","clarify"=>"clarification","contradict"=>"contradictory","unknown"=>"unknown","inactivate"=>"inactive",_=>throw new DomainException("Неизвестное решение по факту.")};
      if(decision=="confirm"){Check(S(content,"state") is not ("unknown" or "unresolved"),"Сначала уточните структурированное значение факта.");if(S(content,"category")=="diagnosis")Check(actor.Specialty=="psychiatrist","Подтверждение диагноза доступно психиатру.",403);ValidateOrigin(patient,origin,previous,now);}
      if(decision=="unknown")Check(S(content,"state")=="unknown","Неизвестно не подменяет известные сведения; исправьте значение отдельной версией.");if(decision is "contradict" or "inactivate")Check(!string.IsNullOrWhiteSpace(reason),"Укажите причину решения.");
    }
    Check(list.Count<500||fact is not null,"Достигнут лимит фактов карты.");Check(fact is null||Array(fact,"versions").Count<200,"История факта достигла лимита; обратитесь к администратору.");
    var next=new JsonObject{["version"]=expected+1,["content"]=content.DeepClone(),["origin"]=origin.DeepClone(),["status"]=status,["changedAt"]=now,["changedBy"]=ActorJson(actor),["verifiedAt"]=status=="confirmed"?now:"",["verifiedBy"]=status=="confirmed"?ActorJson(actor):null,["reason"]=reason};
    if(fact is null)list.Add(new JsonObject{["id"]=id,["versions"]=new JsonArray(next)});else Array(fact,"versions").Add(next);
  }
  internal static string StatusLabel(string status)=>status switch {"unverified"=>"Не проверено","confirmed"=>"Подтверждено врачом","clarification"=>"Требует уточнения","contradictory"=>"Противоречие","unknown"=>"Неизвестно","inactive"=>"Неактуально",_=>status};
  internal static string ValueText(JsonObject value){
    var state=S(value,"state");var category=S(value,"category");if(state=="unknown")return "Сведений нет; это не отрицательный ответ";if(state=="unresolved")return S(value,"text");
    if(category=="allergy")return state=="none-known"?"Известные аллергии отрицает — явное сообщение":S(value,"substance")+(S(value,"reaction")!=""?$" · {S(value,"reaction")}":"");
    if(category=="medication"){var m=value["medicine"];return $"{S(m,"tradeName")} · {S(m,"inn")} · РУ {S(m,"registrationNumber")}"+(S(value,"details")!=""?$" · {S(value,"details")}":"");}
    return $"{S(value["condition"],"code")} · {S(value["condition"],"title")}"+(category=="diagnosis"?$" · {(S(value,"diagnosticStatus")=="confirmed"?"Подтверждённый диагноз":"Рабочая гипотеза")}":"");
  }
  public static JsonArray Context(JsonObject patient)=>new((patient["clinicalFacts"] as JsonArray??[]).OfType<JsonObject>().OrderBy(f=>S(f,"id"),StringComparer.Ordinal).Select(f=>{var v=Latest(f);var origin=v["origin"];return (JsonNode?)JsonValue.Create($"{S(f,"id")} | {v["version"]!.GetValue<int>()} | {S(v["content"],"category")} | {S(v,"status")} | {ValueText(Object(v,"content"))} | {S(origin,"kind")} | {S(origin,"reference")} | {S(origin,"observedAt")} | {S(origin,"quote")}");}).ToArray());
}
