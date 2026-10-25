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
  private const string Icd10Oid = "1.2.643.5.1.13.13.11.1005";
  private const string Icd10Version = "educational-subset-2026-10-25";
  private static readonly HashSet<string> Icd10Entries = ["F20|Шизофрения", "F30|Маниакальный эпизод", "F31|Биполярное аффективное расстройство", "F32.0|Депрессивный эпизод лёгкой степени", "F32.1|Депрессивный эпизод средней степени", "F32.2|Депрессивный эпизод тяжёлой степени без психотических симптомов", "F33|Рекуррентное депрессивное расстройство", "F41.0|Паническое расстройство", "F41.1|Генерализованное тревожное расстройство", "F43.1|Посттравматическое стрессовое расстройство", "F60|Специфические расстройства личности", "D50|Железодефицитная анемия", "E03|Другие формы гипотиреоза", "E11|Сахарный диабет 2 типа", "G40|Эпилепсия", "G47|Расстройства сна", "I10|Эссенциальная (первичная) гипертензия"];
  private static readonly string[] Collections = ["episodes", "visits", "measurements", "plan", "reports", "events", "consents", "messages", "referrals", "documents", "audit", "commandIds"];
  private static JsonObject Profile(JsonObject value)
  {
    Only(value, ProfileFields); foreach (var field in value.Where(field => field.Key != "clinicalContext")) { Check(field.Value is JsonValue, $"Ожидалось текстовое поле: {field.Key}."); Check(S(value, field.Key).Length <= 20000, $"Поле {field.Key} слишком длинное."); }
    var context = Object(value, "clinicalContext"); Only(context, ["complaints", "illnessHistory", "somaticConditions"]); TextFields(context, ["complaints", "illnessHistory"]); var conditions = Array(context, "somaticConditions"); foreach (var item in conditions) { if (item is not JsonObject selection) throw new DomainException("Ожидалась запись МКБ-10."); Terminology(selection); }
    var result = new JsonObject(); foreach (var key in ProfileFields.Where(key => key != "clinicalContext")) result[key] = S(value, key); result["clinicalContext"] = context.DeepClone(); if (S(result, "sex") == "") result["sex"] = "unspecified";
    Required(result, "name"); Check(S(result, "name").Length <= 200, "Имя: не более 200 символов."); CalendarDate(result, "birthDate"); Check(DateOnly.ParseExact(S(result, "birthDate"), "yyyy-MM-dd", CultureInfo.InvariantCulture) <= DateOnly.FromDateTime(DateTime.UtcNow), "Дата рождения не может быть в будущем."); Enum(result, "sex", "female", "male", "unspecified");
    if (S(result, "email") != "") Check(System.Net.Mail.MailAddress.TryCreate(S(result, "email"), out _), "Проверьте адрес электронной почты.");
    return result;
  }
  private static void Terminology(JsonObject value)
  { Only(value, ["system", "sourceOid", "sourceVersion", "code", "title"]); TextFields(value, ["system", "sourceOid", "sourceVersion", "code", "title"]); Check(S(value, "system") == "ICD-10-RU" && S(value, "sourceOid") == Icd10Oid && S(value, "sourceVersion") == Icd10Version && Icd10Entries.Contains($"{S(value, "code")}|{S(value, "title")}"), "Запись МКБ-10 отсутствует в текущем учебном каталоге."); }
  public static JsonObject Create(JsonObject request, Actor actor)
  {
    Only(request, ["id", "profile"]);
    var id = Required(request, "id"); Check(Guid.TryParse(id, out _), "Идентификатор карты должен быть UUID.");
    var now = DateTimeOffset.UtcNow.ToString("O"); var doc = new JsonObject { ["id"] = id, ["code"] = $"П-{id.Replace("-", "")[^6..].ToUpperInvariant()}", ["clinicId"] = actor.ClinicId, ["doctorId"] = actor.Id, ["revision"] = 0, ["createdAt"] = now, ["updatedAt"] = now, ["archived"] = false, ["profile"] = Profile(Object(request, "profile")) };
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
    var now = DateTimeOffset.UtcNow.ToString("O"); var value = mutation["value"]?.DeepClone() as JsonObject;
    if (value is not null) ValidateEntity(type, value);
    switch (type)
    {
      case "profile.update": doc["profile"] = Profile(value!); break;
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
          Check(old is null || S(old, "status") is not ("completed" or "cancelled"), "Завершённый или отменённый приём нельзя переписать."); Enum(value!, "status", "scheduled", "in-progress"); Enum(value!, "kind", "initial", "follow-up", "unscheduled"); Enum(value!, "format", "in-person", "remote"); Enum(value!, "provenance", "patient", "clinician", "relative", "document"); Date(value!, "scheduledAt"); Date(value!, "nextVisitAt", true);
          var duration = value!["durationMinutes"]!.GetValue<int>(); Check(duration >= 5 && duration <= 240, "Продолжительность: от 5 до 240 минут.");
          var notes = Object(value, "notes"); var clean = new JsonObject(); foreach (var key in Notes) clean[key] = S(notes, key); value["notes"] = clean; value["completionSnapshot"] = null; value["addenda"] = new JsonArray(); value["completedAt"] = ""; value["confirmedBy"] = ""; value["startedAt"] = old is not null && S(old, "startedAt") != "" ? S(old, "startedAt") : S(value, "status") == "in-progress" ? now : ""; Upsert(doc, "visits", value, actor, now); break;
        }
      case "visit.complete":
        {
          var visit = Find(doc, "visits", id); Enum(visit, "status", "scheduled", "in-progress"); var notes = Object(visit, "notes");
          Check(new[] { "safetyConclusion", "conclusion", "recommendations" }.All(k => !string.IsNullOrWhiteSpace(S(notes, k))), "Заполните заключение по безопасности, заключение врача и рекомендации.");
          var care = Array(doc, "consents").LastOrDefault(c => S(c!, "purpose") == "care"); Check(care is not null && S(care, "status") == "documented", "Зафиксируйте документированное согласие на помощь.");
          if (S(visit, "format") == "remote") { var consent = Array(doc, "consents").LastOrDefault(c => S(c!, "purpose") == "communication"); Check(consent is not null && S(consent, "status") == "documented", "Для дистанционного контакта требуется документированное основание и согласие на связь."); }
          visit["status"] = "completed"; visit["completedAt"] = now; visit["confirmedBy"] = actor.Name;
          visit["completionSnapshot"] = new JsonObject
          {
            ["patientName"] = S(Object(doc, "profile"), "name"),
            ["measurements"] = new JsonArray(Array(doc, "measurements").Where(n => S(n, "visitId") == id).Select(n => n!.DeepClone()).ToArray()),
            ["plan"] = new JsonArray(Array(doc, "plan").Where(n => S(n, "visitId") == id && S(n, "status") != "draft").Select(n => n!.DeepClone()).ToArray()),
            ["referrals"] = new JsonArray(Array(doc, "referrals").Where(n => S(n, "visitId") == id && S(n, "status") != "draft").Select(n => n!.DeepClone()).ToArray())
          }; break;
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
          WritableVisit(doc, S(value!, "visitId")); if (old is not null) WritableVisit(doc, S(old, "visitId")); if (S(value!, "replacesId") != "") { Find(doc, "plan", S(value!, "replacesId")); Required(value!, "changeReason"); }
          value!["confirmedAt"] = ""; value["confirmedBy"] = ""; Upsert(doc, "plan", value, actor, now); break;
        }
      case "plan.confirm":
        {
          var item = Find(doc, "plan", id); Enum(item, "status", "draft"); WritableVisit(doc, S(item, "visitId")); Required(item, "rationale"); Required(item, "patientInstructions");
          if (S(item, "kind") == "medication") { Required(item, "dose"); Required(item, "schedule"); Check(Uri.TryCreate(S(item, "instructionUrl"), UriKind.Absolute, out var uri) && uri.Scheme == "https", "Добавьте HTTPS-ссылку на проверенную инструкцию."); }
          item["status"] = "confirmed"; item["confirmedAt"] = now; item["confirmedBy"] = actor.Name;
          if (S(item, "replacesId") != "") { var old = Find(doc, "plan", S(item, "replacesId")); Check(S(old, "status") == "confirmed", "Изменяемая запись уже не действует.", 409); old["status"] = "stopped"; old["changeReason"] = item["changeReason"]!.DeepClone(); }
          break;
        }
      case "plan.status": { var item = Find(doc, "plan", id); Enum(item, "status", "confirmed"); Enum(mutation, "status", "completed", "stopped"); item["status"] = S(mutation, "status"); item["changeReason"] = Required(mutation, "reason"); break; }
      case "report.add":
        {
          Date(value!, "reportedAt"); Enum(value!, "state", "completed", "cannot", "declined"); Enum(value!, "medication", "taken", "missed", "no-mark", "not-applicable"); foreach (var key in new[] { "mood", "anxiety", "sleepHours" }) { var n = value![key]?.GetValue<double>(); Check(n is null || double.IsFinite(n.Value) && n >= 0 && n <= (key == "sleepHours" ? 24 : 10), "Проверьте числовые значения самоотчёта."); }
          value!["receivedAt"] = now; value["reviewedAt"] = ""; value["provenance"] = patientAction ? "patient" : "clinician"; Add(doc, "reports", value, actor, now);
          if (value["safetyConcern"]!.GetValue<bool>() || S(value, "adverseEffects") != "")
          {
            var safety = value["safetyConcern"]!.GetValue<bool>(); var detail = S(value, "adverseEffects") != "" ? S(value, "adverseEffects") : S(value, "note");
            var ev = new JsonObject { ["id"] = $"event-{commandId}", ["title"] = safety ? "Пациент отметил вопрос безопасности" : "Нежелательное явление в дневнике", ["detail"] = detail, ["urgency"] = safety ? "urgent" : "important", ["status"] = "created", ["relatedId"] = S(value, "id"), ["dueAt"] = "", ["assignee"] = S(doc, "doctorId"), ["assessment"] = "", ["action"] = "", ["outcome"] = "", ["sourceIds"] = new JsonArray(), ["rationale"] = "Прямое сообщение пациента, без вычисления клинического риска", ["history"] = new JsonArray(new JsonObject { ["at"] = now, ["by"] = actor.Name, ["status"] = "created", ["note"] = "Получено явно отмеченное сообщение. Требуется оценка врача." }) }; Add(doc, "events", ev, actor, now);
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
    Add(doc, "audit", new() { ["id"] = commandId, ["action"] = type, ["targetId"] = id != "" ? id : value is not null ? S(value, "id") : S(doc, "id"), ["detail"] = S(mutation, "reason") }, actor, now);
    return doc;
  }
  private static void ValidateMutation(JsonObject mutation, string type)
  {
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
    Only(mutation, fields.Split(','));
    foreach (var key in fields.Split(','))
    {
      if (key == "value") { Object(mutation, key); continue; }
      if (key == "facts") { Array(mutation, key); continue; }
      if (key == "archived") { Boolean(mutation, key); continue; }
      Required(mutation, key);
    }
    if (mutation.ContainsKey("id")) Check(S(mutation, "id").Length <= 100, "Слишком длинный идентификатор.");
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
  private static void ValidateEntity(string type, JsonObject value)
  {
    if (type == "profile.update") { Profile(value); return; }
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
      "visit.save" => "sourceIds,durationMinutes,notes,diagnoses,addenda,completionSnapshot",
      "measurement.add" => "score,maximum,answers",
      "report.add" => "mood,anxiety,sleepHours,safetyConcern",
      "event.add" => "sourceIds,history",
      "plan.save" or "referral.save" => "sourceIds",
      "document.add" => "facts",
      "assessment.save" => "responses",
      _ => ""
    };
    Only(value, fields.Split(',').Concat(extra.Split(',')).Concat(["author", "createdAt"]));
    TextFields(value, fields.Split(','));
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
        CalendarDate(value, "startedOn"); CalendarDate(value, "endDate", true);
        Check(S(value, "endDate") == "" || string.CompareOrdinal(S(value, "endDate"), S(value, "startedOn")) >= 0, "Завершение эпизода раньше его начала."); break;
      case "visit.save":
        Instant(value, "scheduledAt"); Instant(value, "nextVisitAt", true); Integer(value, "durationMinutes");
        var notes = Object(value, "notes"); Only(notes, Notes); TextFields(notes, Notes);
        foreach (var item in Array(value, "diagnoses")) { if (item is not JsonObject diagnosis) throw new DomainException("Ожидался диагноз МКБ-10."); var selection = new JsonObject(); foreach (var key in new[] { "system", "sourceOid", "sourceVersion", "code", "title" }) selection[key] = diagnosis[key]?.DeepClone(); Terminology(selection); Only(diagnosis, ["system", "sourceOid", "sourceVersion", "code", "title", "status"]); TextFields(diagnosis, ["system", "sourceOid", "sourceVersion", "code", "title", "status"]); Enum(diagnosis, "status", "hypothesis", "confirmed"); }
        Check(Array(value, "addenda").Count == 0, "Дополнения создаются отдельной командой.");
        Check(value["completionSnapshot"] is null, "Снимок завершения создаётся сервером."); break;
      case "measurement.add":
        Instant(value, "measuredAt"); Enum(value, "scale", "PHQ-9", "GAD-7", "HARS", "HDRS-17", "MADRS", "HCL-32", "HCL-33", "YMRS", "C-SSRS", "CGI", "KOP-25", "custom"); Enum(value, "provenance", "patient", "clinician", "relative", "document");
        Check(S(value, "sourceId") == "" || Regex.IsMatch(S(value, "sourceId"), "^S(0[1-9]|[12][0-9]|3[0-8])$"), "Неизвестный источник.");
        var score = Number(value, "score"); var maximum = Number(value, "maximum"); Check(maximum is null || maximum >= 0, "Максимум шкалы не может быть отрицательным."); Check(score is null || score >= 0 && (maximum is null || score <= maximum), "Некорректный итоговый балл.");
        var answers = Array(value, "answers"); Check(answers.Count <= 1000, "Слишком много ответов."); foreach (var answer in answers) Check(answer is null || answer is JsonValue a && a.TryGetValue<double>(out var number) && double.IsFinite(number) && number >= 0, "Ожидался неотрицательный числовой ответ или null."); break;
      case "plan.save":
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
