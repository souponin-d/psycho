import { createPatient, createVisit } from "./commands";
import type { Actor, PatientRecord } from "./model";
export const demoActor: Actor = {
  id: "doctor-demo",
  clinicId: "clinic-demo",
  name: "Анна Лебедева",
  specialty: "psychiatrist",
};
export function seedPatients(reference = new Date()): PatientRecord[] {
  const day = (offset: number, hour = 10) => {
    const d = new Date(reference);
    d.setDate(d.getDate() + offset);
    d.setHours(hour, 0, 0, 0);
    return d.toISOString();
  };
  const people = [
    [
      "Мария Соколова",
      "1992-04-18",
      "female",
      "Повышенная тревога",
      "Дизайнер",
    ],
    [
      "Александр Волков",
      "1985-11-03",
      "male",
      "Сниженное настроение",
      "Инженер",
    ],
    [
      "Елена Морозова",
      "1978-08-26",
      "female",
      "Наблюдение за состоянием",
      "Преподаватель",
    ],
    ["Дмитрий Орлов", "1997-02-14", "male", "Трудности со сном", "Аналитик"],
    [
      "Анастасия Белова",
      "2000-06-09",
      "female",
      "Первичная консультация",
      "Студентка",
    ],
    [
      "Сергей Козлов",
      "1969-12-21",
      "male",
      "Контрольный приём",
      "Предприниматель",
    ],
  ];
  return people.map(([name, birthDate, sex, complaint, occupation], i) => {
    const p = createPatient(
      {
        name: name!,
        birthDate: birthDate!,
        sex: sex as "female" | "male",
        occupation: occupation!,
        allergies:
          "Со слов пациента, известные реакции не отмечает; требуется уточнение",
        goals:
          i === 0
            ? "Снова спокойно вести рабочие встречи и восстановить сон"
            : "Улучшить повседневное функционирование",
        socialContext: "Синтетический пример. Есть поддержка близких.",
      },
      demoActor,
      day(-35 - i),
      `demo-patient-${i + 1}`,
    );
    p.code = `П-${String(1024 + i).padStart(5, "0")}`;
    p.episodes.push({
      id: `ep-${i}`,
      ...stamp(day(-35)),
      title: complaint!,
      startedOn: day(-35).slice(0, 10),
      status: "active",
      phase: i === 4 ? "assessment" : "continuation",
      diagnosis: "",
      diagnosisStatus: "hypothesis",
      endDate: "",
      summary: "",
    });
    p.consents.push({
      id: `consent-${i}`,
      ...stamp(day(-35)),
      purpose: "care",
      status: "documented",
      signedOn: day(-35).slice(0, 10),
      documentReference: "Синтетический образец согласия",
      person: name!,
      scope: "Амбулаторное сопровождение",
      informing:
        "В синтетическом примере зафиксировано обсуждение целей, методов, альтернатив и рисков.",
    });
    if (i !== 4) {
      const past = createVisit(`visit-past-${i}`, day(-14), demoActor);
      past.status = "completed";
      past.completedAt = day(-14);
      past.confirmedBy = demoActor.name;
      past.kind = "initial";
      p.profile.clinicalContext.complaints = complaint!;
      p.profile.clinicalContext.illnessHistory =
        "Симптомы влияют на работу и сон. Обсуждены обстоятельства появления и предыдущий опыт помощи.";
      past.notes.mentalStatus = "Синтетическое описание психического статуса.";
      past.notes.somaticStatus =
        "Синтетическое описание соматического статуса.";
      past.notes.safetyConclusion =
        "Синтетическая запись оценки, не клиническое заключение.";
      past.notes.conclusion =
        "Согласован план наблюдения и повторная оценка на приёме.";
      past.notes.recommendations =
        "Вести дневник самочувствия. Подготовить вопросы к следующей встрече.";
      past.notes.patientPreference =
        "Постепенно вернуться к привычной нагрузке";
      past.sourceIds = ["S03", "S04"];
      p.visits.push(past);
      [19, 15, 11, 8].forEach((score, j) =>
        p.measurements.push({
          id: `measure-${i}-${j}`,
          ...stamp(day(-28 + j * 7)),
          visitId: j === 2 ? past.id : "",
          scale: i % 2 === 0 ? "GAD-7" : "PHQ-9",
          title: i % 2 === 0 ? "GAD-7" : "PHQ-9",
          version: "Синтетическая демонстрационная форма",
          measuredAt: day(-28 + j * 7),
          score: Math.max(1, score - i),
          maximum: i % 2 === 0 ? 21 : 27,
          answers: [],
          completeness: "complete",
          assessor: "patient",
          window: "Последние 2 недели",
          sourceId: i % 2 === 0 ? "S23" : "",
          interpretation:
            "Демонстрация числовой динамики; клиническая интерпретация не выполнялась",
          provenance: "patient",
          externalForm: "Синтетические данные для демонстрации интерфейса",
        }),
      );
      p.plan.push({
        id: `plan-${i}`,
        ...stamp(day(-14)),
        visitId: past.id,
        kind: "follow-up",
        title: "Повторная оценка состояния",
        details:
          "Обсудить самочувствие, сон, повседневную активность и вопросы пациента",
        dose: "",
        schedule: "",
        startDate: day(-14).slice(0, 10),
        endDate: "",
        dueDate: day(i < 3 ? 0 : 3).slice(0, 10),
        status: "confirmed",
        confirmedAt: day(-14),
        confirmedBy: demoActor.name,
        changeReason: "",
        replacesId: "",
        instructionUrl: "",
        patientInstructions:
          "Подготовьте дневник самочувствия и вопросы к приёму",
        sourceIds: ["S04"],
        rationale: "Индивидуальный план в синтетическом примере",
      });
    }
    const next = createVisit(
      `visit-next-${i}`,
      day(i < 3 ? 0 : i === 4 ? 1 : 3, 9 + i),
      demoActor,
    );
    next.kind = i === 4 ? "initial" : "follow-up";
    next.reason = complaint!;
    p.visits.push(next);
    if (i < 3)
      p.reports.push({
        id: `report-${i}`,
        ...stamp(day(-1, 19)),
        reportedAt: day(-1, 19),
        receivedAt: day(-1, 19),
        provenance: "patient",
        state: "completed",
        mood: 6 + i,
        anxiety: 4,
        sleepHours: 6.5,
        functioning: "Смог(ла) выполнить основные дела",
        medication: "not-applicable",
        medicationReason: "",
        adverseEffects:
          i === 1 ? "Сообщение о дискомфорте — синтетический пример" : "",
        note:
          i === 0
            ? "На этой неделе легче засыпать. Хочу обсудить возвращение к привычной нагрузке."
            : "Есть вопросы к следующему приёму",
        safetyConcern: false,
        reviewedAt: "",
      });
    if (i === 1)
      p.events.push({
        id: "event-demo-1",
        ...stamp(day(-1, 19)),
        title: "Уведомление от пациента",
        detail:
          "Пациент оставил запись о дискомфорте. Требуется уточнить обстоятельства.",
        urgency: "important",
        status: "created",
        relatedId: `report-${i}`,
        dueAt: day(0, 12),
        assignee: demoActor.name,
        assessment: "",
        action: "",
        outcome: "",
        history: [
          {
            at: day(-1, 19),
            by: "Пациент · синтетический пример",
            status: "created",
            note: "Новый самоотчёт",
          },
        ],
        sourceIds: ["S03"],
        rationale: "Прямое сообщение пациента",
      });
    p.updatedAt = day(i < 3 ? -1 : -7);
    return p;
  });
}
function stamp(time: string) {
  return { createdAt: time, author: demoActor.name };
}
