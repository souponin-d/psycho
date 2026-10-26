import fs from "node:fs";
import * as ts from "typescript/unstable/sync";
import path from "node:path";
import prettier from "prettier";

// The shared types own the wire format; this file adds HTTP routes and errors.
const file = path.resolve("apps/web-doctor/src/workspace/model.ts");
const api = new ts.API({ cwd: process.cwd() });
try {
  const snapshot = api.updateSnapshot({ openFiles: [file] });
  const project = snapshot.getDefaultProjectForFile(file);
  const program = project.program;
  const checker = project.checker;
  const source = program.getSourceFile(file);
  const exports = checker
    .getExportsOfModule(checker.getSymbolAtLocation(source))
    .filter((s) => s.flags & ts.SymbolFlags.Type);
  const names = new Set(exports.map((s) => s.name));
  function schema(type, root = false) {
    const name = type.getAliasSymbol()?.name ?? type.getSymbol()?.name;
    if (!root && name && names.has(name))
      return { $ref: `#/components/schemas/${name}` };
    if (type.flags & ts.TypeFlags.StringLiteral)
      return { type: "string", const: type.value };
    if (type.flags & ts.TypeFlags.NumberLiteral)
      return { type: "number", const: type.value };
    if (type.flags & ts.TypeFlags.BooleanLiteral)
      return { type: "boolean", const: type.intrinsicName === "true" };
    if (type.flags & ts.TypeFlags.String) return { type: "string" };
    if (type.flags & ts.TypeFlags.Number) return { type: "number" };
    if (type.flags & ts.TypeFlags.Boolean) return { type: "boolean" };
    if (type.flags & ts.TypeFlags.Null) return { type: "null" };
    if (type.flags & ts.TypeFlags.Union) {
      const parts = type
        .getTypes()
        .filter((t) => !(t.flags & ts.TypeFlags.Undefined));
      if (parts.every((t) => t.flags & ts.TypeFlags.BooleanLiteral))
        return { type: "boolean" };
      if (parts.every((t) => t.flags & ts.TypeFlags.StringLiteral))
        return { type: "string", enum: parts.map((t) => t.value) };
      return { anyOf: parts.map((t) => schema(t)) };
    }
    if (checker.isArrayType(type))
      return {
        type: "array",
        items: schema(checker.getTypeArguments(type)[0]),
      };
    if (type.flags & (ts.TypeFlags.Object | ts.TypeFlags.Intersection)) {
      const index = checker.getIndexInfosOfType(type)[0];
      if (index)
        return {
          type: "object",
          additionalProperties: schema(index.valueType),
        };
      const properties = {};
      const required = [];
      for (const prop of checker.getPropertiesOfType(type)) {
        properties[prop.name] = schema(
          checker.getTypeOfSymbolAtLocation(prop, source),
        );
        if (!(prop.flags & ts.SymbolFlags.Optional)) required.push(prop.name);
      }
      return {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
      };
    }
    throw new Error(`Unsupported wire type: ${checker.typeToString(type)}`);
  }
  const schemas = Object.fromEntries(
    exports.map((symbol) => [
      symbol.name,
      schema(checker.getDeclaredTypeOfSymbol(symbol), true),
    ]),
  );
  // Match Store.PatientData's explicit plan projection; internal clinical
  // rationales and score-bearing details never belong to the patient wire type.
  const patientPlanFields = [
    "id",
    "kind",
    "title",
    "dose",
    "schedule",
    "startDate",
    "endDate",
    "dueDate",
    "status",
    "confirmedAt",
    "confirmedBy",
    "patientInstructions",
    "medicine",
  ];
  schemas.PatientPlanItem = {
    type: "object",
    additionalProperties: false,
    properties: Object.fromEntries(
      patientPlanFields.map((name) => [
        name,
        schemas.PlanItem.properties[name],
      ]),
    ),
    required: schemas.PlanItem.required.filter((name) =>
      patientPlanFields.includes(name),
    ),
  };
  schemas.PatientPlanItem.properties.status = {
    type: "string",
    const: "confirmed",
  };
  const ref = (name) => ({ $ref: `#/components/schemas/${name}` });
  const json = (value) => ({ "application/json": { schema: value } });
  const errors = Object.fromEntries(
    [400, 401, 403, 404, 409, 429, 500].map((status) => [
      status,
      {
        description: {
          400: "Некорректные данные / CSRF",
          401: "Нужен вход",
          403: "Недостаточно полномочий",
          404: "Запись недоступна",
          409: "Конфликт версии / идентификатора",
          429: "Превышен лимит входов",
          500: "Сбой; повторить ту же команду",
        }[status],
        content: json({
          type: "object",
          properties: {
            detail: { type: "string" },
            traceId: { type: "string" },
          },
        }),
      },
    ]),
  );
  const response = (value) => ({
    200: { description: "Успешно", content: json(value) },
    ...errors,
  });
  const body = (value) => ({ required: true, content: json(value) });
  const csrf = {
    name: "X-CSRF-TOKEN",
    in: "header",
    required: true,
    schema: { type: "string" },
  };
  const id = {
    name: "id",
    in: "path",
    required: true,
    schema: { type: "string" },
  };
  const session = {
    type: "object",
    required: ["actor", "csrfToken"],
    properties: { actor: ref("Actor"), csrfToken: { type: "string" } },
  };
  const paths = {
    "/api/health": {
      get: {
        operationId: "health",
        security: [],
        responses: response({ type: "object" }),
      },
    },
    "/api/csrf": {
      get: {
        operationId: "csrf",
        security: [],
        responses: response({
          type: "object",
          properties: { token: { type: "string" } },
        }),
      },
    },
    "/api/patient/access": {
      post: {
        operationId: "patientAccess",
        description:
          "Опциональный хакатонный доступ к одной синтетической карте. Повторно используемый код, серверная привязка, CSRF и лимит попыток. По умолчанию выключен.",
        security: [],
        parameters: [csrf],
        requestBody: body({
          type: "object",
          required: ["code"],
          properties: {
            code: { type: "string", minLength: 1, maxLength: 200 },
          },
        }),
        responses: response({
          type: "object",
          required: ["role"],
          properties: { role: { const: "patient" } },
        }),
      },
    },
    "/api/login": {
      post: {
        operationId: "login",
        security: [],
        parameters: [csrf],
        requestBody: body({
          type: "object",
          required: ["email", "password"],
          properties: {
            email: { type: "string" },
            password: { type: "string" },
          },
        }),
        responses: response({ type: "object" }),
      },
    },
    "/api/logout": {
      post: {
        operationId: "logout",
        parameters: [csrf],
        responses: { 204: { description: "Сессия завершена" }, ...errors },
      },
    },
    "/api/session": {
      get: { operationId: "session", responses: response(session) },
    },
    "/api/patients": {
      get: {
        operationId: "patients",
        responses: response({ type: "array", items: ref("PatientRecord") }),
      },
      post: {
        operationId: "createPatient",
        description:
          "Повтор запроса с тем же id и содержимым не создаёт вторую карту.",
        parameters: [csrf],
        requestBody: body({
          type: "object",
          required: ["id", "profile"],
          properties: {
            id: { type: "string", format: "uuid" },
            profile: {
              type: "object",
              required: ["name"],
              properties: schemas.Profile.properties,
            },
          },
        }),
        responses: {
          201: {
            description: "Создана / повтор ранее выполненного создания",
            content: json(ref("PatientRecord")),
          },
          ...errors,
        },
      },
    },
    "/api/patients/{id}/commands": {
      post: {
        operationId: "execute",
        description:
          "commandId стабилен при повторе после сетевой ошибки; expectedRevision предотвращает потерю правок. Автор/клиника определяются сессией.",
        parameters: [csrf, id],
        requestBody: body(ref("Command")),
        responses: response(ref("PatientRecord")),
      },
    },
    "/api/sources": {
      get: {
        operationId: "sources",
        responses: response({ type: "array", items: ref("SourceDocument") }),
      },
    },
    "/api/terminology/icd10": {
      get: {
        operationId: "searchIcd10",
        description:
          "Полная актуальная российская МКБ-10: код, название, класс или блок; пагинация с 1. Неактуальные записи и группировочные узлы не выбираются как диагноз.",
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            schema: { type: "string", maxLength: 250 },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "pageSize",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 25 },
          },
        ],
        responses: response(ref("Icd10SearchResult")),
      },
    },
    "/api/terminology/grls": {
      get: {
        operationId: "searchGrls",
        description:
          "Только актуальные регистрации препаратов из проверенного снимка ГРЛС; статус и версия сохраняются в назначении.",
        parameters: [
          {
            name: "q",
            in: "query",
            required: false,
            schema: { type: "string", maxLength: 250 },
          },
          {
            name: "page",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, default: 1 },
          },
          {
            name: "pageSize",
            in: "query",
            required: false,
            schema: { type: "integer", minimum: 1, maximum: 100, default: 12 },
          },
        ],
        responses: response(ref("GrlsSearchResult")),
      },
    },
    "/api/assessment-forms/{id}": {
      get: {
        operationId: "assessmentForm",
        parameters: [id],
        responses: response(ref("AssessmentFormDefinition")),
      },
    },
    "/api/sources/{id}/file": {
      get: {
        operationId: "sourceFile",
        parameters: [id],
        responses: {
          200: { description: "Исходный файл, SHA-256 совпадает с реестром" },
          ...errors,
        },
      },
    },
    "/api/patient/session": {
      get: { operationId: "patientSession", responses: response(session) },
    },
    "/api/patient/record": {
      get: {
        operationId: "patientRecord",
        responses: response({
          type: "object",
          properties: {
            patientId: { type: "string" },
            name: { type: "string" },
            plan: { type: "array", items: ref("PatientPlanItem") },
            reports: { type: "array", items: ref("SelfReport") },
            messages: { type: "array", items: ref("Message") },
          },
        }),
      },
    },
    "/api/patient/commands": {
      post: {
        operationId: "patientCommand",
        description:
          "Только report.add, message.patient, message.received. PatientId берётся из сессии; сервер устанавливает provenance=patient. Возвращается допустимая пациентская проекция.",
        parameters: [csrf],
        requestBody: body({
          type: "object",
          required: ["commandId", "mutation"],
          properties: {
            commandId: { type: "string" },
            mutation: {
              oneOf: [
                {
                  type: "object",
                  required: ["type", "value"],
                  properties: {
                    type: { const: "report.add" },
                    value: ref("SelfReport"),
                  },
                },
                {
                  type: "object",
                  required: ["type", "text"],
                  properties: {
                    type: { const: "message.patient" },
                    text: { type: "string" },
                  },
                },
                {
                  type: "object",
                  required: ["type", "id", "status"],
                  properties: {
                    type: { const: "message.received" },
                    id: { type: "string" },
                    status: { type: "string", enum: ["delivered", "read"] },
                  },
                },
              ],
            },
          },
        }),
        responses: response({ type: "object" }),
      },
    },
  };
  const document = {
    openapi: "3.1.0",
    info: {
      title: "Синкли — рабочее место врача",
      version: "1.0.0",
      description:
        "Схемы сгенерированы из model.ts. Сервер проверяет полномочия, клинические переходы и целостность отдельно от структурной схемы.",
    },
    security: [{ session: [] }],
    paths,
    components: {
      securitySchemes: {
        session: {
          type: "apiKey",
          in: "cookie",
          name: "syncli-doctor-session",
        },
      },
      schemas,
    },
  };
  const output = "docs/contracts/doctor.openapi.json";
  function tsType(value) {
    if (value.$ref) {
      const name = value.$ref.split("/").at(-1);
      return name === "PatientPlanItem"
        ? tsType(schemas.PatientPlanItem)
        : `models.${name}`;
    }
    if ("const" in value) return JSON.stringify(value.const);
    if (value.enum) return value.enum.map((v) => JSON.stringify(v)).join(" | ");
    if (value.anyOf || value.oneOf)
      return (value.anyOf ?? value.oneOf).map(tsType).join(" | ");
    if (value.type === "array") return `Array<${tsType(value.items)}>`;
    if (value.type === "object" && value.additionalProperties)
      return `Record<string, ${tsType(value.additionalProperties)}>`;
    if (value.type === "object")
      return `{${Object.entries(value.properties ?? {})
        .map(
          ([name, s]) =>
            `${JSON.stringify(name)}${value.required?.includes(name) ? "" : "?"}: ${tsType(s)}`,
        )
        .join(";")}}`;
    if (
      value.type === "string" ||
      value.type === "number" ||
      value.type === "boolean" ||
      value.type === "null"
    )
      return value.type;
    return "unknown";
  }
  const functions = [];
  for (const [route, methods] of Object.entries(paths))
    for (const [method, operation] of Object.entries(methods)) {
      if (operation.operationId === "sourceFile") continue;
      const parameters = (operation.parameters ?? []).filter(
        (p) => p.in === "path",
      );
      const query = (operation.parameters ?? []).filter(
        (p) => p.in === "query",
      );
      const requestSchema =
        operation.requestBody?.content?.["application/json"]?.schema;
      const success =
        operation.responses[200] ??
        operation.responses[201] ??
        operation.responses[204];
      const result = success?.content?.["application/json"]?.schema;
      let resultType = result ? tsType(result) : "void";
      if (result?.type === "object") {
        const alias =
          operation.operationId[0].toUpperCase() +
          operation.operationId.slice(1) +
          "Response";
        functions.push(`export type ${alias} = ${resultType};`);
        resultType = alias;
      }
      const args = [
        "transport: Transport",
        ...parameters.map((p) => `${p.name}: string`),
        ...(query.length
          ? [
              `query: { ${query.map((p) => `${p.name}?: ${p.schema.type === "integer" ? "number" : "string"}`).join("; ")} } = {}`,
            ]
          : []),
        ...(requestSchema ? [`body: ${tsType(requestSchema)}`] : []),
      ];
      let url = route
        .replace(/^\/api/, "")
        .replace(
          /\{(\w+)\}/g,
          (_, key) => "${encodeURIComponent(" + key + ")}",
        );
      if (query.length)
        url +=
          "?${new URLSearchParams(Object.entries(query).filter(([, value]) => value !== undefined).map(([key, value]) => [key, String(value)]))}";
      functions.push(
        `export function ${operation.operationId}(${args.join(", ")}): Promise<${resultType}> {return transport(\`${url}\`, {method: ${JSON.stringify(method.toUpperCase())}${requestSchema ? ", body: JSON.stringify(body)" : ""}});}`,
      );
    }
  const clientPath = "apps/web-doctor/src/workspace/api.generated.ts";
  const client = await prettier.format(
    `// Generated by npm run contract:doctor. Do not edit.\nimport type * as models from "./model";\nexport type Transport = <T>(path: string, options?: RequestInit) => Promise<T>;\n${functions.join("\n")}`,
    {
      filepath: clientPath,
      ...(await prettier.resolveConfig(clientPath, { editorconfig: true })),
    },
  );
  const content = await prettier.format(JSON.stringify(document), {
    filepath: output,
    ...(await prettier.resolveConfig(output, { editorconfig: true })),
  });
  if (process.argv.includes("--check")) {
    if (
      JSON.stringify(JSON.parse(fs.readFileSync(output, "utf8"))) !==
      JSON.stringify(document)
    )
      throw new Error("Контракт устарел. Выполните npm run contract:doctor.");
    if (
      fs.readFileSync(clientPath, "utf8").replace(/\r\n/g, "\n") !==
      client.replace(/\r\n/g, "\n")
    )
      throw new Error("API client is stale. Run npm run contract:doctor.");
    console.log("Doctor OpenAPI matches shared types.");
  } else {
    fs.mkdirSync("docs/contracts", { recursive: true });
    fs.writeFileSync(output, content);
    fs.writeFileSync(clientPath, client);
    console.log(output);
  }
} finally {
  api.close();
}
