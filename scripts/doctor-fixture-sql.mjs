/** Подключение только к той БД, которую использует изолированный тестовый API. */
export function fixtureDatabaseSettings(connectionString, databaseOverride) {
  if (typeof connectionString !== "string")
    throw new Error("Нужна тестовая строка PostgreSQL.");
  const values = new Map();
  // В тестовой конфигурации используются простые значения; неоднозначные
  // кавычки/разделители отклоняются без вывода строки с паролем.
  for (const segment of connectionString.split(";")) {
    if (!segment.trim()) continue;
    const separator = segment.indexOf("=");
    if (separator < 1)
      throw new Error("Неподдерживаемая тестовая строка PostgreSQL.");
    const key = segment.slice(0, separator).trim().toLowerCase();
    const value = segment.slice(separator + 1).trim();
    if (/["']/.test(value))
      throw new Error("Неподдерживаемая тестовая строка PostgreSQL.");
    values.set(key, value);
  }
  const host = values.get("host") ?? values.get("server");
  const port = values.get("port") ?? "5432";
  const user =
    values.get("username") ?? values.get("user id") ?? values.get("userid");
  const database = databaseOverride ?? values.get("database");
  const password = values.get("password");
  if (
    !host ||
    !user ||
    !database ||
    !password ||
    !/^\d+$/.test(port) ||
    +port < 1 ||
    +port > 65535
  )
    throw new Error("Неполная тестовая конфигурация PostgreSQL.");
  if (!["localhost", "127.0.0.1", "::1"].includes(host))
    throw new Error(
      "SQL-фикстуры разрешены только для локального тестового PostgreSQL.",
    );
  return { host, port, user, database, password };
}
