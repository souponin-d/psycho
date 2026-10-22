import type { AdminDemoData, AdminRole } from "../data";
import type { ClinicDataset, DemoCommand } from "./model";
import { addDays, dateLabel } from "./model";
import { DEMO_DAY } from "./fixtures";
import { staffRoles } from "./session";

/** Adapter is local to the demo, never an API DTO or an authorization decision. */
export function toWorkspaceData(
  base: AdminDemoData,
  data: ClinicDataset,
  commands: DemoCommand[],
): AdminDemoData {
  const current = base.employees.find((e) => e.id === base.currentEmployeeId)!;
  const available = ["director", "coordinator", "system"].filter((r) =>
    current.roles.includes(r as AdminRole),
  ) as AdminRole[];
  const employees: AdminDemoData["employees"] = [
    { ...current, roles: available },
  ];
  if (data.scenario !== "empty") {
    for (const id of Object.keys(staffRoles).filter(
      (id) => id !== current.id,
    )) {
      const latest = commands
        .filter((c) => c.kind === "roles" && c.employeeId === id)
        .at(-1);
      employees.push({
        id,
        name:
          id === "demo-staff-02" && data.scenario === "long"
            ? "Сотрудник административного сопровождения с намеренно длинным обозначением"
            : `Сотрудник А-${id.slice(-2)}`,
        kind: "staff",
        roles:
          latest?.kind === "roles" ? [...latest.after] : [...staffRoles[id]!],
      });
    }
    employees.push(
      ...data.doctors.map((d) => ({
        id: d.id,
        name: d.name,
        kind: "doctor" as const,
        roles: [],
      })),
    );
  }
  const from = addDays(DEMO_DAY, -13);
  const team = data.doctors.map((doctor) => {
    const patients = data.patients.filter((p) => p.doctorId === doctor.id);
    const ids = new Set(patients.map((p) => p.id));
    const next = data.visits
      .filter(
        (v) =>
          ids.has(v.patientId) && v.status === "scheduled" && v.day > DEMO_DAY,
      )
      .sort((a, b) => (a.day + a.time).localeCompare(b.day + b.time))[0];
    return {
      id: doctor.id,
      name: doctor.name,
      unit: data.departments.find((d) => d.id === doctor.departmentId)!.name,
      patients: patients.filter((p) => !p.closed).length,
      reports: data.reports.filter((r) => ids.has(r.patientId) && r.day >= from)
        .length,
      nextVisit: next ? `${dateLabel(next.day)} · ${next.time}` : null,
    };
  });
  const periods = [14, 7].map((length, index) => {
    const startDate = addDays(DEMO_DAY, 1 - length);
    return {
      id: index ? "demo-period-recent" : "demo-period-full",
      label: `${dateLabel(startDate)} – ${dateLabel(DEMO_DAY)} 2026`,
      startDate,
      endDate: DEMO_DAY,
      series: {
        label: `Самоотчёты · ${length} дней`,
        points: data.patients.length
          ? Array.from({ length }, (_, i) => {
              const day = addDays(startDate, i);
              return {
                id: `demo-day-${day}`,
                label: dateLabel(day),
                value: data.outages.includes(day)
                  ? null
                  : data.reports.filter((r) => r.day === day).length,
              };
            })
          : [],
      },
      officeReports: team.map((office) => ({
        doctorId: office.id,
        count: data.reports.filter(
          (r) =>
            r.day >= startDate &&
            data.patients.find((p) => p.id === r.patientId)?.doctorId ===
              office.id,
        ).length,
      })),
    };
  });
  return {
    ...base,
    unit:
      data.scenario === "long"
        ? "Клиника «Синкли» · комплексная программа длительного сопровождения"
        : "Клиника «Синкли»",
    employees,
    team,
    periods,
    series: periods[0]!.series,
    period: periods[0]!.label,
    metrics: [
      {
        id: "demo-admin-patients",
        label: "Пациенты",
        value: String(team.reduce((sum, d) => sum + d.patients, 0)),
      },
      {
        id: "demo-admin-reports",
        label: "Самоотчёты",
        value: String(team.reduce((sum, d) => sum + d.reports, 0)),
      },
    ],
    events: base.events,
  };
}
