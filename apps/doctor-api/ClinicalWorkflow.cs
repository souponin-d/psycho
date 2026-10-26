using System.Globalization;
using System.Text.Encodings.Web;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;
namespace Doctor.Api;

// Technical fixture only; no clinical activation route.
internal static class ClinicalWorkflow {
  private const string RuleVersion="clinical-review-2026-10-26-v2";
  private const string Limit="Учебный сценарий. Не устанавливает диагноз, не выбирает лечение, не подтверждает безопасность. Клинические правила не утверждены.";
  private static readonly JsonSerializerOptions Wire=new(){Encoder=JavaScriptEncoder.UnsafeRelaxedJsonEscaping};
  private static readonly string[] Stages=["created","delivered","acknowledged","assessed","acted"];
  private static readonly Dictionary<string,string> Labels=new(){["discuss"]="Обсудить на приёме",["verify"]="Уточнить данные",["scale"]="Выдать самоопросник",["followup"]="Контрольный контакт",["monitor"]="Проверить приверженность",["consultation"]="Подготовить консультацию",["investigation"]="Подготовить обследование"};
  private static string S(JsonNode? n,string k)=>n is null?"":Domain.S(n,k);
  private static JsonObject O(JsonNode n,string k)=>Domain.Object(n,k);
  private static JsonArray A(JsonNode n,string k)=>Domain.Array(n,k);
  private static void Check(bool ok,string message,int status=400){if(!ok)throw new DomainException(message,status);}
  private static void Only(JsonObject n,params string[] keys)=>Check(n.All(p=>keys.Contains(p.Key)),"Неизвестные поля учебной команды.");
  private static string Text(JsonObject n,string k,bool required=false,int max=20000){Check(n[k] is JsonValue v&&v.TryGetValue<string>(out var s)&&s.Length<=max&&(!required||!string.IsNullOrWhiteSpace(s)),"Проверьте текст или причину решения.");return S(n,k);}
  private static int Version(JsonObject n){Check(n["expectedVersion"] is JsonValue v&&v.TryGetValue<int>(out var i)&&i>0,"Нужна версия объекта.");return n["expectedVersion"]!.GetValue<int>();}
  private static JsonObject Person(Actor a)=>new(){["id"]=a.Id,["clinicId"]=a.ClinicId,["name"]=a.Name,["specialty"]=a.Specialty};
  private static JsonObject Decision(Actor a,string now,string decision,string reason,string action)=>new(){["at"]=now,["by"]=Person(a),["decision"]=decision,["reason"]=reason,["action"]=action};
  private static void Calendar(string value,string now,bool required=false)=>Check(value==""&&!required||value.Length==10&&DateOnly.TryParseExact(value,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out _)&&string.CompareOrdinal(value,now[..10])>=0,"Укажите корректный будущий срок.");
  private static JsonObject Find(JsonObject w,string collection,string id){var r=A(w,collection).OfType<JsonObject>().FirstOrDefault(r=>S(r,"id")==id);Check(r is not null,"Объект учебного контура не найден.");return r!;}
  public static bool OwnsEffect(JsonNode? r,string id)=>S(r,"effectId")==id||(r?["supersededEffects"] as JsonArray??[]).Any(e=>S(e,"id")==id);
  private static JsonArray Facts(JsonObject p)=>p["clinicalFacts"] as JsonArray??new();
  public static JsonObject Protocol()=>new(){["id"]="synthetic-followup",["version"]="synthetic-7-v1",["title"]="Оценка состояния · 7 пунктов",["window"]="Последние 14 дней",["items"]=7,["minimum"]=0,["maximum"]=3,["status"]="synthetic-only",["source"]="Технический эталон проекта: 7 целых ответов 0–3; не утверждённая клиническая шкала",["clinicalApproval"]=null};
  private static JsonObject State(JsonObject p){p["workflow"]??=new JsonObject{["mode"]="synthetic",["assessments"]=new JsonArray(),["recommendations"]=new JsonArray(),["safety"]=new JsonArray(),["assignments"]=new JsonArray(),["contacts"]=new JsonArray(),["serial"]=0};return O(p,"workflow");}
  public static string ContextKey(JsonObject p,Actor? actor=null){
    var documents=new JsonArray();foreach(var f in Facts(p).OfType<JsonObject>().OrderBy(f=>S(f,"id"),StringComparer.Ordinal)){var origin=ClinicalFacts.Latest(f)["origin"]!;if(S(origin,"kind")!="document")continue;var doc=A(p,"documents").FirstOrDefault(d=>S(d,"id")==S(origin,"reference"));documents.Add(new JsonObject{["factId"]=S(f,"id"),["documentId"]=S(origin,"reference"),["status"]=doc is null?"missing":S(doc,"status"),["quotePresent"]=doc is not null&&S(doc,"text").Contains(S(origin,"quote"),StringComparison.Ordinal)});}
    var medications=new JsonArray();foreach(var item in A(p,"plan").Where(x=>S(x,"kind")=="medication"&&S(x,"status")!="draft").OrderBy(x=>S(x,"id"),StringComparer.Ordinal))medications.Add(new JsonObject{["id"]=S(item,"id"),["status"]=S(item,"status"),["title"]=S(item,"title"),["recordId"]=S(item?["medicine"],"recordId"),["sourceVersion"]=S(item?["medicine"],"sourceVersion"),["dose"]=S(item,"dose"),["schedule"]=S(item,"schedule"),["startDate"]=S(item,"startDate"),["endDate"]=S(item,"endDate")});
    return new JsonObject{["facts"]=ClinicalFacts.Context(p),["assessments"]=new JsonArray((p["workflow"] is JsonObject w?A(w,"assessments"):new JsonArray()).Select(a=>(JsonNode?)JsonValue.Create(S(a,"id"))).ToArray()),["documents"]=documents,["medications"]=medications,["rulesVersion"]=RuleVersion,["specialty"]=actor?.Specialty??S(p["workflow"],"reviewSpecialty"),["protocols"]=ClinicalProtocols.Context()}.ToJsonString(Wire);
  }
  private static bool RuleSourceCurrent(JsonObject r){var source=r["source"] as JsonObject;if(source is null)return false;var version=S(source,"version");return version=="synthetic-7-v1"?JsonNode.DeepEquals(source,Protocol()):S(r,"ruleVersion")==RuleVersion&&JsonNode.DeepEquals(source,ClinicalProtocols.Find(version));}
  public static void Reconcile(JsonObject p,Actor actor,string now){
    if(p["workflow"] is not JsonObject w)return;w["reviewSpecialty"]=actor.Specialty;var key=ContextKey(p,actor);var rows=A(w,"recommendations");
    foreach(var r in rows.OfType<JsonObject>())if((S(r,"contextKey")!=key||!RuleSourceCurrent(r))&&!r["stale"]!.GetValue<bool>()){r["stale"]=true;r["version"]=r["version"]!.GetValue<int>()+1;}
    var ordered=A(w,"assessments").OfType<JsonObject>().Reverse().OrderByDescending(a=>DateTimeOffset.Parse(S(a,"measuredAt"),CultureInfo.InvariantCulture)).ThenByDescending(a=>DateTimeOffset.Parse(S(a,"receivedAt"),CultureInfo.InvariantCulture)).ToArray();
    var latest=ordered.FirstOrDefault();var latestId=S(latest,"id");var source=Protocol();
    void Add(string reason,string type,string action,string title,string rationale,JsonArray facts,string priority="routine",string? category=null,string destination="",string? ruleId=null){
      if(rows.OfType<JsonObject>().Any(r=>!r["stale"]!.GetValue<bool>()&&S(r,"contextKey")==key&&S(r,"title")==title&&S(r,"assessmentId")==latestId&&JsonNode.DeepEquals(r["factIds"],facts)))return;
      Check(rows.Count<2000,"Достигнут лимит рекомендаций; история не удаляется автоматически.");var serial=w["serial"]!.GetValue<int>()+1;w["serial"]=serial;
      var row=new JsonObject{["id"]=$"wf-r-{serial}",["version"]=1,["type"]=type,["priority"]=priority,["title"]=title,["rationale"]=rationale,["source"]=source.DeepClone(),["limitations"]=Limit,["assessmentId"]=latestId,["factIds"]=facts,["contextKey"]=key,["action"]=action,["dueDate"]="",["destination"]=destination,["status"]="new",["stale"]=false,["effectId"]="",["effectSnapshot"]=null,["createdAt"]=now,["history"]=new JsonArray(Decision(actor,now,"created",reason,action))};
      if(S(source,"status")!="synthetic-only")row["ruleVersion"]=RuleVersion;
      if(category is not null)row["referralCategory"]=category;
      if(ruleId is not null)row["ruleId"]=ruleId;
      rows.Add(row);
    }
    foreach(var current in ordered.GroupBy(a=>S(a,"protocolVersion")).Select(g=>g.First())){
      latest=current;latestId=S(current,"id");source=S(current,"protocolVersion")=="synthetic-7-v1"?Protocol():ClinicalProtocols.Find(S(current,"protocolVersion"))??Protocol();
      if(S(current,"protocolVersion")!="synthetic-7-v1"&&!JsonNode.DeepEquals(current["source"],ClinicalProtocols.Find(S(current,"protocolVersion")))){
        Add($"source:{latestId}","clarification","verify","Сверить версию методики","Источник методики изменился. Проверьте версию и применимость результата.",new(),"important",ruleId:S(source,"status")=="synthetic-only"?null:"source-review-v1");
        continue;
      }
      var complete=S(current,"completeness")=="complete";
      if(S(source,"status")=="synthetic-only"){
        var score=current["score"] is null?"итог не рассчитан":$"сумма {current["score"]!.GetValue<int>()} из 21";
        Add($"result:{latestId}",complete?"observation":"clarification",complete?"discuss":"verify",complete?"Рассмотреть новую оценку":"Уточнить неполные сведения или отказ",$"{(complete?"Полная оценка":S(current,"completeness")=="partial"?"Есть пропуски":S(current,"completeness")=="declined"?"Отказ от заполнения":"Анкета не заполнена")}: {score}.",new());
        if(complete)Add($"repeat:{latestId}","next-scale","scale","Согласовать следующее измерение","Оценка заполнена. Согласуйте необходимость и дату повторения.",new());
        continue;
      }
      var scale=S(source,"scale");
      Add($"result:{latestId}",complete?"observation":"clarification",complete?"discuss":"verify",$"Рассмотреть результат {scale}",complete?$"{scale}: {current["score"]} из {source["maximum"]}. {S(current["interpretation"],"label")}.":"Не все обязательные ответы получены. Требуется уточнение.",new());
      if(complete)Add($"repeat:{latestId}","next-scale","scale",$"Следующее измерение · {scale}","Согласуйте необходимость и дату повторения.",new());
      var danger=S(current,"immediateDanger")=="yes";
      var item9=scale=="PHQ-9"&&A(current,"answers")[8] is JsonValue item&&item.TryGetValue<int>(out var ninth)&&ninth>0;
      if(danger)Add("immediate-danger-v1","safety","consultation","Организовать срочную очную оценку","Пациент сообщает о непосредственной опасности. Требуется срочная очная оценка.",new(),"urgent","required","Неотложная психиатрическая оценка","immediate-danger-v1");
      else if(item9)Add("phq9-item9-v1","safety","verify","Уточнить ответ о самоповреждении","Положительный ответ на пункт 9 PHQ-9. Уточните мысли, намерение, план и необходимость срочной помощи.",new(),"important",ruleId:"phq9-item9-v1");
      var diagnoses=Facts(p).OfType<JsonObject>().Where(f=>{var v=ClinicalFacts.Latest(f);var c=v["content"];return S(c,"category")=="diagnosis"&&S(c,"state")=="known";}).ToArray();
      if(scale=="GAD-7"){
        var gad=diagnoses.Where(f=>{var v=ClinicalFacts.Latest(f);var c=v["content"];return S(v,"status")=="confirmed"&&S(c,"diagnosticStatus")=="confirmed"&&S(c?["condition"],"code")=="F41.1";}).ToArray();
        if(gad.Length>0)Add("gad-followup-v1","consultation",actor.Specialty=="psychiatrist"?"followup":"consultation","Согласовать наблюдение специалиста","Подтверждён ГТР. Требуется согласовать наблюдение психиатра или психотерапевта.",new JsonArray(gad.Select(f=>(JsonNode?)JsonValue.Create(S(f,"id"))).ToArray()),"routine",actor.Specialty=="psychiatrist"?null:"desirable",actor.Specialty=="psychiatrist"?"":"Психиатр или психотерапевт","gad-followup-v1");
      }else if(scale=="PHQ-9"){
        var depression=diagnoses.Where(f=>{var v=ClinicalFacts.Latest(f);var c=v["content"];var code=S(c?["condition"],"code");return (code=="F32"||code.StartsWith("F32.",StringComparison.Ordinal)||code=="F33"||code.StartsWith("F33.",StringComparison.Ordinal))&&S(v,"status") is not ("inactive" or "contradictory" or "clarification" or "unknown")&&(S(v,"status")=="confirmed"||S(v["origin"],"kind")=="clinician"&&S(c,"diagnosticStatus")=="hypothesis");}).ToArray();
        if(depression.Length>0)Add("depression-assessment-v1",actor.Specialty=="psychiatrist"?"clarification":"consultation",actor.Specialty=="psychiatrist"?"discuss":"consultation",actor.Specialty=="psychiatrist"?"Завершить клиническую оценку":"Организовать оценку психиатра",actor.Specialty=="psychiatrist"?"Депрессивные симптомы требуют клинического заключения психиатра.":"В карте зафиксирован депрессивный синдром или рабочая гипотеза врача. Нужна оценка психиатра.",new JsonArray(depression.Select(f=>(JsonNode?)JsonValue.Create(S(f,"id"))).ToArray()),"important",actor.Specialty=="psychiatrist"?null:"required",actor.Specialty=="psychiatrist"?"":"Психиатр","depression-assessment-v1");
      }
    }
    latest=ordered.FirstOrDefault();latestId=S(latest,"id");source=latest is null||S(latest,"protocolVersion")=="synthetic-7-v1"?Protocol():ClinicalProtocols.Find(S(latest,"protocolVersion"))??Protocol();
    foreach(var f in Facts(p).OfType<JsonObject>()){var v=ClinicalFacts.Latest(f);if(S(v,"status") is "confirmed" or "inactive")continue;Add($"fact:{S(f,"id")}","clarification","verify","Проверить клинический факт",$"{ClinicalFacts.ValueText(O(v,"content"))}; {ClinicalFacts.StatusLabel(S(v,"status"))}.",new JsonArray(JsonValue.Create(S(f,"id"))),S(v,"status")=="contradictory"?"important":"routine");}
  }
  private static void Effect(JsonObject p,JsonObject r,Actor actor,string now){
    var id=$"workflow-effect-{S(r,"id")}-v{r["version"]!.GetValue<int>()}";Check(!A(p,"plan").Any(x=>S(x,"id")==id)&&!A(p,"referrals").Any(x=>S(x,"id")==id),"Проект уже существует.",409);r["effectId"]=id;var action=S(r,"action");var source=r["source"]??Protocol();var rationale=$"{S(r,"rationale")}\nИсточник: {S(source,"id")}/{S(source,"version")}; {S(source,"status")}. {S(r,"limitations")}";
    var value=new JsonObject{["id"]=id,["createdAt"]=now,["author"]=actor.Name,["visitId"]="",["sourceIds"]=new JsonArray(),["rationale"]=rationale,["dueDate"]=S(r,"dueDate"),["status"]="draft"};
    if(action is "consultation" or "investigation"){
      var previous=string.Join("; ",A(p,"referrals").Select(f=>$"{S(f,"destination")}: {S(f,"status")}"+(S(f,"outcome")!=""?$" · {S(f,"outcome")}":"")));var missing=string.Join("; ",Facts(p).OfType<JsonObject>().Where(f=>S(ClinicalFacts.Latest(f),"status") is not ("confirmed" or "inactive")).Select(f=>ClinicalFacts.ValueText(O(ClinicalFacts.Latest(f),"content"))));
      value["destination"]=S(r,"destination");value["urgency"]=S(r,"priority");value["category"]=r["referralCategory"]?.DeepClone()??JsonValue.Create("desirable");value["reason"]=$"{(S(r,"referralReason")!=""?S(r,"referralReason"):rationale)}\nРанее зарегистрированные направления: {(previous!=""?previous:"нет сведений")}. Недостающие или непроверенные данные: {(missing!=""?missing:"полнота врачом не подтверждена")}.";value["outcome"]="";A(p,"referrals").Add(value);r["effectSnapshot"]=value.DeepClone();
    }else{value["kind"]=action=="scale"?"assessment":"follow-up";value["title"]=Labels[action];value["details"]=S(r,"rationale");foreach(var k in new[]{"dose","schedule","startDate","endDate","confirmedAt","confirmedBy","changeReason","replacesId","instructionUrl"})value[k]="";value["patientInstructions"]=action=="scale"?"Заполнить согласованный самоопросник к выбранному сроку.":"Обсудить сведения и дальнейшие действия с врачом.";A(p,"plan").Add(value);r["effectSnapshot"]=value.DeepClone();}
  }
  public static void Apply(JsonObject p,JsonObject m,Actor actor,string now){
    ClinicalExecutionPolicy.AssertAllowed(p,actor);
    var w=State(p);var type=S(m,"type");
    if(type=="workflow.submit"){
      Only(m,"type","value");var v=O(m,"value");Only(v,"id","protocolVersion","measuredAt","answers","state","safety","note","assignmentId","impact","immediateDanger");
      var id=Text(v,"id",true,100);var protocolVersion=Text(v,"protocolVersion");var old=protocolVersion=="synthetic-7-v1";var protocol=(old?Protocol():ClinicalProtocols.Find(protocolVersion))??throw new DomainException("Неизвестная версия учебного протокола.");
      var measured=Text(v,"measuredAt",true);Check(Regex.IsMatch(measured,@"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2})$")&&DateTimeOffset.TryParse(measured,CultureInfo.InvariantCulture,DateTimeStyles.None,out var instant)&&instant<=DateTimeOffset.Parse(now,CultureInfo.InvariantCulture),"Проверьте дату результата; будущее недопустимо.");
      if(!old){var birth=S(p["profile"],"birthDate");Check(DateOnly.TryParseExact(birth,"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var birthday)&&DateOnly.TryParseExact(measured[..10],"yyyy-MM-dd",CultureInfo.InvariantCulture,DateTimeStyles.None,out var measuredDate)&&birthday.AddYears(18)<=measuredDate,"Шкала доступна только взрослым на дату измерения.");}
      Text(v,"note");var assignmentId=Text(v,"assignmentId",false,100);var completion=Text(v,"state");var safety=Text(v,"safety");Check(new[]{"completed","declined","cannot"}.Contains(completion)&&new[]{"yes","no","unknown"}.Contains(safety),"Проверьте полноту и ответ о безопасности.");
      var immediate=v.ContainsKey("immediateDanger")?Text(v,"immediateDanger"):"unknown";Check(new[]{"yes","no","unknown"}.Contains(immediate),"Проверьте ответ о непосредственной опасности.");
      Check(!v.ContainsKey("impact")||v["impact"] is null||v["impact"] is JsonValue impact&&impact.TryGetValue<int>(out var impactValue)&&impactValue>=0&&impactValue<=3,"Проверьте ответ о влиянии симптомов.");
      var answers=A(v,"answers");var count=protocol!["items"]!.GetValue<int>();Check(answers.Count==count&&answers.All(a=>a is null||a is JsonValue j&&j.TryGetValue<int>(out var n)&&n>=0&&n<=3),old?"Нужны семь ответов 0–3 либо явные пропуски.":$"Нужны {count} ответов 0–3 либо явные пропуски.");
      if(completion!="completed")Check(answers.All(a=>a is null),"При отказе или невозможности заполнения ответы должны оставаться неизвестными.");Check(!A(w,"assessments").Any(a=>S(a,"id")==id),"Результат уже получен; исправление сохраняется отдельным результатом.",409);Check(A(w,"assessments").Count<1000,"Достигнут лимит оценок.");
      if(assignmentId!=""){var assignment=Find(w,"assignments",assignmentId);Check(S(assignment,"status")=="issued"&&S(assignment,"protocolVersion")==S(v,"protocolVersion"),"Задание выполнено или имеет другую версию.");assignment["status"]="submitted";assignment["assessmentId"]=id;}
      var phq=S(protocol,"scale")=="PHQ-9";
      var impactRequired=phq&&answers.Any(a=>a is JsonValue j&&j.TryGetValue<int>(out var n)&&n>0);
      var completeness=completion=="completed"?answers.All(a=>a is not null)&&(!impactRequired||v["impact"] is not null)?"complete":"partial":completion;
      var result=v.DeepClone().AsObject();result["measuredAt"]=DateTimeOffset.Parse(measured,CultureInfo.InvariantCulture).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ss.fffZ",CultureInfo.InvariantCulture);result["receivedAt"]=now;result["receivedBy"]=Person(actor);result["completeness"]=completeness;int? score=completeness=="complete"?answers.Sum(a=>a!.GetValue<int>()):null;result["score"]=score is int sum?JsonValue.Create(sum):null;result["source"]=protocol.DeepClone();result["provenance"]="synthetic-patient";
      if(!old){result["impact"]=v["impact"]?.DeepClone();result["immediateDanger"]=immediate;result["interpretation"]=ClinicalProtocols.Describe(protocol,score);}
      A(w,"assessments").Add(result);
      var positive9=phq&&answers[8] is JsonValue ninth&&ninth.TryGetValue<int>(out var ninthValue)&&ninthValue>0;
      var needSafety=old?safety!="no"||completeness!="complete":immediate=="yes"||positive9||safety!="no"||immediate=="unknown"||completeness!="complete";
      if(needSafety){
        var kind=old?safety=="yes"?"explicit-concern":"not-assessed":immediate=="yes"?"immediate-danger":positive9?"phq-item9":safety=="yes"?"explicit-concern":"not-assessed";
        var priority=kind=="immediate-danger"||old&&safety=="yes"?"urgent":"important";
        var detail=kind switch{"immediate-danger"=>"Пациент сообщает о непосредственной опасности. Требуется срочная очная оценка.","phq-item9"=>"Положительный ответ на пункт 9 PHQ-9. Уточните мысли, намерение, план и необходимость срочной помощи.","explicit-concern"=>"Пациент сообщил о вопросе безопасности. Требуется оценка врача.",_=>"Безопасность не оценена: ответ неизвестен, пропущен или не получен."};
        Check(A(w,"safety").Count<1000,"Достигнут лимит событий безопасности.");A(w,"safety").Add(new JsonObject{["id"]=$"wf-s-{id}",["version"]=1,["assessmentId"]=id,["kind"]=kind,["priority"]=priority,["status"]="created",["evaluation"]="not-assessed",["detail"]=detail,["assessment"]="",["action"]="",["deliveredAt"]="",["history"]=new JsonArray(new JsonObject{["at"]=now,["by"]=Person(actor),["status"]="created",["note"]="Учебное событие; факт клинического риска системой не установлен."})});
      }
    }else if(type=="workflow.refresh"){
      Only(m,"type");
    }else if(type=="workflow.contact"){
      Only(m,"type","note");var note=Text(m,"note");Check(A(w,"contacts").Count<1000,"Достигнут лимит контактов.");var recVersions=new JsonObject();foreach(var rec in A(w,"recommendations").OfType<JsonObject>().Where(r=>!r["stale"]!.GetValue<bool>()))recVersions[S(rec,"id")]=rec["version"]!.DeepClone();var versions=new JsonObject();foreach(var f in Facts(p).OfType<JsonObject>())versions[S(f,"id")]=ClinicalFacts.Latest(f)["version"]!.DeepClone();A(w,"contacts").Add(new JsonObject{["id"]=$"wf-contact-{A(w,"contacts").Count+1}",["at"]=now,["by"]=Person(actor),["note"]=note,["factVersions"]=versions,["recommendationVersions"]=recVersions,["assessmentIds"]=new JsonArray(A(w,"assessments").Select(a=>(JsonNode?)JsonValue.Create(S(a,"id"))).ToArray()),["recommendationIds"]=new JsonArray(A(w,"recommendations").Where(r=>!r!["stale"]!.GetValue<bool>()).Select(r=>(JsonNode?)JsonValue.Create(S(r,"id"))).ToArray())});
    }else if(type=="workflow.safety"){
      Only(m,"type","id","expectedVersion","status","note");var e=Find(w,"safety",Text(m,"id",true,105));Check(e["version"]!.GetValue<int>()==Version(m),"Версия события изменилась.",409);var status=Text(m,"status");var note=Text(m,"note",true);Check(System.Array.IndexOf(Stages,status)==System.Array.IndexOf(Stages,S(e,"status"))+1,"Соблюдайте этапы доставки, принятия, оценки и действия.");e["status"]=status;e["version"]=e["version"]!.GetValue<int>()+1;if(status=="delivered")e["deliveredAt"]=now;if(status=="assessed"){e["assessment"]=note;e["evaluation"]="doctor-assessed";}if(status=="acted")e["action"]=note;A(e,"history").Add(new JsonObject{["at"]=now,["by"]=Person(actor),["status"]=status,["note"]=note});
    }else{
      var r=Find(w,"recommendations",Text(m,"id",true,100));Check(!r["stale"]!.GetValue<bool>()&&RuleSourceCurrent(r)&&S(r,"contextKey")==ContextKey(p,actor),"Основание устарело. Откройте актуальную рекомендацию.",409);Check(r["version"]!.GetValue<int>()==Version(m),"Версия решения изменилась.",409);var action=S(r,"action");
      if(type=="workflow.open"){Only(m,"type","id","expectedVersion");Check(S(r,"status")=="new","Рекомендация уже открыта.");r["status"]="open";r["version"]=r["version"]!.GetValue<int>()+1;A(r,"history").Add(Decision(actor,now,"opened","Просмотр не выполняет действие",action));}
      else if(type=="workflow.decide"){
        Only(m,"type","id","expectedVersion","decision","reason","action","dueDate","destination","projectReason");Check(new[]{"new","open","deferred"}.Contains(S(r,"status")) || new[]{"accepted","modified"}.Contains(S(r,"status")) && S(m,"decision") is "modify" or "reject","По рекомендации уже принято решение.",409);var decision=Text(m,"decision");Check(new[]{"accept","modify","reject","defer"}.Contains(decision),"Неизвестное решение.");action=Text(m,"action");Check(Labels.ContainsKey(action),"Неизвестное действие.");var reason=Text(m,"reason",decision is "modify" or "reject");Check(decision=="modify"||action==S(r,"action"),"Изменение действия требует причины и решения «Изменить».");var due=Text(m,"dueDate");Calendar(due,now,(decision is "accept" or "modify")&&(action is "scale" or "followup"));var destination=m.ContainsKey("destination")?Text(m,"destination",false,500):"";if((action is "consultation" or "investigation")&&(decision is "accept" or "modify"))Check(!string.IsNullOrWhiteSpace(destination),"Укажите адресата проекта.");if(m.ContainsKey("projectReason"))Text(m,"projectReason",true);
        if(S(r,"effectId")!=""){var old=A(p,"plan").Concat(A(p,"referrals")).OfType<JsonObject>().FirstOrDefault(x=>S(x,"id")==S(r,"effectId"));Check(old is not null&&S(old,"status")=="draft","Выполненное действие нельзя пересмотреть как проект.",409);r["supersededEffects"]??=new JsonArray();A(r,"supersededEffects").Add(new JsonObject{["id"]=S(r,"effectId"),["snapshot"]=old!.DeepClone(),["at"]=now,["by"]=Person(actor),["reason"]=reason});r["effectId"]="";r["effectSnapshot"]=null;}
        r["referralReason"]=m.ContainsKey("projectReason")?S(m,"projectReason"):S(r,"rationale");r["action"]=action;r["dueDate"]=due;r["destination"]=destination;r["status"]=decision switch{"accept"=>"accepted","modify"=>"modified","reject"=>"rejected",_=>"deferred"};r["version"]=r["version"]!.GetValue<int>()+1;A(r,"history").Add(Decision(actor,now,decision,reason,action));if(decision is "accept" or "modify")Effect(p,r,actor,now);
      }else if(type=="workflow.execute"){
        Only(m,"type","id","expectedVersion","confirmation");Check(m["confirmation"] is JsonValue j&&j.TryGetValue<bool>(out var yes)&&yes,"Нужно отдельное подтверждение врачом.");Check(S(r,"status") is "accepted" or "modified","Сначала примите решение.");var effectId=S(r,"effectId");var plan=A(p,"plan").OfType<JsonObject>().FirstOrDefault(x=>S(x,"id")==effectId);var referral=A(p,"referrals").OfType<JsonObject>().FirstOrDefault(x=>S(x,"id")==effectId);
        Check(JsonNode.DeepEquals(plan??referral,r["effectSnapshot"]),"Проект изменён. Требуется отдельное актуальное решение.",409);
        if(plan is not null){Check(S(plan,"status")=="draft"&&S(plan,"kind")!="medication","Учебное подтверждение применимо только к своему обычному проекту.");Check(S(plan,"title")==Labels[action]&&S(plan,"details")==S(r,"rationale")&&S(plan,"dueDate")==S(r,"dueDate"),"Проект изменён вручную. Подтвердите его в соответствующем разделе.",409);plan["status"]="confirmed";plan["confirmedAt"]=now;plan["confirmedBy"]=actor.Name;}else{Check(referral is not null&&S(referral,"status")=="draft"&&S(referral,"destination")==S(r,"destination")&&S(referral,"dueDate")==S(r,"dueDate"),"Проект направления изменён или уже выдан.",409);referral!["status"]="issued";}
        if(action=="scale"){Calendar(S(r,"dueDate"),now,true);Check(!A(w,"assignments").Any(a=>S(a,"recommendationId")==S(r,"id")),"Задание уже выдано.",409);A(w,"assignments").Add(new JsonObject{["id"]=$"wf-assignment-{S(r,"id")}",["recommendationId"]=S(r,"id"),["protocolVersion"]=S(r["source"],"version"),["dueDate"]=S(r,"dueDate"),["status"]="issued",["issuedAt"]=now,["issuedBy"]=Person(actor),["assessmentId"]="",["delivery"]="synthetic-local"});}
        r["status"]="fulfilled";r["version"]=r["version"]!.GetValue<int>()+1;A(r,"history").Add(Decision(actor,now,"action-confirmed","Отдельное врачебное подтверждение проекта; не завершение медицинской помощи",action));
      }else throw new DomainException("Неизвестная учебная команда.");
    }
    Reconcile(p,actor,now);
  }
}
