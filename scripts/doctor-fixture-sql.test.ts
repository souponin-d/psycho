import { expect, it } from "vitest";
import { fixtureDatabaseSettings } from "./doctor-fixture-sql.mjs";
const connection =
  "Host=127.0.0.1;Port=5544;Database=isolated;Username=doctor_test;Password=synthetic=only;Include Error Detail=false";
it("SQL-фикстуры используют подключение API, не локальный doctor_workspace", () => {
  expect(fixtureDatabaseSettings(connection)).toEqual({
    host: "127.0.0.1",
    port: "5544",
    database: "isolated",
    user: "doctor_test",
    password: "synthetic=only",
  });
});
it("разрешает явное имя изолированной тестовой базы", () => {
  expect(
    fixtureDatabaseSettings(connection, "isolated_override").database,
  ).toBe("isolated_override");
});
it.each([
  undefined,
  "Host=localhost;Password=secret",
  "Host=remote.example;Database=db;Username=test;Password=secret",
  "Host=localhost;Port=0;Database=db;Username=test;Password=secret",
  "Host=localhost;Database=db;Username=test;Password='secret;part'",
])(
  "отклоняет неоднозначное или нелокальное подключение без раскрытия пароля: %s",
  (value) => {
    expect(() => fixtureDatabaseSettings(value)).toThrow();
    try {
      fixtureDatabaseSettings(value);
    } catch (error) {
      expect(String(error)).not.toContain("secret");
    }
  },
);
