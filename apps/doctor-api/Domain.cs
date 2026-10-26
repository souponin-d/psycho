using System.Text.Json.Nodes;
using System.Globalization;
using System.Text.RegularExpressions;

namespace Doctor.Api;

public static class Domain
{
  public static string S(JsonNode? node, string key)
  {
    if (node is not JsonObject obj) throw new DomainException("Ожидался объект записи.");
    if (!obj.TryGetPropertyValue(key, out var value) || value is null) return "";
    if (value is JsonValue scalar && scalar.TryGetValue<string>(out var result)) return result;
    throw new DomainException($"Ожидалось текстовое поле: {key}.");
  }
  public static string Required(JsonNode node, string key) { var value = S(node, key); Check(!string.IsNullOrWhiteSpace(value), $"Заполните поле: {key}."); Check(value.Length <= 20000, $"Поле {key} слишком длинное."); return value; }
  public static JsonObject Object(JsonNode node, string key) => node[key] as JsonObject ?? throw new DomainException($"Ожидался объект: {key}.");
  public static JsonArray Array(JsonNode node, string key) => node[key] as JsonArray ?? throw new DomainException($"Ожидался список: {key}.");
  private static void Check(bool condition, string message, int status = 400) { if (!condition) throw new DomainException(message, status); }
  private static JsonObject Find(JsonObject doc, string collection, string id) => Array(doc, collection).OfType<JsonObject>().FirstOrDefault(n => S(n, "id") == id) ?? throw new DomainException("Запись не найдена.", 404);
  private static void Date(JsonNode node, string key, bool optional = false)
  {
    var value = S(node, key); if (optional && value == "") return;
    var day = value.Length >= 10 ? value[..10] : value;
    Check(Regex.IsMatch(value, @"^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}(\.\d{1,7})?(Z|[+-]\d{2}:\d{2}))?$") &&
        DateOnly.TryParseExact(day, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _) &&
        DateTimeOffset.TryParse(value, CultureInfo.InvariantCulture, DateTimeStyles.None, out _), $"Некорректная дата: {key}.");
  }
  private static void CalendarDate(JsonNode node, string key, bool optional = false)
  { Date(node, key, optional); Check(S(node, key) == "" && optional || S(node, key).Length == 10, $"Ожидалась календарная дата: {key}."); }
  private static void Instant(JsonNode node, string key, bool optional = false)
  { Date(node, key, optional); Check(S(node, key) == "" && optional || S(node, key).Contains('T'), $"Укажите дату, время и часовой пояс: {key}."); }
  private static bool Boolean(JsonNode node, string key)
  { if (node[key] is JsonValue value && value.TryGetValue<bool>(out var result)) return result; throw new DomainException($"Ожидалось логическое поле: {key}."); }
  private static int Integer(JsonNode node, string key)
  { if (node[key] is JsonValue value && value.TryGetValue<int>(out var result)) return result; throw new DomainException($"Ожидалось целое число: {key}."); }
  private static double? Number(JsonObject node, string key)
  {
    Check(node.ContainsKey(key), $"Отсутствует числовое поле: {key}."); if (node[key] is null) return null;
    if (node[key] is JsonValue value && value.TryGetValue<double>(out var result) && double.IsFinite(result)) return result;
    throw new DomainException($"Ожидалось число или null: {key}.");
  }
  private static void TextFields(JsonObject node, IEnumerable<string> fields)
  { foreach (var field in fields) { Check(node[field] is JsonValue, $"Отсутствует текстовое поле: {field}."); Check(S(node, field).Length <= 20000, $"Поле {field} слишком длинное."); } }
  private static void Only(JsonObject node, IEnumerable<string> fields)
  { var allowed = fields.ToHashSet(StringComparer.Ordinal); Check(node.All(p => allowed.Contains(p.Key)), "Запись содержит неизвестные поля."); }
  private static void WritableVisit(JsonObject doc, string id)
  { if (id != "") Check(S(Find(doc, "visits", id), "status") is not ("completed" or "cancelled"), "Нельзя добавлять или менять записи завершённого или отменённого приёма. Создайте новый приём или дополнение."); }
  private static void MedicationVisit(JsonObject doc, JsonObject item, Actor actor, bool confirming)
  {
    if (S(item, "kind") != "medication") return;
    var visitId = S(item, "visitId");
    if (visitId == "") { Check(!confirming, "Лекарственное назначение нужно связать с приёмом."); return; }
    var visit = Find(doc, "visits", visitId);
    if (S(visit, "format") == "in-person") { if (confirming) Check(S(visit, "status") == "in-progress", "Подтвердите назначение на начатом очном приёме."); return; }
    Check(S(visit, "format") == "remote", "Неизвестный формат приёма.");
    Check(S(visit, "status") == "in-progress", "Дистанционная коррекция доступна на начатом приёме.");
    var replacedId = S(item, "replacesId");
    Check(replacedId != "", "Новый препарат назначается на очном приёме.");
    var previous = Find(doc, "plan", replacedId);
    Check(S(previous, "kind") == "medication" && S(previous, "status") == "confirmed", "Нужен действующий назначенный препарат.");
    foreach (var key in new[] { "kind", "title", "medicine", "details", "schedule", "startDate", "endDate", "dueDate", "instructionUrl", "patientInstructions", "sourceIds" })
      Check(JsonNode.DeepEquals(item[key], previous[key]), "Дистанционно можно изменить только дозировку назначенного препарата.");
    var anchor = previous; var seen = new HashSet<string>(StringComparer.Ordinal);
    for (var depth = 0; ; depth++) {
      Check(depth < 100 && seen.Add(S(anchor, "id")), "Не удалось проверить историю назначения.");
      Check(S(anchor, "confirmedById") == actor.Id, "Для дистанционной коррекции нужно исходное назначение этого врача.");
      var sourceVisitId = S(anchor, "visitId");
      Check(sourceVisitId != "", "Нет подтверждённого очного назначения.");
      var sourceVisit = Find(doc, "visits", sourceVisitId);
      if (S(sourceVisit, "format") == "in-person") {
        Check(S(sourceVisit, "status") == "completed" && S(sourceVisit, "confirmedById") == actor.Id && Array(sourceVisit, "diagnoses").Any(d => S(d, "status") == "confirmed"), "Нужен завершённый очный приём этого врача с установленным диагнозом.");
        break;
      }
      Check(S(sourceVisit, "format") == "remote" && S(anchor, "replacesId") != "", "Нет подтверждённого очного назначения.");
      anchor = Find(doc, "plan", S(anchor, "replacesId"));
    }
  }
  private static void Enum(JsonNode node, string key, params string[] values) => Check(values.Contains(S(node, key)), $"Недопустимое значение: {key}.");
  private static JsonObject Stamp(JsonObject value, Actor actor, string now) { value["author"] = actor.Name; value["createdAt"] = now; return value; }
  private static void Add(JsonObject doc, string collection, JsonObject value, Actor actor, string now)
  {
    var id = Required(value, "id"); Check(id.Length <= 100, "Слишком длинный идентификатор."); Check(!Array(doc, collection).Any(n => S(n!, "id") == id), "Запись уже существует.", 409); Array(doc, collection).Add(Stamp(value, actor, now));
  }
  private static void Upsert(JsonObject doc, string collection, JsonObject value, Actor actor, string now)
  {
    var list = Array(doc, collection); var old = list.OfType<JsonObject>().FirstOrDefault(n => S(n, "id") == S(value, "id"));
    if (old is null) Add(doc, collection, value, actor, now); else { value["author"] = old["author"]!.DeepClone(); value["createdAt"] = old["createdAt"]!.DeepClone(); list[list.IndexOf(old)] = value; }
  }
  private static readonly string[] ProfileFields = ["name", "birthDate", "sex", "phone", "email", "occupation", "address", "emergencyContact", "representative", "preferredContact", "allergies", "currentMedication", "familyHistory", "pastEpisodes", "substanceUse", "socialContext", "reproductiveContext", "goals", "clinicalContext"];
  private static readonly string[] Notes = ["mentalStatus", "somaticStatus", "substances", "medicationReview", "adverseEffects", "adherence", "suicidalThoughts", "intentAndPlan", "pastAttempts", "meansAccess", "protectiveFactors", "safetyConclusion", "safetyAction", "differential", "conclusion", "recommendations", "patientPreference"];
  private static readonly string[] Collections = ["episodes", "visits", "measurements", "plan", "reports", "events", "consents", "messages", "referrals", "documents", "audit", "commandIds"];
  private static JsonObject Profile(JsonObject value, JsonObject? previous = null)
  {
    Only(value, ProfileFields); foreach (var field in value.Where(field => field.Key != "clinicalContext")) { Check(field.Value is JsonValue, $"Ожидалось текстовое поле: {field.Key}."); Check(S(value, field.Key).Length <= 20000, $"Поле {field.Key} слишком длинное."); }
    var context = Object(value, "clinicalContext"); Only(context, ["complaints", "illnessHistory", "somaticConditions"]); TextFields(context, ["complaints", "illnessHistory"]); var conditions = Array(context, "somaticConditions"); foreach (var item in conditions) { if (item is not JsonObject selection) throw new DomainException("Ожидалась запись МКБ-10."); Terminology(selection, previous?["clinicalContext"]?["somaticConditions"] as JsonArray); }
    var result = new JsonObject(); foreach (var key in ProfileFields.Where(key => key != "clinicalContext")) result[key] = S(value, key); result["clinicalContext"] = context.DeepClone(); if (S(result, "sex") == "") result["sex"] = "unspecified";
    Required(result, "name"); Check(S(result, "name").Length <= 200, "Имя: не более 200 символов."); CalendarDate(result, "birthDate"); Check(DateOnly.ParseExact(S(result, "birthDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture) <= DateOnly.FromDateTime(DateTime.UtcNow), "Дата рождения не может быть в будущем."); Enum(result, "sex", "female", "male", "unspecified");
    var birthday = DateOnly.ParseExact(S(result, "birthDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture);
    var today = DateOnly.FromDateTime(DateTime.UtcNow);
    var age = today.Year - birthday.Year - (today.Month < birthday.Month || today.Month == birthday.Month && today.Day < birthday.Day ? 1 : 0);
    Check(age >= 18 && age <= 120, "Возраст пациента должен быть от 18 до 120 лет.");
    if (S(result, "email") != "") Check(System.Net.Mail.MailAddress.TryCreate(S(result, "email"), out _), "Проверьте адрес электронной почты.");
    return result;
  }
  private static void Terminology(JsonObject value, JsonArray? previous = null)
  { Only(value, ["system", "sourceOid", "sourceVersion", "code", "title"]); TextFields(value, ["system", "sourceOid", "sourceVersion", "code", "title"]); Check(Icd10Catalog.Allowed(value, previous), "Запись МКБ-10 отсутствует в актуальном каталоге или не сохранена в истории этой записи."); }
  public static JsonObject Create(JsonObject request, Actor actor)
  {
    Only(request, ["id", "profile"]);
    var id = Required(request, "id"); Check(Guid.TryParse(id, out _), "Идентификатор карты должен быть UUID.");
    var inputProfile = Object(request, "profile").DeepClone().AsObject();
    if (!inputProfile.ContainsKey("clinicalContext")) inputProfile["clinicalContext"] = new JsonObject { ["complaints"] = "", ["illnessHistory"] = "", ["somaticConditions"] = new JsonArray() };
    var now = DateTimeOffset.UtcNow.ToString("O"); var doc = new JsonObject { ["id"] = id, ["code"] = $"П-{id.Replace("-", "")[^6..].ToUpperInvariant()}", ["clinicId"] = actor.ClinicId, ["doctorId"] = actor.Id, ["revision"] = 0, ["createdAt"] = now, ["updatedAt"] = now, ["archived"] = false, ["profile"] = Profile(inputProfile) };
    foreach (var key in Collections) doc[key] = new JsonArray(); return doc;
  }
  public static JsonObject Apply(JsonObject original, JsonObject command, Actor actor, bool patientAction = false)
  {
    var doc = original.DeepClone().AsObject(); var revision = doc["revision"]!.GetValue<int>();
    Only(command, ["commandId", "expectedRevision", "mutation"]);
    Check(Integer(command, "expectedRevision") == revision, "Карта изменена в другой сессии. Загрузите актуальную версию.", 409);
    var mutation = Object(command, "mutation"); var type = Required(mutation, "type"); var id = S(mutation, "id"); var commandId = Required(command, "commandId"); Check(commandId.Length <= 100, "Слишком длинный идентификатор команды.");
    Check(!doc["archived"]!.GetValue<bool>() || type is "patient.archive" or "visit.print", "Карта находится в архиве.");
    ValidateMutation(mutation, type);
    var now = DateTimeOffset.UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", CultureInfo.InvariantCulture); var value = mutation["value"]?.DeepClone() as JsonObject;
    if (value is not null && type is not ("fact.save" or "dose.patient" or "report.patient" or "questionnaire.patient") && !type.StartsWith("workflow.",StringComparison.Ordinal) && !type.StartsWith("support.",StringComparison.Ordinal) && !type.StartsWith("adherence.",StringComparison.Ordinal)) ValidateEntity(type, value, doc);
    var effectTarget=type is "plan.save" or "referral.save" ? S(value,"id") : type=="plan.confirm" ? id : "";
    if(effectTarget!="" && doc["workflow"] is JsonObject flow && Array(flow,"recommendations").Any(r=>ClinicalWorkflow.OwnsEffect(r,effectTarget))){
      var locked=type is "plan.save" or "plan.confirm" || type=="referral.save" && Array(doc,"referrals").Any(r=>S(r,"id")==effectTarget && S(r,"status")=="draft");
      Check(!locked,"Проект связан с решением. Подтвердите действие в карточке рекомендации.",409);
    }
    switch (type)
    {
      case var supportType when supportType.StartsWith("support.",StringComparison.Ordinal): ClinicalSupport.Apply(doc,mutation,actor,now); break;
      case var adherenceType when adherenceType.StartsWith("adherence.",StringComparison.Ordinal): Adherence.Apply(doc,mutation,actor,now); break;
      case "dose.patient": {
        Check(patientAction, "Отметка доступна только пациенту.", 403); Only(mutation, ["type", "value"]); var input = Object(mutation, "value");
        Only(input, ["scheduleId", "scheduleVersion", "plannedAt", "status", "reportedAt", "reason", "expectedVersion"]);
        Check(S(input, "status") is "taken" or "missed" || S(input, "status") == "unknown" && Integer(input, "expectedVersion") > 0, "Выберите отметку приёма.");
        var valueForAdherence = input.DeepClone().AsObject(); valueForAdherence["provenance"] = "patient";
        Adherence.Apply(doc, new JsonObject { ["type"] = "adherence.record", ["value"] = valueForAdherence }, actor, now, true); break;
      }
      case "report.patient": {
        Check(patientAction, "Самоотчёт доступен только пациенту.", 403);
        ClinicalExecutionPolicy.AssertPatientAllowed(doc, actor);
        Only(mutation, ["type", "value"]); var input = Object(mutation, "value");
        Only(input, ["id", "entityId", "day", "formVersion", "reportedAt", "fields", "note", "label"]);
        TextFields(input, ["id", "entityId", "day", "formVersion", "reportedAt", "note", "label"]);
        Check(Required(input, "id").Length <= 100 && Required(input, "entityId").Length <= 100, "Некорректный идентификатор самоотчёта.");
        Check(S(input, "formVersion") == "syncli-report-v1", "Неизвестная версия самоотчёта.");
        Check(S(input, "note").Length <= 2000 && S(input, "label").Length <= 80, "Слишком длинный текст самоотчёта.");
        CalendarDate(input, "day"); Instant(input, "reportedAt");
        Check(DateTimeOffset.Parse(S(input, "reportedAt"), CultureInfo.InvariantCulture) <= DateTimeOffset.Parse(now, CultureInfo.InvariantCulture), "Дата самоотчёта не может быть в будущем.");
        var fields = Object(input, "fields"); Only(fields, ["feeling", "sleep", "anxiety", "functioning", "tolerability"]);
        var feeling = Object(fields, "feeling"); Only(feeling, ["valence", "energy"]);
        Check(Integer(feeling, "valence") is >= 0 and <= 6 && Integer(feeling, "energy") is >= 0 and <= 6, "Проверьте состояние.");
        Check(Integer(fields, "anxiety") is >= 0 and <= 10 && Integer(fields, "functioning") is >= 0 and <= 10, "Проверьте ответы самоотчёта.");
        Enum(fields, "sleep", "Плохо", "Обычно", "Хорошо"); Enum(fields, "tolerability", "Без трудностей", "Есть трудности");
        Add(doc, "reports", new JsonObject { ["id"] = S(input, "id"), ["reportedAt"] = S(input, "reportedAt"), ["receivedAt"] = now, ["provenance"] = "patient", ["state"] = "completed", ["mood"] = null, ["anxiety"] = null, ["sleepHours"] = null, ["functioning"] = "", ["medication"] = "no-mark", ["medicationReason"] = "", ["adverseEffects"] = "", ["note"] = S(input, "note"), ["safetyConcern"] = false, ["reviewedAt"] = "", ["mobile"] = input.DeepClone() }, actor, now);
        break;
      }
      case "questionnaire.patient": {
        Check(patientAction, "Опрос доступен только пациенту.", 403);
        Only(mutation, ["type", "value"]); var input = Object(mutation, "value");
        Only(input, ["id", "assignmentId", "protocolVersion", "measuredAt", "answers", "impact"]);
        TextFields(input, ["id", "assignmentId", "protocolVersion", "measuredAt"]);
        Check(Required(input, "id") == commandId && Required(input, "assignmentId").Length <= 100, "Проверьте идентификатор задания.");
        var protocol = ClinicalProtocols.Find(Required(input, "protocolVersion"));
        Check(protocol is not null && S(protocol, "id") is "gad7" or "phq9", "Неизвестная версия опроса.");
        var workflow = Object(doc, "workflow");
        Check(Array(workflow, "assignments").Any(a => S(a, "id") == S(input, "assignmentId") && S(a, "status") == "issued" && S(a, "protocolVersion") == S(input, "protocolVersion")), "Задание недоступно или уже выполнено.");
        var answers = Array(input, "answers");
        Check(answers.Count == Integer(protocol!, "items") && answers.All(a => a is JsonValue v && v.TryGetValue<int>(out var n) && n is >= 0 and <= 3), "Ответьте на все вопросы.");
        var needsImpact = S(protocol, "id") == "phq9" && answers.Any(a => a!.GetValue<int>() > 0);
        Check(needsImpact ? input["impact"] is JsonValue impact && impact.TryGetValue<int>(out var effect) && effect is >= 0 and <= 3 : input["impact"] is null, "Проверьте ответ о влиянии симптомов.");
        var submission = new JsonObject { ["id"] = S(input, "id"), ["assignmentId"] = S(input, "assignmentId"), ["protocolVersion"] = S(input, "protocolVersion"), ["measuredAt"] = S(input, "measuredAt"), ["answers"] = answers.DeepClone(), ["impact"] = input["impact"]?.DeepClone(), ["state"] = "completed", ["safety"] = "unknown", ["immediateDanger"] = "unknown", ["note"] = "" };
        ClinicalWorkflow.Apply(doc, new JsonObject { ["type"] = "workflow.submit", ["value"] = submission }, actor, now, true); break;
      }
      case "workflow.submit":
      case "workflow.open":
      case "workflow.decide":
      case "workflow.execute":
      case "workflow.safety":
      case "workflow.refresh":
      case "workflow.contact": ClinicalWorkflow.Apply(doc,mutation,actor,now); break;
      case "fact.save":
      case "fact.review": ClinicalFacts.Apply(doc,mutation,actor,now); break;
      case "profile.update": doc["profile"] = Profile(value!, doc["profile"] as JsonObject); break;
      case "assessment.save":
        doc["assessmentDrafts"] ??= new JsonArray();
        var previousDraft = Array(doc, "assessmentDrafts").FirstOrDefault(d => S(d, "id") == S(value!, "id"));
        if (previousDraft is not null) Check(new[] { "sourceId", "sourceHash", "formVersion" }.All(key => S(previousDraft, key) == S(value!, key)), "Другая версия формы сохраняется отдельным черновиком.");
        Upsert(doc, "assessmentDrafts", value!, actor, now); break;
      case "episode.save":
        Required(value!, "title"); Date(value!, "startedOn"); Enum(value!, "status", "active", "remission", "closed"); Enum(value!, "phase", "assessment", "acute", "continuation", "maintenance"); Enum(value!, "diagnosisStatus", "hypothesis", "confirmed");
        if (S(value!, "diagnosisStatus") == "confirmed") Check(actor.Specialty == "psychiatrist", "Подтверждение диагноза доступно психиатру.", 403);
        if (S(value!, "status") == "closed") { Date(value!, "endDate"); Required(value!, "summary"); }
        Upsert(doc, "episodes", value!, actor, now); break;
      case "visit.save":
        {
          var old = Array(doc, "visits").OfType<JsonObject>().FirstOrDefault(v => S(v, "id") == S(value!, "id"));
          Check(old is null || S(old, "status") is not ("completed" or "cancelled"), "Завершённый или отменённый приём нельзя переписать."); Check(old is null || S(old, "status") != "in-progress" || S(value!, "status") == "in-progress", "Начатый приём нельзя вернуть в запланированные."); Check(old is null || S(old, "status") != "in-progress" || S(old, "format") == S(value!, "format"), "Формат начатого приёма нельзя изменить."); Enum(value!, "status", "scheduled", "in-progress"); Enum(value!, "kind", "initial", "follow-up", "unscheduled"); Enum(value!, "format", "in-person", "remote"); Enum(value!, "provenance", "patient", "clinician", "relative", "document"); Date(value!, "scheduledAt"); Date(value!, "nextVisitAt", true);
          if (Array(value!, "diagnoses").Any(d => S(d, "status") == "confirmed")) Check(actor.Specialty == "psychiatrist", "Подтверждение диагноза доступно психиатру.", 403);
          var duration = value!["durationMinutes"]!.GetValue<int>(); Check(duration >= 5 && duration <= 240, "Продолжительность: от 5 до 240 минут.");
          var notes = Object(value, "notes"); var clean = new JsonObject(); foreach (var key in Notes) clean[key] = S(notes, key); value["notes"] = clean; value["completionSnapshot"] = null; value["addenda"] = new JsonArray(); value["completedAt"] = ""; value["confirmedBy"] = ""; value["confirmedById"] = ""; value["startedAt"] = old is not null && S(old, "startedAt") != "" ? S(old, "startedAt") : S(value, "status") == "in-progress" ? now : ""; Upsert(doc, "visits", value, actor, now); break;
        }
      case "visit.complete":
        {
          var visit = Find(doc, "visits", id); Enum(visit, "status", "scheduled", "in-progress"); var notes = Object(visit, "notes");
          Check(new[] { "safetyConclusion", "conclusion", "recommendations" }.All(k => !string.IsNullOrWhiteSpace(S(notes, k))), "Заполните заключение по рискам, заключение врача и рекомендации.");
          var care = Array(doc, "consents").LastOrDefault(c => S(c!, "purpose") == "care"); Check(care is not null && S(care, "status") == "documented", "Зафиксируйте документированное согласие на помощь.");
          if (S(visit, "format") == "remote") { var consent = Array(doc, "consents").LastOrDefault(c => S(c!, "purpose") == "communication"); Check(consent is not null && S(consent, "status") == "documented", "Для дистанционного контакта требуется документированное основание и согласие на связь."); }
          visit["status"] = "completed"; visit["completedAt"] = now; visit["confirmedBy"] = actor.Name; visit["confirmedById"] = actor.Id;
          visit["completionSnapshot"] = new JsonObject
          {
            ["patientName"] = S(Object(doc, "profile"), "name"),
            ["clinicalProfile"] = doc["profile"]!.DeepClone(),
            ["measurements"] = new JsonArray(ClinicalWorkflow.Measurements(doc).Where(n => S(n, "visitId") == id).Select(n => n!.DeepClone()).ToArray()),
            ["plan"] = new JsonArray(Array(doc, "plan").Where(n => S(n, "visitId") == id && S(n, "status") != "draft").Select(n => n!.DeepClone()).ToArray()),
            ["referrals"] = new JsonArray(Array(doc, "referrals").Where(n => S(n, "visitId") == id && S(n, "status") != "draft").Select(n => n!.DeepClone()).ToArray())
          };
          if(doc["workflow"] is not null) visit["completionSnapshot"]!["workflow"]=doc["workflow"]!.DeepClone();
          if(doc["clinicalFacts"] is not null) visit["completionSnapshot"]!["clinicalFacts"]=doc["clinicalFacts"]!.DeepClone();
          if(doc["clinicalSupport"] is not null) visit["completionSnapshot"]!["clinicalSupport"]=doc["clinicalSupport"]!.DeepClone();
          if(doc["adherence"] is not null) visit["completionSnapshot"]!["adherence"]=doc["adherence"]!.DeepClone();
          break;
        }
      case "visit.cancel": { var visit = Find(doc, "visits", id); Check(S(visit, "status") != "completed", "Завершённый приём нельзя отменить."); visit["cancellationReason"] = Required(mutation, "reason"); visit["status"] = "cancelled"; break; }
      case "visit.print": { var visit = Find(doc, "visits", id); Check(S(visit, "status") == "completed", "Для печати завершите приём."); Required(mutation,"reason"); break; }
      case "visit.addendum": { var visit = Find(doc, "visits", id); Check(S(visit, "status") == "completed", "Дополнение доступно после завершения."); Array(visit, "addenda").Add(Stamp(new() { ["id"] = commandId, ["text"] = Required(mutation, "text"), ["reason"] = Required(mutation, "reason") }, actor, now)); break; }
      case "measurement.add":
        {
          Required(value!, "title"); Required(value!, "version"); Required(value!, "externalForm"); Date(value!, "measuredAt"); Enum(value!, "completeness", "complete", "partial", "not-assessed"); Enum(value!, "assessor", "patient", "clinician");
          WritableVisit(doc, S(value!, "visitId")); var answers = Array(value!, "answers");
          if (S(value!, "completeness") == "complete") Check(answers.All(a => a is not null), "Полная оценка не может содержать пропуски."); else Check(value!["score"] is null, "Неполная оценка сохраняется без итогового балла.");
          var score = value!["score"]?.GetValue<double>(); var maximum = value["maximum"]?.GetValue<double>(); Check(score is null || double.IsFinite(score.Value) && score >= 0 && (maximum is null || score <= maximum), "Некорректный итоговый балл.");
          if (new[] { "HARS", "HDRS-17", "MADRS", "YMRS", "CGI" }.Contains(S(value, "scale"))) Check(S(value, "assessor") == "clinician", "Требуется экспертная оценка врача."); Add(doc, "measurements", value, actor, now); break;
        }
      case "plan.save":
        {
          var old = Array(doc, "plan").FirstOrDefault(p => S(p!, "id") == S(value!, "id")); Check(old is null || S(old, "status") == "draft", "Подтверждённый план нельзя переписать. Создайте новую версию."); Enum(value!, "status", "draft"); Enum(value!, "kind", "medication", "psychotherapy", "assessment", "lifestyle", "follow-up"); Required(value!, "title");
          if(value!["medicine"] is not null) { var medicine=Object(value,"medicine"); Check(S(value,"kind")=="medication"&&GrlsCatalog.Allowed(medicine,old?["medicine"] as JsonObject,now[..10])&&S(value,"title")==S(medicine,"tradeName"),"Выберите актуальный препарат из ГРЛС; регистрационные сведения не совпадают."); }
          if(S(value!,"kind")=="medication"&&value!["medicine"] is null) Check(old is not null&&S(old,"kind")=="medication"&&old["medicine"] is null&&S(old,"title")==S(value,"title"),"Для нового лекарственного назначения выберите препарат из ГРЛС.");
          WritableVisit(doc, S(value!, "visitId")); if (old is not null) WritableVisit(doc, S(old, "visitId")); if (S(value!, "replacesId") != "") { Find(doc, "plan", S(value!, "replacesId")); Required(value!, "changeReason"); } MedicationVisit(doc, value!, actor, false);
          AviandrChecks.Prepare(doc, value!, actor, now);
          value!["confirmedAt"] = ""; value["confirmedBy"] = ""; value["confirmedById"] = ""; Upsert(doc, "plan", value, actor, now); break;
        }
      case "plan.confirm":
        {
          ClinicalSupport.AssertPlanCurrent(doc,id,actor,now);
          var item = Find(doc, "plan", id); ClinicalSupport.AssertMedicationCandidate(doc,item); Enum(item, "status", "draft"); WritableVisit(doc, S(item, "visitId")); MedicationVisit(doc, item, actor, true); Required(item, "rationale"); Required(item, "patientInstructions");
          if (S(item, "kind") == "medication") { if(item["medicine"] is not null) Check(GrlsCatalog.IsCurrent(Object(item,"medicine"),now[..10]),"ГРЛС: перед подтверждением выберите актуальную регистрацию препарата."); Required(item, "dose"); Required(item, "schedule"); Check(Uri.TryCreate(S(item, "instructionUrl"), UriKind.Absolute, out var uri) && uri.Scheme == "https", "Добавьте HTTPS-ссылку на проверенную инструкцию."); }
          AviandrChecks.Prepare(doc, item, actor, now);
          item["status"] = "confirmed"; item["confirmedAt"] = now; item["confirmedBy"] = actor.Name; item["confirmedById"] = actor.Id;
          if (S(item, "replacesId") != "") { var old = Find(doc, "plan", S(item, "replacesId")); Check(S(old, "status") == "confirmed", "Изменяемая запись уже не действует.", 409); old["status"] = "stopped"; old["changeReason"] = item["changeReason"]!.DeepClone(); }
          break;
        }
      case "plan.status": { var item = Find(doc, "plan", id); Enum(item, "status", "confirmed"); Enum(mutation, "status", "completed", "stopped"); if (S(item, "kind") == "medication") { var visitId = Required(mutation, "visitId"); var visit = Find(doc, "visits", visitId); Check(S(visit, "format") == "in-person" && S(visit, "status") == "in-progress", "Изменение статуса препарата доступно на начатом очном приёме."); } item["status"] = S(mutation, "status"); item["changeReason"] = Required(mutation, "reason"); break; }
      case "report.add":
        {
          Date(value!, "reportedAt"); Enum(value!, "state", "completed", "cannot", "declined"); Enum(value!, "medication", "taken", "missed", "no-mark", "not-applicable"); foreach (var key in new[] { "mood", "anxiety", "sleepHours" }) { var n = value![key]?.GetValue<double>(); Check(n is null || double.IsFinite(n.Value) && n >= 0 && n <= (key == "sleepHours" ? 24 : 10), "Проверьте числовые значения самоотчёта."); }
          value!["receivedAt"] = now; value["reviewedAt"] = ""; value["provenance"] = patientAction ? "patient" : "clinician"; Add(doc, "reports", value, actor, now);
          if (value["safetyConcern"]!.GetValue<bool>() || S(value, "adverseEffects") != "")
          {
            var safety = value["safetyConcern"]!.GetValue<bool>(); var detail = S(value, "adverseEffects") != "" ? S(value, "adverseEffects") : S(value, "note");
            var ev = new JsonObject { ["id"] = $"event-{commandId}", ["title"] = safety ? "Пациент сообщил о риске" : "Нежелательное явление в дневнике", ["detail"] = detail, ["urgency"] = safety ? "urgent" : "important", ["status"] = "created", ["relatedId"] = S(value, "id"), ["dueAt"] = "", ["assignee"] = S(doc, "doctorId"), ["assessment"] = "", ["action"] = "", ["outcome"] = "", ["sourceIds"] = new JsonArray(), ["rationale"] = "Прямое сообщение пациента, без вычисления клинического риска", ["history"] = new JsonArray(new JsonObject { ["at"] = now, ["by"] = actor.Name, ["status"] = "created", ["note"] = "Получено явно отмеченное сообщение. Требуется оценка врача." }) }; Add(doc, "events", ev, actor, now);
          }
          break;
        }
      case "report.review": Find(doc, "reports", id)["reviewedAt"] = now; break;
      case "event.add": Required(value!, "title"); Enum(value!, "urgency", "routine", "important", "urgent"); value!["status"] = "created"; value["assessment"] = ""; value["action"] = ""; value["outcome"] = ""; value["history"] = new JsonArray(new JsonObject { ["at"] = now, ["by"] = actor.Name, ["status"] = "created", ["note"] = S(value, "detail") }); Add(doc, "events", value, actor, now); break;
      case "event.transition":
        {
          var item = Find(doc, "events", id); string[] order = ["created", "acknowledged", "assessed", "acted", "closed"]; var status = S(mutation, "status"); Check(System.Array.IndexOf(order, status) == System.Array.IndexOf(order, S(item, "status")) + 1, "Соблюдайте порядок этапов: получение, оценка, действие, закрытие."); var note = Required(mutation, "note"); item["status"] = status;
          if (status == "assessed") item["assessment"] = note; if (status == "acted") item["action"] = note; if (status == "closed") item["outcome"] = note; Array(item, "history").Add(new JsonObject { ["at"] = now, ["by"] = actor.Name, ["status"] = status, ["note"] = note }); break;
        }
      case "consent.add": Enum(value!, "purpose", "care", "data", "communication", "disclosure"); Enum(value!, "status", "documented", "refused", "withdrawn"); Date(value!, "signedOn"); Required(value!, "documentReference"); Required(value!, "person"); if (S(value!, "status") == "documented") Required(value!, "informing"); Add(doc, "consents", value!, actor, now); break;
      case "message.send":
      case "message.patient":
        {
          Check((type == "message.patient") == patientAction, "Действие не соответствует отправителю сообщения.", 403);
          if (!patientAction) { var consent = Array(doc, "consents").LastOrDefault(c => S(c, "purpose") == "communication"); Check(consent is not null && S(consent, "status") == "documented", "Сначала зафиксируйте действующее согласие на дистанционную связь"); }
          Add(doc, "messages", new() { ["id"] = commandId, ["text"] = Required(mutation, "text"), ["direction"] = patientAction ? "patient" : "doctor", ["status"] = "recorded", ["deliveredAt"] = "", ["readAt"] = "" }, actor, now); break;
        }
      case "message.received":
        {
          var item = Find(doc, "messages", id); Check(patientAction && S(item, "direction") == "doctor", "Недопустимое подтверждение доставки.", 403); Enum(mutation, "status", "delivered", "read"); if (S(item, "deliveredAt") == "") item["deliveredAt"] = now; if (S(mutation, "status") == "read") item["readAt"] = now; if (S(item, "status") != "read") item["status"] = S(mutation, "status"); break;
        }
      case "referral.save":
        {
          if(S(value,"status")=="issued"&&Array(doc,"referrals").Any(r=>S(r,"id")==S(value,"id")&&S(r,"status")=="draft"))ClinicalSupport.AssertReferralCurrent(doc,S(value,"id"),actor,now);
          Required(value!, "destination"); Required(value!, "reason"); Enum(value!, "status", "draft", "issued", "attended", "declined"); Enum(value!, "urgency", "routine", "important", "urgent"); Enum(value!, "category", "required", "desirable");
          var old = Array(doc, "referrals").FirstOrDefault(x => S(x!, "id") == S(value!, "id"));
          if (old is not null && S(old, "status") != "draft")
          {
            Check(S(value!, "status") != "draft" && (S(old, "status") == "issued" || S(old, "status") == S(value!, "status")), "Подтверждённое направление нельзя вернуть на предыдущий этап.");
            Check(new[] { "reason", "destination", "visitId", "category", "urgency", "dueDate", "rationale", "sourceIds" }.All(k => JsonNode.DeepEquals(old[k], value![k])), "Выданное направление сохраняет исходные основания.");
          }
          else { WritableVisit(doc, S(value!, "visitId")); if (old is not null) WritableVisit(doc, S(old, "visitId")); }
          if (S(value!, "status") is "attended" or "declined") Required(value!, "outcome"); Upsert(doc, "referrals", value!, actor, now); break;
        }
      case "document.add": Required(value!, "title"); Required(value!, "text"); if (S(value!, "status") == "excluded") Required(value!, "exclusionReason"); value!["status"] = S(value, "status") == "excluded" ? "excluded" : "unverified"; value["facts"] = new JsonArray(); Add(doc, "documents", value, actor, now); break;
      case "document.facts":
        {
          var document = Find(doc, "documents", id); Check(S(document, "status") != "excluded", "Материал исключён из клинического использования."); var facts = Array(mutation, "facts"); Check(facts.Count <= 100, "Не более 100 фактов в документе."); foreach (var fact in facts) { var quote = Required(fact!, "quote"); Required(fact!, "value"); Required(fact!, "id"); Check(S(document, "text").Contains(quote, StringComparison.Ordinal), "Фрагмент не найден в оригинале."); _ = fact!["confirmed"]!.GetValue<bool>(); }
          document["facts"] = facts.DeepClone(); document["status"] = facts.Count > 0 && facts.All(f => f!["confirmed"]!.GetValue<bool>()) ? "verified" : "unverified"; break;
        }
      case "patient.archive":
        Required(mutation, "reason"); var archived = Boolean(mutation, "archived");
        if (archived) { Check(!Array(doc, "visits").Any(v => S(v, "status") is "scheduled" or "in-progress"), "Завершите или отмените открытые приёмы перед архивацией."); Check(!Array(doc, "events").Any(e => S(e, "status") != "closed"), "Закройте открытые события перед архивацией."); }
        doc["archived"] = archived; break;
      default: throw new DomainException("Неизвестное или недоступное действие.");
    }
    doc["revision"] = revision + 1; doc["updatedAt"] = now; var recentCommands = Array(doc, "commandIds"); recentCommands.Add(commandId); while (recentCommands.Count > 100) recentCommands.RemoveAt(0);
    if(type=="patient.archive" && doc["archived"]!.GetValue<bool>()) Check(doc["workflow"] is not JsonObject wf || !Array(wf,"safety").Any(e=>S(e,"status")!="acted"),"Сначала завершите обработку событий риска.");
    Adherence.Reconcile(doc,actor,now);
    // Patient actions must not recalculate doctor-facing workflow as a patient actor.
    if (!patientAction) ClinicalWorkflow.Reconcile(doc,actor,now);
    if(type=="visit.complete" && doc["workflow"] is not null) ClinicalWorkflow.Apply(doc,new JsonObject{["type"]="workflow.contact",["note"]=$"Завершён приём {id}"},actor,now);
    Add(doc, "audit", new() { ["id"] = commandId, ["action"] = type, ["targetId"] = id != "" ? id : value is not null ? S(value, "id") : S(doc, "id"), ["detail"] = type == "fact.save" ? S(value,"reason") : S(mutation, "reason") }, actor, now);
    return doc;
  }
  private static void ValidateMutation(JsonObject mutation, string type)
  {
    if(type is "fact.save" or "fact.review" or "dose.patient" or "report.patient" or "questionnaire.patient" || type.StartsWith("workflow.",StringComparison.Ordinal) || type.StartsWith("support.",StringComparison.Ordinal) || type.StartsWith("adherence.",StringComparison.Ordinal)) return;
    var fields = type switch
    {
      "profile.update" or "episode.save" or "visit.save" or "measurement.add" or "plan.save" or "report.add" or "event.add" or "consent.add" or "referral.save" or "document.add" or "assessment.save" => "type,value",
      "visit.complete" or "plan.confirm" or "report.review" => "type,id",
      "visit.cancel" => "type,id,reason",
      "visit.addendum" => "type,id,text,reason",
      "visit.print" => "type,id,reason",
      "plan.status" => "type,id,status,reason",
      "event.transition" => "type,id,status,note",
      "message.send" or "message.patient" => "type,text",
      "message.received" => "type,id,status",
      "document.facts" => "type,id,facts",
      "patient.archive" => "type,archived,reason",
      _ => throw new DomainException("Неизвестное или недоступное действие.")
    };
    Only(mutation, fields.Split(',').Concat(type == "plan.status" ? ["visitId"] : []));
    foreach (var key in fields.Split(','))
    {
      if (key == "value") { Object(mutation, key); continue; }
      if (key == "facts") { Array(mutation, key); continue; }
      if (key == "archived") { Boolean(mutation, key); continue; }
      Required(mutation, key);
    }
    if (mutation.ContainsKey("id")) Check(S(mutation, "id").Length <= 100, "Слишком длинный идентификатор.");
    if (type == "plan.status" && mutation.ContainsKey("visitId")) Required(mutation, "visitId");
    if (type == "document.facts")
    {
      var facts = Array(mutation, "facts"); Check(facts.Count <= 100, "Не более 100 фактов в документе.");
      foreach (var node in facts)
      {
        if (node is not JsonObject fact) throw new DomainException("Ожидался объект факта.");
        Only(fact, ["id", "field", "quote", "value", "confirmed"]); TextFields(fact, ["id", "field", "quote", "value"]); Required(fact, "id"); Required(fact, "field"); Boolean(fact, "confirmed");
      }
      Check(facts.Select(f => S(f, "id")).Distinct().Count() == facts.Count, "Идентификаторы фактов должны быть уникальны.");
    }
  }
  private static void ValidateEntity(string type, JsonObject value, JsonObject doc)
  {
    if (type == "profile.update") { Profile(value, doc["profile"] as JsonObject); return; }
    var fields = type switch
    {
      "assessment.save" => "id,sourceId,sourceHash,formVersion,measuredAt,assessor,note,status",
      "episode.save" => "id,title,startedOn,status,phase,diagnosis,diagnosisStatus,endDate,summary",
      "visit.save" => "id,scheduledAt,kind,format,status,reason,provenance,nextVisitAt,completedAt,startedAt,confirmedBy,cancellationReason,rationale",
      "measurement.add" => "id,visitId,scale,title,version,measuredAt,completeness,assessor,window,sourceId,interpretation,provenance,externalForm",
      "plan.save" => "id,visitId,kind,title,details,dose,schedule,startDate,endDate,dueDate,status,confirmedAt,confirmedBy,changeReason,replacesId,instructionUrl,patientInstructions,rationale",
      "report.add" => "id,reportedAt,receivedAt,provenance,state,functioning,medication,medicationReason,adverseEffects,note,reviewedAt",
      "event.add" => "id,title,detail,urgency,status,relatedId,dueAt,assignee,assessment,action,outcome,rationale",
      "consent.add" => "id,purpose,status,signedOn,documentReference,person,scope,informing",
      "referral.save" => "id,visitId,destination,urgency,category,reason,dueDate,status,outcome,rationale",
      "document.add" => "id,title,documentDate,issuer,text,status,exclusionReason",
      _ => throw new DomainException("Неизвестный тип записи.")
    };
    var extra = type switch
    {
      "episode.save" => "diagnosisCode",
      "visit.save" => "sourceIds,durationMinutes,notes,diagnoses,addenda,completionSnapshot,confirmedById",
      "measurement.add" => "score,maximum,answers",
      "report.add" => "mood,anxiety,sleepHours,safetyConcern",
      "event.add" => "sourceIds,history",
      "plan.save" => "sourceIds,aviandrReview,medicine,confirmedById",
      "referral.save" => "sourceIds",
      "document.add" => "facts",
      "assessment.save" => "responses",
      _ => ""
    };
    Only(value, fields.Split(',').Concat(extra.Split(',')).Concat(["author", "createdAt"]));
    TextFields(value, fields.Split(','));
    if (value.ContainsKey("confirmedById")) TextFields(value, ["confirmedById"]);
    foreach (var stamp in new[] { "author", "createdAt" }) if (value.ContainsKey(stamp)) TextFields(value, [stamp]);
    if (type != "profile.update") { Required(value, "id"); Check(S(value, "id").Length <= 100, "Слишком длинный идентификатор."); }
    if (type is "visit.save" or "plan.save" or "event.add" or "referral.save")
    {
      var ids = Array(value, "sourceIds"); Check(ids.Count <= 38, "Слишком много источников.");
      foreach (var id in ids) Check(id is JsonValue scalar && scalar.TryGetValue<string>(out var source) && Regex.IsMatch(source, "^S(0[1-9]|[12][0-9]|3[0-8])$"), "Неизвестный источник.");
    }
    switch (type)
    {
      case "assessment.save":
        Instant(value, "measuredAt"); Enum(value, "assessor", "patient", "clinician"); Enum(value, "status", "unapproved");
        Check(Regex.IsMatch(S(value, "sourceId"), "^S(2[1-9]|3[0-8])$"), "Для формы нужен источник из реестра шкал.");
        var source = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "Sources.json")))!.AsArray().FirstOrDefault(s => S(s, "id") == S(value, "sourceId"));
        Check(source is not null && S(source, "sha256") == S(value, "sourceHash") && S(value, "formVersion") == $"source-{S(source, "sha256")[..12]}-draft-1", "Версия формы не совпадает с источником.");
        var responses = Object(value, "responses"); Check(responses.Count <= 400, "Слишком много ответов.");
        foreach (var response in responses) {
          Check(Regex.IsMatch(response.Key, "^[a-zA-Z0-9_.-]{1,100}$"), "Некорректный идентификатор пункта.");
          Check(response.Value is null || response.Value is JsonValue scalar && (scalar.TryGetValue<string>(out var text) && text.Length <= 2000 || scalar.TryGetValue<double>(out var number) && double.IsFinite(number) && number >= -1000 && number <= 1000), "Ответ должен быть числом, текстом или пропуском.");
        }
        break;
      case "episode.save":
        var oldEpisode = Array(doc, "episodes").OfType<JsonObject>().FirstOrDefault(e => S(e, "id") == S(value, "id"));
        if (value["diagnosisCode"] is not null) {
          var selection = Object(value, "diagnosisCode");
          var previous = oldEpisode?["diagnosisCode"] is JsonObject oldCode ? new JsonArray(oldCode.DeepClone()) : null;
          Terminology(selection, previous);
          Check(S(value, "diagnosis") == $"{S(selection, "code")} · {S(selection, "title")}", "Название диагноза эпизода не совпадает с МКБ-10.");
        } else Check(S(value, "diagnosis") == "" || oldEpisode is not null && oldEpisode["diagnosisCode"] is null && S(oldEpisode, "diagnosis") == S(value, "diagnosis"), "Диагноз эпизода выбирается из МКБ-10.");
        CalendarDate(value, "startedOn"); CalendarDate(value, "endDate", true);
        Check(S(value, "endDate") == "" || string.CompareOrdinal(S(value, "endDate"), S(value, "startedOn")) >= 0, "Завершение эпизода раньше его начала."); break;
      case "visit.save":
        Instant(value, "scheduledAt"); Instant(value, "nextVisitAt", true); Integer(value, "durationMinutes");
        var notes = Object(value, "notes"); Only(notes, Notes); TextFields(notes, Notes);
        foreach (var item in Array(value, "diagnoses")) { if (item is not JsonObject diagnosis) throw new DomainException("Ожидался диагноз МКБ-10."); var selection = new JsonObject(); foreach (var key in new[] { "system", "sourceOid", "sourceVersion", "code", "title" }) selection[key] = diagnosis[key]?.DeepClone(); Terminology(selection, Array(doc, "visits").OfType<JsonObject>().FirstOrDefault(v => S(v, "id") == S(value, "id"))?["diagnoses"] as JsonArray); Only(diagnosis, ["system", "sourceOid", "sourceVersion", "code", "title", "status"]); TextFields(diagnosis, ["system", "sourceOid", "sourceVersion", "code", "title", "status"]); Enum(diagnosis, "status", "hypothesis", "confirmed"); }
        Check(Array(value, "addenda").Count == 0, "Дополнения создаются отдельной командой.");
        Check(value["completionSnapshot"] is null, "Снимок завершения создаётся сервером."); break;
      case "measurement.add":
        Instant(value, "measuredAt"); Enum(value, "scale", "PHQ-9", "GAD-7", "HARS", "HDRS-17", "MADRS", "HCL-32", "HCL-33", "YMRS", "C-SSRS", "CGI", "KOP-25", "custom"); Enum(value, "provenance", "patient", "clinician", "relative", "document");
        Check(S(value, "sourceId") == "" || Regex.IsMatch(S(value, "sourceId"), "^S(0[1-9]|[12][0-9]|3[0-8])$"), "Неизвестный источник.");
        var score = Number(value, "score"); var maximum = Number(value, "maximum"); Check(maximum is null || maximum >= 0, "Максимум шкалы не может быть отрицательным."); Check(score is null || score >= 0 && (maximum is null || score <= maximum), "Некорректный итоговый балл.");
        var answers = Array(value, "answers"); Check(answers.Count <= 1000, "Слишком много ответов."); foreach (var answer in answers) Check(answer is null || answer is JsonValue a && a.TryGetValue<double>(out var number) && double.IsFinite(number) && number >= 0, "Ожидался неотрицательный числовой ответ или null."); break;
      case "plan.save":
        if (value.ContainsKey("aviandrReview")) AviandrChecks.Validate(Object(value, "aviandrReview"));
        foreach (var key in new[] { "startDate", "endDate", "dueDate" }) CalendarDate(value, key, true);
        Check(S(value, "startDate") == "" || S(value, "endDate") == "" || string.CompareOrdinal(S(value, "endDate"), S(value, "startDate")) >= 0, "Конец назначения раньше начала."); break;
      case "report.add":
        Instant(value, "reportedAt"); Boolean(value, "safetyConcern"); foreach (var key in new[] { "mood", "anxiety", "sleepHours" }) { var number = Number(value, key); Check(number is null || number >= 0 && number <= (key == "sleepHours" ? 24 : 10), "Проверьте числовые значения самоотчёта."); }
        break;
      case "event.add": Instant(value, "dueAt", true); Array(value, "history"); break;
      case "consent.add": CalendarDate(value, "signedOn"); break;
      case "referral.save": CalendarDate(value, "dueDate", true); break;
      case "document.add": CalendarDate(value, "documentDate", true); Enum(value, "status", "unverified", "verified", "excluded"); Array(value, "facts"); break;
    }
  }
}
