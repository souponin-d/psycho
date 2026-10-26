using System.Security.Cryptography;
using System.Security.Cryptography.X509Certificates;
using System.Text.Json;
using System.Text.Json.Nodes;
using System.Threading.RateLimiting;
using Doctor.Api;
using Microsoft.AspNetCore.Antiforgery;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.DataProtection;
using Microsoft.AspNetCore.RateLimiting;
using Npgsql;

var builder = WebApplication.CreateBuilder(args);
builder.WebHost.ConfigureKestrel(options => options.Limits.MaxRequestBodySize = 2_000_000);
var connectionString = builder.Configuration.GetConnectionString("Doctor") ?? throw new InvalidOperationException("Задайте ConnectionStrings__Doctor для PostgreSQL. См. docs/doctor-workspace-runbook.md.");
var keyDirectory = builder.Configuration["Doctor:KeyDirectory"] ?? Path.Combine(builder.Environment.ContentRootPath, ".data", "keys");
Directory.CreateDirectory(keyDirectory);
var protection = builder.Services.AddDataProtection().SetApplicationName("Syncli.Doctor").PersistKeysToFileSystem(new DirectoryInfo(keyDirectory));
if (!builder.Environment.IsDevelopment())
{
  var certificatePath = builder.Configuration["Doctor:KeyCertificatePath"] ?? throw new InvalidOperationException("Для рабочего развёртывания задайте сертификат защиты ключей Doctor__KeyCertificatePath.");
  protection.ProtectKeysWithCertificate(X509CertificateLoader.LoadPkcs12FromFile(certificatePath, builder.Configuration["Doctor:KeyCertificatePassword"]));
}
builder.Services.AddSingleton(NpgsqlDataSource.Create(connectionString)); builder.Services.AddSingleton<Store>();
builder.Services.AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme).AddCookie(options =>
{
  options.Cookie.Name = "syncli-doctor-session"; options.Cookie.HttpOnly = true; options.Cookie.SameSite = SameSiteMode.Strict;
  options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always;
  options.ExpireTimeSpan = TimeSpan.FromHours(8); options.SlidingExpiration = false;
  options.Events.OnRedirectToLogin = context => { context.Response.StatusCode = 401; return Task.CompletedTask; };
  options.Events.OnRedirectToAccessDenied = context => { context.Response.StatusCode = 403; return Task.CompletedTask; };
  options.Events.OnValidatePrincipal = async context => { if (context.Principal is null || !await context.HttpContext.RequestServices.GetRequiredService<Store>().ValidSession(Actor.From(context.Principal))) context.RejectPrincipal(); };
});
builder.Services.AddAuthorization(options => { options.AddPolicy("doctor", policy => policy.RequireRole("doctor")); options.AddPolicy("patient", policy => policy.RequireRole("patient")); });
builder.Services.AddAntiforgery(options => { options.HeaderName = "X-CSRF-TOKEN"; options.Cookie.Name = "syncli-csrf"; options.Cookie.HttpOnly = true; options.Cookie.SameSite = SameSiteMode.Strict; options.Cookie.SecurePolicy = builder.Environment.IsDevelopment() ? CookieSecurePolicy.SameAsRequest : CookieSecurePolicy.Always; });
builder.Services.AddRateLimiter(options => { options.RejectionStatusCode = 429; options.AddPolicy("login", context => RateLimitPartition.GetFixedWindowLimiter(context.Connection.RemoteIpAddress?.ToString() ?? "unknown", _ => new() { PermitLimit = 10, Window = TimeSpan.FromMinutes(1), QueueLimit = 0 })); });
builder.Services.AddOpenApi();
var app = builder.Build();
Icd10Catalog.Initialize();
GrlsCatalog.Initialize();
var store = app.Services.GetRequiredService<Store>(); await store.Initialize(AppContext.BaseDirectory);
if (args.Contains("--provision"))
{
  string RequiredSetting(string name) => builder.Configuration[$"Provision:{name}"] ?? throw new InvalidOperationException($"Задайте Provision__{name}.");
  await store.Provision(new(RequiredSetting("Id"), RequiredSetting("Name"), RequiredSetting("Specialty"), RequiredSetting("ClinicId"), builder.Configuration["Provision:PatientId"]), RequiredSetting("Email"), RequiredSetting("Password"));
  Console.WriteLine("Учётная запись создана. Пароль не выводится в журнал."); return;
}
app.Use(async (context, next) =>
{
  context.Response.Headers["X-Content-Type-Options"] = "nosniff"; context.Response.Headers["Referrer-Policy"] = "same-origin"; context.Response.Headers["Cache-Control"] = "no-store";
  try { await next(); }
  catch (DomainException error) { context.Response.StatusCode = error.Status; await context.Response.WriteAsJsonAsync(new { title = "Действие не выполнено", detail = error.Message }); }
  catch (AntiforgeryValidationException) { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { title = "Сессия изменилась", detail = "Обновите страницу и повторите действие." }); }
  catch (Exception error) when (error is JsonException or InvalidOperationException or FormatException or InvalidCastException or KeyNotFoundException)
  { context.Response.StatusCode = 400; await context.Response.WriteAsJsonAsync(new { title = "Некорректные данные", detail = "Проверьте формат и обязательные поля записи." }); }
  catch (PostgresException error) when (error.SqlState == "23505") { context.Response.StatusCode = 409; await context.Response.WriteAsJsonAsync(new { title = "Конфликт", detail = "Запись уже существует. Обновите данные." }); }
  catch (Exception error) { app.Logger.LogError("Request failed: {Type}; trace {TraceId}", error.GetType().Name, context.TraceIdentifier); context.Response.StatusCode = 500; await context.Response.WriteAsJsonAsync(new { title = "Сервер не выполнил действие", detail = "Результат сохранения не подтверждён. Повторите то же действие или передайте администратору код ошибки.", traceId = context.TraceIdentifier }); }
});
if (!app.Environment.IsDevelopment()) { app.UseHsts(); app.UseHttpsRedirection(); }
app.UseRateLimiter(); app.UseAuthentication(); app.UseAuthorization();
app.Use(async (context, next) => { if (context.Request.Method is "POST" or "PUT" or "PATCH" or "DELETE") await context.RequestServices.GetRequiredService<IAntiforgery>().ValidateRequestAsync(context); await next(); });
app.MapGet("/api/health", async (NpgsqlDataSource db) => { await using var command = db.CreateCommand("SELECT 1"); await command.ExecuteScalarAsync(); return Results.Ok(new { status = "ready", storage = "postgresql" }); }).AllowAnonymous();
app.MapGet("/api/csrf", (HttpContext context, IAntiforgery anti) => Results.Ok(new { token = anti.GetAndStoreTokens(context).RequestToken })).AllowAnonymous();
app.MapPost("/api/login", async (LoginRequest request, HttpContext context, Store db) =>
{
  if (string.IsNullOrWhiteSpace(request.Email) || string.IsNullOrEmpty(request.Password) || request.Email.Length > 250 || request.Password.Length > 200) return Results.BadRequest(new { detail = "Проверьте данные входа." });
  var actor = await db.Authenticate(request.Email, request.Password); if (actor is null) return Results.Json(new { detail = "Не удалось войти. Проверьте почту и пароль." }, statusCode: 401);
  await context.SignInAsync(CookieAuthenticationDefaults.AuthenticationScheme, actor.Principal(), new AuthenticationProperties { IsPersistent = false }); await db.Audit(actor, null, "session.login"); return Results.Ok(new { role = actor.PatientId is null ? "doctor" : "patient" });
}).RequireRateLimiting("login").AllowAnonymous();
app.MapPost("/api/logout", async (HttpContext context, Store db) => { await db.Audit(Actor.From(context.User), null, "session.logout"); await context.SignOutAsync(); return Results.NoContent(); }).RequireAuthorization();
app.MapGet("/api/session", (HttpContext context, IAntiforgery anti) => Results.Ok(new { actor = Actor.From(context.User), csrfToken = anti.GetAndStoreTokens(context).RequestToken })).RequireAuthorization("doctor");
var doctor = app.MapGroup("/api").RequireAuthorization("doctor");
doctor.MapGet("/terminology/grls", (string? q,int? page,int? pageSize)=>Results.Json(GrlsCatalog.Search(q??"",page??1,pageSize??12)));
doctor.MapGet("/terminology/icd10", (string? q, int? page, int? pageSize) => Results.Json(Icd10Catalog.Search(q ?? "", page ?? 1, pageSize ?? 25)));
doctor.MapGet("/patients", async (HttpContext context, Store db) => Results.Json(await db.List(Actor.From(context.User))));
doctor.MapPost("/patients", async (JsonObject request, HttpContext context, Store db) => Results.Json(await db.Create(Actor.From(context.User), request), statusCode: 201));
doctor.MapPost("/patients/{id}/commands", async (string id, JsonObject request, HttpContext context, Store db) => Results.Json(await db.Execute(Actor.From(context.User), id, request)));
doctor.MapGet("/sources", () => Results.File(Path.Combine(AppContext.BaseDirectory, "Sources.json"), "application/json"));
doctor.MapGet("/assessment-forms/{id}", async (string id, HttpContext context, Store db) =>
{
  if (!System.Text.RegularExpressions.Regex.IsMatch(id, "^S(2[1-9]|3[0-8])$")) return Results.NotFound(new { detail = "Форма не найдена." });
  var directory = builder.Configuration["Doctor:FormDirectory"];
  if (string.IsNullOrWhiteSpace(directory)) return Results.NotFound(new { detail = "Исходные формы не подготовлены. Подключите каталог форм." });
  var path = Path.Combine(Path.GetFullPath(directory), id + ".json");
  if (!File.Exists(path)) return Results.NotFound(new { detail = "Исходная форма отсутствует. Используйте оригинал источника." });
  if (new FileInfo(path).Length > 4 * 1024 * 1024) return Results.BadRequest(new { detail = "Файл формы слишком большой." });
  var form = JsonNode.Parse(await File.ReadAllTextAsync(path))!.AsObject();
  var source = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Sources.json")))!.AsArray().First(s => Domain.S(s, "id") == id);
  if (Domain.S(form, "sourceId") != id || Domain.S(form, "sourceHash") != Domain.S(source, "sha256")) return Results.Conflict(new { detail = "Форма относится к другой редакции источника. Повторите подготовку." });
  await db.Audit(Actor.From(context.User), null, $"assessment-form.read:{id}");
  return Results.Json(form);
});
doctor.MapGet("/openapi/v1.json", () => Results.File(Path.Combine(AppContext.BaseDirectory, "doctor.openapi.json"), "application/json"));
doctor.MapGet("/sources/{id}/file", async (string id, HttpContext context, Store db) =>
{
  var sources = JsonNode.Parse(await File.ReadAllTextAsync(Path.Combine(AppContext.BaseDirectory, "Sources.json")))!.AsArray();
  var source = sources.FirstOrDefault(n => Domain.S(n!, "id") == id); if (source is null) return Results.NotFound(new { detail = "Источник не найден." });
  var directory = builder.Configuration["Doctor:SourceDirectory"]; if (string.IsNullOrWhiteSpace(directory)) return Results.NotFound(new { detail = "Каталог исходных документов не подключён администратором." });
  var root = Path.GetFullPath(directory).TrimEnd(Path.DirectorySeparatorChar) + Path.DirectorySeparatorChar; var path = Path.GetFullPath(Path.Combine(root, Domain.S(source, "relativePath")));
  if (!path.StartsWith(root, StringComparison.OrdinalIgnoreCase) || !File.Exists(path)) return Results.NotFound(new { detail = "Исходный файл недоступен." });
  await using (var stream = File.OpenRead(path)) { var hash = Convert.ToHexString(await SHA256.HashDataAsync(stream)); if (!hash.Equals(Domain.S(source, "sha256"), StringComparison.OrdinalIgnoreCase)) return Results.Conflict(new { detail = "Редакция файла изменилась. Обновите паспорт источника перед использованием." }); }
  await db.Audit(Actor.From(context.User), null, $"source.read:{id}");
  var mime = Path.GetExtension(path).ToLowerInvariant() switch { ".pdf" => "application/pdf", ".md" => "text/plain; charset=utf-8", ".rtf" => "application/rtf", _ => "application/octet-stream" };
  return Results.File(path, mime, enableRangeProcessing: true);
});
var patient = app.MapGroup("/api/patient").RequireAuthorization("patient");
patient.MapGet("/session", (HttpContext context, IAntiforgery anti) => Results.Ok(new { actor = Actor.From(context.User), csrfToken = anti.GetAndStoreTokens(context).RequestToken }));
patient.MapGet("/record", async (HttpContext context, Store db) => Results.Json(await db.PatientData(Actor.From(context.User))));
patient.MapPost("/commands", async (JsonObject request, HttpContext context, Store db) => { var actor = Actor.From(context.User); await db.Execute(actor, actor.PatientId!, request, true); return Results.Json(await db.PatientData(actor)); });
if (app.Environment.IsDevelopment()) app.MapOpenApi().RequireAuthorization("doctor");
await app.RunAsync();
public sealed record LoginRequest(string Email, string Password);
