using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Doctor.Api;

internal static class Adherence
{
  private static string S(JsonNode? n,string key)=>n is null?"":Domain.S(n,key);
  private static JsonArray A(JsonNode n,string key)=>Domain.Array(n,key);
  private static void Check(bool ok,string message){if(!ok)throw new DomainException(message);}
  private static void Only(JsonObject n,params string[] keys)=>Check(n.All(p=>keys.Contains(p.Key)),"Неподдерживаемое поле приверженности.");
  private static string Text(JsonObject n,string key,bool required=false,int limit=2000){Check(n[key] is JsonValue v&&v.TryGetValue<string>(out var text)&&text.Length<=limit&&(!required||!string.IsNullOrWhiteSpace(text)),"Проверьте текстовое поле и причину изменения.");return S(n,key);}
  private static int Integer(JsonObject n,string key,int minimum,int maximum){Check(n[key] is JsonValue v&&v.TryGetValue<int>(out var value)&&value>=minimum&&value<=maximum,"Неверная версия или числовое значение.");return n[key]!.GetValue<int>();}
  private static DateOnly Date(string value){Check(Regex.IsMatch(value,@"^\d{4}-\d{2}-\d{2}$")&&DateOnly.TryParseExact(value,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out _),"Несуществующая календарная дата.");return DateOnly.ParseExact(value,"yyyy-MM-dd",CultureInfo.InvariantCulture);}
  private static string Instant(string value){Check(Regex.IsMatch(value,@"^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d(?:\.\d{1,3})?(?:Z|[+-](?:0\d|1[0-4]):[0-5]\d)$"),"Укажите время ISO с часовым поясом.");Date(value[..10]);Check(DateTimeOffset.TryParse(value,CultureInfo.InvariantCulture,DateTimeStyles.None,out _),"Неверное время.");return DateTimeOffset.Parse(value,CultureInfo.InvariantCulture).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ",CultureInfo.InvariantCulture);}
  private static JsonObject Person(Actor actor)=>new(){["id"]=actor.Id,["name"]=actor.Name,["specialty"]=actor.Specialty,["clinicId"]=actor.ClinicId,["patientId"]=actor.PatientId,["securityVersion"]=actor.SecurityVersion};
  private static string LocalDate(string at,int offset)=>DateTimeOffset.Parse(at,CultureInfo.InvariantCulture).AddMinutes(offset).ToString("yyyy-MM-dd",CultureInfo.InvariantCulture);
  private static string PlannedAt(string day,string time,int offset)=>DateTimeOffset.Parse($"{day}T{time}:00.000Z",CultureInfo.InvariantCulture).AddMinutes(-offset).ToString("yyyy-MM-ddTHH:mm:ss.fffZ",CultureInfo.InvariantCulture);
  private static string SlotId(JsonObject schedule,string at)=>$"{S(schedule,"id")}@{schedule["version"]!.GetValue<int>()}:{at}";
  private static bool IsSlot(JsonObject schedule,string at){var offset=schedule["offsetMinutes"]!.GetValue<int>();var day=LocalDate(at,offset);return string.CompareOrdinal(at,S(schedule,"effectiveFrom"))>=0&&(S(schedule,"effectiveUntil")==""||string.CompareOrdinal(at,S(schedule,"effectiveUntil"))<0)&&string.CompareOrdinal(day,S(schedule,"endDate"))<=0&&A(schedule,"times").Any(t=>PlannedAt(day,t!.GetValue<string>(),offset)==at);}
  private static JsonObject[] Latest(JsonObject state)=>A(state,"schedules").OfType<JsonObject>().GroupBy(s=>S(s,"id")).Select(g=>g.OrderByDescending(s=>s["version"]!.GetValue<int>()).First()).ToArray();
  private static bool SamePlan(JsonObject a,JsonObject b)=>new[]{"id","kind","title","details","dose","schedule","startDate","endDate","confirmedAt","confirmedBy"}.All(k=>JsonNode.DeepEquals(a[k],b[k]))&&JsonNode.DeepEquals(a["medicine"],b["medicine"]);

  public static void Apply(JsonObject p,JsonObject mutation,Actor actor,string now)
  {
    if(Environment.GetEnvironmentVariable("ASPNETCORE_ENVIRONMENT")!="Development")throw new DomainException("Учебные команды доступны только в отдельной Development-среде.",403);
    Check(p["archived"] is not JsonValue archived||!archived.GetValue<bool>(),"Архивная карта доступна только для чтения.");
    var at=Instant(now);Only(mutation,"type","value");var v=Domain.Object(mutation,"value");var state=p["adherence"] as JsonObject??new JsonObject{["schedules"]=new JsonArray(),["records"]=new JsonArray()};
    if(S(mutation,"type")=="adherence.schedule"){
      Only(v,"id","expectedVersion","planId","times","offsetMinutes","effectiveFrom","endDate","reason");var id=Text(v,"id",true,100);var planId=Text(v,"planId",true,100);var reason=Text(v,"reason",true);var expected=Integer(v,"expectedVersion",0,10000);var offset=Integer(v,"offsetMinutes",-720,840);Check(offset%15==0,"Смещение часового пояса должно быть кратно 15 минутам.");
      var times=A(v,"times");Check(times.Count>0&&times.Count<=24,"Нужно от 1 до 24 времён приёма.");Check(times.All(t=>t is JsonValue j&&j.TryGetValue<string>(out var time)&&Regex.IsMatch(time,@"^(?:[01]\d|2[0-3]):[0-5]\d$")),"Время приёма должно иметь формат ЧЧ:ММ.");Check(times.Select(t=>t!.GetValue<string>()).Distinct().Count()==times.Count,"Время приёма не должно повторяться.");
      var from=Instant(Text(v,"effectiveFrom",true));var end=Text(v,"endDate",true);Date(end);Check(string.CompareOrdinal(end,LocalDate(from,offset))>=0,"Дата окончания раньше начала расписания.");
      var plan=A(p,"plan").OfType<JsonObject>().FirstOrDefault(r=>S(r,"id")==planId);Check(plan is not null&&S(plan,"kind")=="medication"&&S(plan,"status")=="confirmed"&&S(plan,"confirmedAt")!=""&&S(plan,"confirmedBy")!="","Выберите подтверждённое лекарственное назначение.");
      Check(string.CompareOrdinal(from,Instant(S(plan,"confirmedAt")))>=0,"Расписание не может начинаться раньше подтверждения назначения.");
      if(S(plan,"startDate")!="")Check(string.CompareOrdinal(LocalDate(from,offset),S(plan,"startDate")[..10])>=0,"Расписание начинается раньше назначения.");
      if(S(plan,"endDate")!="")Check(string.CompareOrdinal(end,S(plan,"endDate")[..10])<=0,"Расписание выходит за срок назначения.");
      var latest=Latest(state);var previous=latest.FirstOrDefault(s=>S(s,"id")==id);Check((previous?["version"]?.GetValue<int>()??0)==expected,"Расписание изменилось. Обновите данные.");Check(previous is null||S(previous,"planId")==planId,"Версия расписания не может менять назначение.");Check(previous is null||string.CompareOrdinal(from,at)>=0&&string.CompareOrdinal(from,S(previous,"effectiveFrom"))>0,"Новую версию можно начать только сейчас или в будущем.");
      Check(!latest.Any(s=>S(s,"id")!=id&&S(s,"planId")==planId&&(S(s,"effectiveUntil")==""||string.CompareOrdinal(S(s,"effectiveUntil"),from)>0)&&string.CompareOrdinal(S(s,"endDate"),LocalDate(from,s["offsetMinutes"]!.GetValue<int>()))>=0),"Для назначения уже есть пересекающееся расписание.");Check(A(state,"schedules").Count<1000,"Достигнут предел версий расписаний.");
      var next=new JsonObject{["id"]=id,["version"]=expected+1,["planId"]=planId,["times"]=new JsonArray(times.Select(t=>t!.GetValue<string>()).Order(StringComparer.Ordinal).Select(t=>(JsonNode?)JsonValue.Create(t)).ToArray()),["offsetMinutes"]=offset,["effectiveFrom"]=from,["endDate"]=end,["effectiveUntil"]="",["closedAt"]="",["closeReason"]="",["planSnapshot"]=plan!.DeepClone(),["createdAt"]=at,["createdBy"]=Person(actor),["reason"]=reason};
      if(previous is not null&&(S(previous,"effectiveUntil")==""||string.CompareOrdinal(S(previous,"effectiveUntil"),from)>0)){previous["effectiveUntil"]=from;previous["closedAt"]=at;previous["closeReason"]=$"Новая версия расписания: {reason}";}A(state,"schedules").Add(next);
    }else if(S(mutation,"type")=="adherence.record"){
      Only(v,"scheduleId","scheduleVersion","plannedAt","status","reportedAt","provenance","reason","expectedVersion");var scheduleId=Text(v,"scheduleId",true,100);var scheduleVersion=Integer(v,"scheduleVersion",1,10000);var expected=Integer(v,"expectedVersion",0,10000);var reason=Text(v,"reason");var status=Text(v,"status");Check(new[]{"taken","missed","not-applicable","unknown"}.Contains(status),"Проверьте статус приёма.");var provenance=Text(v,"provenance");Check(provenance is "patient" or "clinician","Укажите происхождение отметки.");var planned=Instant(Text(v,"plannedAt",true));var reported=Instant(Text(v,"reportedAt",true));Check(string.CompareOrdinal(planned,at)<=0&&string.CompareOrdinal(reported,at)<=0&&string.CompareOrdinal(reported,planned)>=0,"Отметка не может относиться к будущему или предшествовать плановому приёму.");
      var schedule=A(state,"schedules").OfType<JsonObject>().FirstOrDefault(s=>S(s,"id")==scheduleId&&s["version"]!.GetValue<int>()==scheduleVersion);Check(schedule is not null&&IsSlot(schedule,planned),"Слот не соответствует версии расписания.");var id=SlotId(schedule!,planned);var previous=A(state,"records").OfType<JsonObject>().FirstOrDefault(r=>S(r,"id")==id);Check((previous?["version"]?.GetValue<int>()??0)==expected,"Отметка изменилась. Обновите данные.");Check(status!="not-applicable"||!string.IsNullOrWhiteSpace(reason),"Укажите причину неприменимости приёма.");Check(previous is null||!string.IsNullOrWhiteSpace(reason),"Укажите причину исправления отметки.");Check(A(state,"records").Count<10000||previous is not null,"Достигнут предел отметок.");
      var revision=new JsonObject{["version"]=expected+1,["status"]=status,["reportedAt"]=reported,["provenance"]=provenance,["reason"]=reason,["at"]=at,["by"]=Person(actor)};
      if(previous is not null){previous["version"]=expected+1;previous["status"]=status;previous["reportedAt"]=reported;previous["provenance"]=provenance;previous["reason"]=reason;A(previous,"history").Add(revision);}else A(state,"records").Add(new JsonObject{["id"]=id,["scheduleId"]=scheduleId,["scheduleVersion"]=scheduleVersion,["plannedAt"]=planned,["version"]=1,["status"]=status,["reportedAt"]=reported,["provenance"]=provenance,["reason"]=reason,["history"]=new JsonArray(revision)});
    }else throw new DomainException("Неизвестная команда приверженности.");
    if(p["adherence"] is null)p["adherence"]=state;
  }

  public static void Reconcile(JsonObject p,Actor actor,string now)
  {
    if(p["adherence"] is not JsonObject state)return;var at=Instant(now);
    foreach(var schedule in A(state,"schedules").OfType<JsonObject>()){
      if(S(schedule,"effectiveUntil")!=""&&string.CompareOrdinal(S(schedule,"effectiveUntil"),at)<=0)continue;
      var plan=A(p,"plan").OfType<JsonObject>().FirstOrDefault(r=>S(r,"id")==S(schedule,"planId"));
      if(plan is not null&&S(plan,"kind")=="medication"&&S(plan,"status")=="confirmed"&&SamePlan(plan,Domain.Object(schedule,"planSnapshot")))continue;
      schedule["effectiveUntil"]=at;schedule["closedAt"]=at;schedule["closeReason"]=plan is null?"Назначение недоступно":S(plan,"status")!="confirmed"?"Назначение прекращено или завершено":"Контекст назначения изменился; необходимо новое расписание";
    }
  }
}
