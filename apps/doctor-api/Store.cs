using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Nodes;
using Npgsql;
using NpgsqlTypes;

namespace Doctor.Api;

public sealed class Store(NpgsqlDataSource dataSource)
{
  public async Task Initialize(string root)
  {
    await using var connection = await dataSource.OpenConnectionAsync();
    await using var transaction = await connection.BeginTransactionAsync();
    await using var command = new NpgsqlCommand("SELECT pg_advisory_xact_lock(74228931);" + await File.ReadAllTextAsync(Path.Combine(root, "Migrations", "001_initial.sql")), connection, transaction);
    await command.ExecuteNonQueryAsync(); await transaction.CommitAsync();
  }
  public async Task Provision(Actor actor, string email, string password)
  {
    if (string.IsNullOrWhiteSpace(actor.Id) || string.IsNullOrWhiteSpace(actor.ClinicId) || string.IsNullOrWhiteSpace(actor.Name) || string.IsNullOrWhiteSpace(email) || actor.Specialty is not ("psychiatrist" or "physician" or "patient")) throw new DomainException("Проверьте реквизиты учётной записи.");
    if ((actor.Specialty == "patient") != (actor.PatientId is not null)) throw new DomainException("Пациентская учётная запись требует связи с картой; врачебная не принимает PatientId.");
    if (actor.PatientId is not null) {
      await using var check = dataSource.CreateCommand("SELECT EXISTS(SELECT 1 FROM patient_records WHERE id=$1 AND clinic_id=$2)");
      check.Parameters.AddWithValue(actor.PatientId); check.Parameters.AddWithValue(actor.ClinicId);
      if (!(bool)(await check.ExecuteScalarAsync())!) throw new DomainException("Карта пациента в указанной клинике не найдена.");
    }
    await using var command = dataSource.CreateCommand("INSERT INTO clinic_users(id,clinic_id,email,name,specialty,password_hash,patient_id) VALUES($1,$2,$3,$4,$5,$6,$7)");
    command.Parameters.AddWithValue(actor.Id); command.Parameters.AddWithValue(actor.ClinicId); command.Parameters.AddWithValue(email.Trim().ToLowerInvariant()); command.Parameters.AddWithValue(actor.Name); command.Parameters.AddWithValue(actor.Specialty); command.Parameters.AddWithValue(Passwords.Hash(password)); command.Parameters.Add(new() { Value = (object?)actor.PatientId ?? DBNull.Value, NpgsqlDbType = NpgsqlDbType.Text });
    await command.ExecuteNonQueryAsync();
  }
  public async Task<Actor?> Authenticate(string email, string password)
  {
    await using var command = dataSource.CreateCommand("SELECT id,name,specialty,clinic_id,patient_id,security_version,password_hash,active FROM clinic_users WHERE email=$1");
    command.Parameters.AddWithValue(email.Trim().ToLowerInvariant());
    await using var reader = await command.ExecuteReaderAsync();
    if (!await reader.ReadAsync()) { Passwords.Verify(password, Passwords.Hash("invalid-account-timing-placeholder")); return null; }
    if (!Passwords.Verify(password, reader.GetString(6)) || !reader.GetBoolean(7)) return null;
    return new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.IsDBNull(4) ? null : reader.GetString(4), reader.GetInt32(5));
  }
  public async Task<bool> ValidSession(Actor actor)
  {
    await using var command = dataSource.CreateCommand("SELECT EXISTS(SELECT 1 FROM clinic_users WHERE id=$1 AND clinic_id=$2 AND active AND security_version=$3)");
    command.Parameters.AddWithValue(actor.Id); command.Parameters.AddWithValue(actor.ClinicId); command.Parameters.AddWithValue(actor.SecurityVersion);
    return (bool)(await command.ExecuteScalarAsync())!;
  }
  public async Task<Actor?> FindHackathonActor(string userId)
  {
    Actor? actor = null;
    await using (var command = dataSource.CreateCommand("SELECT id,name,specialty,clinic_id,patient_id,security_version FROM clinic_users WHERE id=$1 AND active AND specialty='patient' AND patient_id IS NOT NULL"))
    {
      command.Parameters.AddWithValue(userId);
      await using var reader = await command.ExecuteReaderAsync();
      if (await reader.ReadAsync())
      {
        actor = new(reader.GetString(0), reader.GetString(1), reader.GetString(2), reader.GetString(3), reader.GetString(4), reader.GetInt32(5));
      }
    }
    if (actor is null || !await ValidHackathonSession(actor)) return null;
    return actor;
  }
  public async Task<bool> ValidHackathonSession(Actor actor)
  {
    if (actor.PatientId is null) return false;
    await using var command = dataSource.CreateCommand("SELECT EXISTS(SELECT 1 FROM clinic_users u JOIN patient_records p ON p.id=u.patient_id AND p.clinic_id=u.clinic_id JOIN care_relationships c ON c.patient_id=p.id AND c.clinic_id=p.clinic_id JOIN clinic_users d ON d.id=c.doctor_id AND d.clinic_id=c.clinic_id WHERE u.id=$1 AND u.clinic_id=$2 AND u.patient_id=$3 AND u.security_version=$4 AND u.active AND u.specialty='patient' AND c.active AND d.active AND d.patient_id IS NULL)");
    command.Parameters.AddWithValue(actor.Id); command.Parameters.AddWithValue(actor.ClinicId); command.Parameters.AddWithValue(actor.PatientId); command.Parameters.AddWithValue(actor.SecurityVersion);
    return (bool)(await command.ExecuteScalarAsync())!;
  }
  public async Task<JsonArray> List(Actor actor)
  {
    await using var command = dataSource.CreateCommand("SELECT p.document FROM patient_records p JOIN care_relationships c ON c.patient_id=p.id AND c.clinic_id=p.clinic_id WHERE c.doctor_id=$1 AND c.clinic_id=$2 AND c.active ORDER BY p.updated_at DESC");
    command.Parameters.AddWithValue(actor.Id); command.Parameters.AddWithValue(actor.ClinicId);
    var result = new JsonArray(); await using (var reader = await command.ExecuteReaderAsync()) while (await reader.ReadAsync()) result.Add(JsonNode.Parse(reader.GetString(0)));
    await Audit(actor, null, "patients.list"); return result;
  }
  public async Task<JsonObject> Create(Actor actor, JsonObject request)
  {
    var document = Domain.Create(request, actor); var id = Domain.S(document, "id");
    await using var connection = await dataSource.OpenConnectionAsync(); await using var transaction = await connection.BeginTransactionAsync();
    var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(request.ToJsonString())));
    await using (var gate = new NpgsqlCommand("SELECT pg_advisory_xact_lock(hashtextextended($1,0))", connection, transaction)) { gate.Parameters.AddWithValue(id); await gate.ExecuteNonQueryAsync(); }
    await using (var previous = new NpgsqlCommand("SELECT p.document,r.actor_id,r.clinic_id,r.payload_hash FROM creation_receipts r JOIN patient_records p ON p.id=r.patient_id JOIN care_relationships c ON c.patient_id=p.id AND c.doctor_id=r.actor_id AND c.clinic_id=r.clinic_id AND c.active WHERE r.patient_id=$1", connection, transaction))
    {
      previous.Parameters.AddWithValue(id); await using var reader = await previous.ExecuteReaderAsync();
      if (await reader.ReadAsync())
      {
        if (reader.GetString(1) != actor.Id || reader.GetString(2) != actor.ClinicId || reader.GetString(3) != hash) throw new DomainException("Идентификатор создания уже использован.", 409);
        return JsonNode.Parse(reader.GetString(0))!.AsObject();
      }
    }
    await using var command = new NpgsqlCommand("WITH created AS (INSERT INTO patient_records(id,clinic_id,doctor_id,revision,document) VALUES($1,$2,$3,0,$4) RETURNING id), care AS (INSERT INTO care_relationships(patient_id,doctor_id,clinic_id) SELECT id,$3,$2 FROM created), history AS (INSERT INTO record_versions(patient_id,revision,document,actor_id) SELECT id,0,$4,$3 FROM created) INSERT INTO access_audit(actor_id,clinic_id,patient_id,action) SELECT $3,$2,id,'patient.create' FROM created", connection, transaction);
    command.Parameters.AddWithValue(id); command.Parameters.AddWithValue(actor.ClinicId); command.Parameters.AddWithValue(actor.Id); command.Parameters.AddWithValue(NpgsqlDbType.Jsonb, document.ToJsonString());
    await command.ExecuteNonQueryAsync();
    await using (var receipt = new NpgsqlCommand("INSERT INTO creation_receipts(patient_id,actor_id,clinic_id,payload_hash) VALUES($1,$2,$3,$4)", connection, transaction))
    { receipt.Parameters.AddWithValue(id); receipt.Parameters.AddWithValue(actor.Id); receipt.Parameters.AddWithValue(actor.ClinicId); receipt.Parameters.AddWithValue(hash); await receipt.ExecuteNonQueryAsync(); }
    await transaction.CommitAsync(); return document;
  }
  public async Task<JsonObject> Execute(Actor actor, string patientId, JsonObject command, bool patientAction = false)
  {
    await using var connection = await dataSource.OpenConnectionAsync(); await using var transaction = await connection.BeginTransactionAsync();
    var sql = patientAction
        ? "SELECT p.document FROM patient_records p JOIN clinic_users u ON u.patient_id=p.id AND u.clinic_id=p.clinic_id WHERE p.id=$1 AND u.id=$2 AND p.clinic_id=$3 AND u.active FOR UPDATE OF p"
        : "SELECT p.document FROM patient_records p JOIN care_relationships c ON c.patient_id=p.id AND c.clinic_id=p.clinic_id WHERE p.id=$1 AND c.doctor_id=$2 AND c.clinic_id=$3 AND c.active FOR UPDATE OF p";
    await using var read = new NpgsqlCommand(sql, connection, transaction);
    read.Parameters.AddWithValue(patientId); read.Parameters.AddWithValue(actor.Id); read.Parameters.AddWithValue(actor.ClinicId);
    var raw = (string?)await read.ExecuteScalarAsync(); if (raw is null) throw new DomainException("Пациент недоступен.", 404);
    var document = JsonNode.Parse(raw)!.AsObject(); var commandId = Domain.Required(command, "commandId"); var mutation = Domain.Object(command, "mutation");
    var hash = Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(mutation.ToJsonString())));
    await using var receipt = new NpgsqlCommand("SELECT payload_hash,actor_id FROM command_receipts WHERE patient_id=$1 AND command_id=$2", connection, transaction); receipt.Parameters.AddWithValue(patientId); receipt.Parameters.AddWithValue(commandId);
    await using (var reader = await receipt.ExecuteReaderAsync()) if (await reader.ReadAsync()) { if (reader.GetString(0) != hash || reader.GetString(1) != actor.Id) throw new DomainException("Идентификатор действия уже использован для другой команды.", 409); return document; }
    if (patientAction)
    {
      var type = Domain.S(mutation, "type"); if (type is not ("report.add" or "report.patient" or "questionnaire.patient" or "message.patient" or "message.received" or "dose.patient")) throw new DomainException("Действие недоступно пациенту.", 403);
      command["expectedRevision"] = document["revision"]!.DeepClone();
    }
    var updated = Domain.Apply(document, command, actor, patientAction);
    var revision = updated["revision"]!.GetValue<int>();
    await using var write = new NpgsqlCommand("WITH updated AS (UPDATE patient_records SET document=$1,revision=$2,updated_at=now() WHERE id=$3 RETURNING id), history AS (INSERT INTO record_versions(patient_id,revision,document,actor_id) SELECT id,$2,$1,$4 FROM updated), receipt AS (INSERT INTO command_receipts(patient_id,command_id,actor_id,payload_hash,revision) SELECT id,$5,$4,$6,$2 FROM updated) INSERT INTO access_audit(actor_id,clinic_id,patient_id,action) SELECT $4,$7,id,$8 FROM updated", connection, transaction);
    write.Parameters.AddWithValue(NpgsqlDbType.Jsonb, updated.ToJsonString()); write.Parameters.AddWithValue(revision); write.Parameters.AddWithValue(patientId); write.Parameters.AddWithValue(actor.Id); write.Parameters.AddWithValue(commandId); write.Parameters.AddWithValue(hash); write.Parameters.AddWithValue(actor.ClinicId); write.Parameters.AddWithValue(Domain.S(mutation, "type"));
    await write.ExecuteNonQueryAsync(); await transaction.CommitAsync(); return updated;
  }
  public async Task<JsonObject> PatientData(Actor actor)
  {
    await using var command = dataSource.CreateCommand("SELECT document FROM patient_records WHERE id=$1 AND clinic_id=$2"); command.Parameters.AddWithValue(actor.PatientId!); command.Parameters.AddWithValue(actor.ClinicId);
    var raw = (string?)await command.ExecuteScalarAsync(); if (raw is null) throw new DomainException("Карта недоступна.", 404);
    var doc = JsonNode.Parse(raw)!.AsObject(); await Audit(actor, actor.PatientId, "patient.read");
    var plan = new JsonArray();
    // Patient instructions are an explicit projection. Internal rationales,
    // observations, source snapshots and scale interpretations stay with the doctor.
    foreach (var item in Domain.Array(doc, "plan").Where(n => Domain.S(n!, "status") == "confirmed")) {
      var visible = new JsonObject();
      foreach(var field in new[]{"id","kind","title","dose","schedule","startDate","endDate","dueDate","status","confirmedAt","confirmedBy","patientInstructions","medicine"})
        if(item!.AsObject().ContainsKey(field))visible[field]=item[field]?.DeepClone();
      plan.Add(visible);
    }
    var doseSchedules = new JsonArray(); var doseRecords = new JsonArray();
    if (doc["adherence"] is JsonObject adherence) {
      foreach (var schedule in Domain.Array(adherence, "schedules").OfType<JsonObject>()) {
        var visible = new JsonObject();
        foreach (var field in new[]{"id","version","planId","times","offsetMinutes","effectiveFrom","effectiveUntil","endDate"}) visible[field] = schedule[field]?.DeepClone();
        var original = Domain.Object(schedule, "planSnapshot"); var medication = new JsonObject();
        foreach (var field in new[]{"id","title","dose","schedule","patientInstructions"}) medication[field] = original[field]?.DeepClone();
        visible["medication"] = medication; doseSchedules.Add(visible);
      }
      foreach (var record in Domain.Array(adherence, "records").OfType<JsonObject>()) {
        var visible = new JsonObject();
        foreach (var field in new[]{"id","scheduleId","scheduleVersion","plannedAt","version","status","reportedAt","provenance"}) visible[field] = record[field]?.DeepClone();
        doseRecords.Add(visible);
      }
    }
    var questionnaires = new JsonArray();
    if (doc["workflow"] is JsonObject workflow && workflow["assignments"] is JsonArray assignments)
      foreach (var assignment in assignments.OfType<JsonObject>()) {
        var protocol = ClinicalProtocols.Find(Domain.S(assignment, "protocolVersion"));
        if (protocol is null || Domain.S(protocol, "id") is not ("gad7" or "phq9")) continue;
        var visible = new JsonObject(); foreach (var key in new[] { "id", "protocolVersion", "dueDate", "status" }) visible[key] = assignment[key]?.DeepClone();
        questionnaires.Add(visible);
      }
    return new() { ["patientId"] = actor.PatientId, ["name"] = doc["profile"]!["name"]!.DeepClone(), ["plan"] = plan, ["messages"] = doc["messages"]!.DeepClone(), ["reports"] = doc["reports"]!.DeepClone(), ["doseSchedules"] = doseSchedules, ["doseRecords"] = doseRecords, ["questionnaires"] = questionnaires };
  }
  public async Task Audit(Actor actor, string? patientId, string action)
  {
    await using var command = dataSource.CreateCommand("INSERT INTO access_audit(actor_id,clinic_id,patient_id,action) VALUES($1,$2,$3,$4)"); command.Parameters.AddWithValue(actor.Id); command.Parameters.AddWithValue(actor.ClinicId); command.Parameters.Add(new() { Value = (object?)patientId ?? DBNull.Value, NpgsqlDbType = NpgsqlDbType.Text }); command.Parameters.AddWithValue(action); await command.ExecuteNonQueryAsync();
  }
}
