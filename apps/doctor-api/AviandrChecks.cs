using System.Globalization;
using System.Text.Json.Nodes;
using System.Text.RegularExpressions;

namespace Doctor.Api;

// Preparatory information only. There is deliberately no clinical activation switch.
public static class AviandrChecks
{
  private static readonly JsonObject Catalog = JsonNode.Parse(File.ReadAllText(Path.Combine(AppContext.BaseDirectory, "AviandrRules.json")))!.AsObject();
  private static readonly string[] ContextFields = ["birthDate", "allergies", "conditions", "currentMedication", "reproductiveContext", "substanceUse", "diagnoses", "medicines"];
  private static readonly string[] ExtraInputs = ["indication", "lastMaoDate", "egfr", "egfrUnit", "egfrDate", "evidence"];
  private static string S(JsonNode? node, string key) => Domain.S(node, key);
  private static void Check(bool condition, string message = "Некорректные данные проверки Авиандра.", int status = 400) { if (!condition) throw new DomainException(message, status); }
  private static void Only(JsonObject value, IEnumerable<string> fields) { var allowed = fields.ToHashSet(); Check(value.All(p => allowed.Contains(p.Key))); }
  private static bool Date(string value) => value.Length == 10 && DateOnly.TryParseExact(value, "yyyy-MM-dd", CultureInfo.InvariantCulture, DateTimeStyles.None, out _);
  private static IEnumerable<JsonObject> Rules => Domain.Array(Catalog, "rules").OfType<JsonObject>();
  public static JsonObject Context(JsonObject patient, string planId)
  {
    var profile = Domain.Object(patient, "profile");
    var context = new JsonObject();
    foreach (var field in ContextFields.Take(6)) context[field] = S(profile, field);
    context["conditions"] = string.Join("; ", Domain.Array(Domain.Object(profile, "clinicalContext"), "somaticConditions").Select(item => $"{S(item, "code")} {S(item, "title")}"));
    context["diagnoses"] = new JsonArray(Domain.Array(patient, "episodes").Where(e => S(e, "status") != "closed").OrderBy(e => S(e, "id"), StringComparer.Ordinal).Select(e => $"{S(e, "title")} | {S(e, "diagnosis")} | {S(e, "diagnosisStatus")}")
      .Concat(Domain.Array(patient, "visits").Where(v => S(v, "status") != "cancelled").OrderBy(v => S(v, "id"), StringComparer.Ordinal)
        .SelectMany(v => Domain.Array(v!, "diagnoses").OrderBy(d => S(d, "code"), StringComparer.Ordinal).Select(d => $"{S(v, "id")} | {S(d, "code")} | {S(d, "title")} | {S(d, "status")} | {S(d, "sourceVersion")}")))
      .Select(value => (JsonNode?)JsonValue.Create(value)).ToArray());
    context["medicines"] = new JsonArray(Domain.Array(patient, "plan").Where(p => S(p, "id") != planId && S(p, "kind") == "medication" && S(p, "status") != "draft").OrderBy(p => S(p, "id"), StringComparer.Ordinal).Select(p => (JsonNode?)JsonValue.Create($"{S(p, "title")} | {S(p, "dose")} | {S(p, "schedule")} | {S(p, "startDate")} | {S(p, "endDate")} | {S(p, "status")} | {S(p, "changeReason")}")).ToArray());
    var facts = ClinicalFacts.Context(patient);
    if(facts.Count > 0) context["clinicalFacts"] = facts;
    return context;
  }
  public static void Validate(JsonObject review)
  {
    Only(review, ["status", "sourceVersion", "sourceHash", "sourceDate", "sourceUrl", "context", "inputs", "findings", "checkedAt", "checkedBy"]);
    Check(S(review, "status") == "unapproved" && S(review, "sourceVersion") == S(Catalog, "version") && S(review,"sourceHash") == S(Catalog,"sha256") && S(review,"sourceDate") == S(Catalog,"sourceDate") && S(review,"sourceUrl") == S(Catalog,"url"), "Версия проверки Авиандра не утверждена или не совпадает с источником.");
    var input = Domain.Object(review, "inputs");
    var flags = Rules.Select(r => S(r, "id")).Concat(["maoUse", "medicationListVerified"]).ToArray();
    Only(input, flags.Concat(ExtraInputs)); Check(input.Count == flags.Length + ExtraInputs.Length);
    foreach (var flag in flags) Check(new[] { "unknown", "yes", "no" }.Contains(S(input, flag)));
    Check(new[] { "unknown", "gad", "post-covid", "other" }.Contains(S(input, "indication")));
    Check(new[] { "unknown", "ml/min", "ml/min/1.73m2" }.Contains(S(input, "egfrUnit")));
    Check(input.ContainsKey("egfr"));
    if (input["egfr"] is not null) Check(input["egfr"] is JsonValue value && value.TryGetValue<double>(out var n) && double.IsFinite(n) && n >= 0 && n <= 300);
    foreach (var field in new[] { "egfrDate", "lastMaoDate" }) Check(S(input, field) == "" || Date(S(input, field)));
    Check(input["evidence"] is JsonValue && S(input, "evidence").Length <= 20000);
    var context = Domain.Object(review, "context"); Only(context, ContextFields.Concat(["clinicalFacts"])); Check(ContextFields.All(context.ContainsKey));
    foreach (var field in ContextFields.Take(6)) Check(context[field] is JsonValue && S(context, field).Length <= 20000);
    foreach (var field in ContextFields.Skip(6).Concat(context.ContainsKey("clinicalFacts") ? ["clinicalFacts"] : System.Array.Empty<string>())) { var rows = Domain.Array(context, field); Check(rows.Count <= 1000); foreach (var row in rows) Check(row is JsonValue v && v.TryGetValue<string>(out var text) && text.Length <= 200000); }
  }
  public static void Prepare(JsonObject patient, JsonObject plan, Actor actor, string now)
  {
    if (!plan.ContainsKey("aviandrReview")) return;
    var review = Domain.Object(plan, "aviandrReview"); Validate(review);
    Check(S(plan, "kind") == "medication" && Regex.IsMatch(S(plan, "title"), @"(?:^|[^а-яa-z])(?:авиандр|aviandr|маритупирдин|maritupirdine)(?:$|[^а-яa-z])", RegexOptions.IgnoreCase | RegexOptions.CultureInvariant), "Проверка Авиандра допустима только для этого препарата.");
    Check(JsonNode.DeepEquals(review["context"], Context(patient, S(plan, "id"))), "Данные карты изменились. Сверьте контекст проверки Авиандра заново.", 409);
    var start = S(plan, "startDate"); Check(Date(start), "Нужна корректная дата начала проверки Авиандра.");
    var input = Domain.Object(review, "inputs");
    Check(S(input, "egfrDate") == "" || string.CompareOrdinal(S(input, "egfrDate"), now[..10]) <= 0, "Дата СКФ не может быть в будущем.");
    Check(S(input, "lastMaoDate") == "" || string.CompareOrdinal(S(input, "lastMaoDate"), now[..10]) <= 0, "Дата состоявшейся отмены МАО не может быть в будущем.");
    plan["aviandrReview"] = new JsonObject { ["status"] = "unapproved", ["sourceVersion"] = S(Catalog, "version"), ["sourceHash"] = S(Catalog,"sha256"), ["sourceDate"] = S(Catalog,"sourceDate"), ["sourceUrl"] = S(Catalog,"url"), ["context"] = review["context"]!.DeepClone(), ["inputs"] = input.DeepClone(), ["findings"] = Evaluate(review, start), ["checkedAt"] = now, ["checkedBy"] = actor.Name };
  }
  private static JsonArray Evaluate(JsonObject review, string start)
  {
    var input = Domain.Object(review, "inputs"); var context = Domain.Object(review, "context"); var rows = new JsonArray();
    void Add(string id, string title, string status, string detail, string section) => rows.Add(new JsonObject { ["id"] = id, ["title"] = title, ["status"] = status, ["detail"] = detail, ["section"] = section });
    var startValid = Date(start); var birth = S(context, "birthDate");
    if (!startValid || !Date(birth)) Add("age", "Возраст на дату начала", "missing", "Нужны корректные дата рождения и дата начала лечения.", "4.1, 4.2");
    else {
      var age = int.Parse(start[..4]) - int.Parse(birth[..4]) - (string.CompareOrdinal(start[5..], birth[5..]) < 0 ? 1 : 0);
      Add("age", "Возраст на дату начала", age < 18 ? "contraindication" : age == 18 ? "review" : "not-identified", age == 18 ? "18 лет: формулировки возрастной границы в разделах 4.1 и 4.2 требуют клинической сверки." : $"{age} лет. Проверяется только возрастное ограничение.", "4.1, 4.2");
    }
    var indication = S(input, "indication");
    Add("indication", "Основание назначения", indication == "unknown" ? "missing" : indication == "other" ? "review" : "not-identified", indication is "gad" or "post-covid" ? "Врач выбрал контекст из раздела показаний. Диагноз и применимость подтверждает врач." : "Требуется сопоставить диагноз и клинический контекст с зарегистрированным показанием.", "4.1");
    foreach (var rule in Rules) {
      var answer = S(input, S(rule, "id"));
      Add(S(rule, "id"), S(rule, "title"), answer == "unknown" ? "missing" : answer == "yes" ? S(rule, "positive") : "not-identified", answer == "unknown" ? "Не уточнено. Отсутствие сведений не считается отсутствием ограничения." : answer == "yes" ? "По уточнению врача выявлено условие из ОХЛП. Правило не утверждено; требуется клиническая оценка." : "По уточнению врача условие не отмечено. Это не заключение о безопасности препарата.", S(rule, "section"));
    }
    var egfr = input["egfr"]?.GetValue<double>(); var renalDate = S(input, "egfrDate");
    var renalStatus = egfr is null || renalDate == "" || !startValid ? "missing" : S(input, "egfrUnit") != "ml/min" || string.CompareOrdinal(renalDate, start) > 0 ? "review" : egfr < 60 ? "contraindication" : "review";
    Add("renal", "Функция почек", renalStatus, renalStatus == "contraindication" ? "СКФ ниже 60 мл/мин. Условие противопоказания из ОХЛП; требуется клиническая оценка." : "Нужны СКФ с датой и единицами и оценка актуальности врачом. Индексированные единицы автоматически не пересчитываются; значение ≥60 само по себе не подтверждает применимость.", "4.2, 4.3");
    var mao = S(input, "maoUse"); var lastMaoDate = S(input, "lastMaoDate"); var maoStatus = "missing";
    if (mao == "yes") maoStatus = "contraindication";
    else if (mao == "no" && lastMaoDate == "") maoStatus = "not-identified";
    else if (mao == "no" && startValid && Date(lastMaoDate)) {
      var days = (DateOnly.ParseExact(start, "yyyy-MM-dd", CultureInfo.InvariantCulture).ToDateTime(TimeOnly.MinValue) - DateOnly.ParseExact(lastMaoDate, "yyyy-MM-dd", CultureInfo.InvariantCulture).ToDateTime(TimeOnly.MinValue)).TotalDays;
      maoStatus = days < 0 ? "review" : days < 14 ? "contraindication" : "not-identified";
    }
    Add("mao", "Ингибиторы МАО и срок после отмены", maoStatus, mao == "no" && lastMaoDate == "" ? "Врач указал отсутствие приёма, в том числе недавнего. Если препарат отменён, укажите дату отмены." : "Сопоставляются приём и дата отмены с началом лечения. В ОХЛП указан интервал 2 недели; правило не утверждено.", "4.3, 4.5");
    Add("medicines", "Полнота лекарственного анамнеза", S(input, "medicationListVerified") == "yes" ? "review" : "missing", "Названия из свободного текста автоматически не классифицируются. Врач сверяет все действующие и недавно отменённые лекарства, безрецептурные средства и добавки; затем уточняет группы взаимодействий.", "4.5");
    Add("regimen", "Доза, режим и длительность", "review", "Схему вводит врач и сопоставляет с разделом 4.2. Автоматический подбор и проверка свободного текста дозировки не выполняются.", "4.2");
    return rows;
  }
}
