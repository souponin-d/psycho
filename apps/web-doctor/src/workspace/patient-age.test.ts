import { expect, it } from "vitest";
import { createPatient, applyCommand } from "./commands";
import { demoActor } from "./seed";

const now = "2026-10-26T10:00:00.000Z";
it.each(["2008-10-26", "1906-10-26", "1905-10-27"])(
  "accepts an adult aged 18–120 born %s",
  (birthDate) => {
    expect(
      createPatient({ name: "Возраст", birthDate }, demoActor, now, "age")
        .profile.birthDate,
    ).toBe(birthDate);
  },
);
it.each(["2008-10-27", "1905-10-26", "1626-10-26"])(
  "rejects age outside 18–120 for birth date %s, on create and edit",
  (birthDate) => {
    expect(() =>
      createPatient({ name: "Возраст", birthDate }, demoActor, now, "age"),
    ).toThrow(/18.*120/);
    const p = createPatient(
      { name: "Возраст", birthDate: "1990-01-01" },
      demoActor,
      now,
      "age",
    );
    expect(() =>
      applyCommand(
        p,
        {
          commandId: "age-edit",
          expectedRevision: p.revision,
          mutation: {
            type: "profile.update",
            value: { ...p.profile, birthDate },
          },
        },
        demoActor,
        now,
      ),
    ).toThrow(/18.*120/);
  },
);
it("does not count a leap-day birthday as reached on February 28", () => {
  expect(() =>
    createPatient(
      { name: "Возраст", birthDate: "2008-02-29" },
      demoActor,
      "2026-02-28T10:00:00Z",
      "age",
    ),
  ).toThrow(/18.*120/);
  expect(
    createPatient(
      { name: "Возраст", birthDate: "2008-02-29" },
      demoActor,
      "2026-03-01T10:00:00Z",
      "age",
    ).id,
  ).toBe("age");
});
