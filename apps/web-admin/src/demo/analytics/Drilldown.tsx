import { useState } from "react";
import { Button, DialogPanel, DialogRoot } from "@psycho/ui-web";
import { dateLabel } from "./model";
import type { ClinicDataset } from "./model";
import type { ClinicAnalysis } from "./aggregate";
import styles from "./analytics.module.css";
export type Selection = {
  kind: "patients" | "reports" | "visits" | "signals";
  day?: string;
  doctorId?: string;
};
export function Drilldown({
  selection,
  result,
  data,
  onClose,
}: {
  selection: Selection | null;
  result: ClinicAnalysis;
  data: ClinicDataset;
  onClose: () => void;
}) {
  const [page, setPage] = useState(0);
  const patientIds = new Set(
    result.selected.patients
      .filter((p) => !selection?.doctorId || p.doctorId === selection.doctorId)
      .map((p) => p.id),
  );
  const patient = (id: string) =>
    data.patients.find((p) => p.id === id)?.name ?? id;
  const doctor = (id: string) =>
    data.doctors.find(
      (d) => d.id === data.patients.find((p) => p.id === id)?.doctorId,
    )?.name ?? "";
  const rows =
    selection?.kind === "reports"
      ? result.selected.reports
          .filter(
            (r) =>
              patientIds.has(r.patientId) &&
              (!selection.day || r.day === selection.day),
          )
          .map((r) => ({
            id: r.id,
            name: patient(r.patientId),
            day: dateLabel(r.day),
            context: `${doctor(r.patientId)} · ${r.mood}`,
          }))
      : selection?.kind === "visits"
        ? result.selected.visits
            .filter(
              (v) =>
                v.status === "done" &&
                patientIds.has(v.patientId) &&
                (!selection.day || v.day === selection.day),
            )
            .map((v) => ({
              id: v.id,
              name: patient(v.patientId),
              day: dateLabel(v.day),
              context: `${doctor(v.patientId)} · ${v.kind}`,
            }))
        : selection?.kind === "signals"
          ? result.selected.signals
              .filter((s) => s.status !== "closed")
              .map((s) => ({
                id: s.id,
                name: patient(s.patientId),
                day: dateLabel(s.day),
                context: s.title,
              }))
          : result.selected.patients
              .filter((p) => !p.closed || p.closed > result.filter.to)
              .map((p) => ({
                id: p.id,
                name: p.name,
                day: dateLabel(p.enrolled),
                context: `${doctor(p.id)} · ${p.group}`,
              }));
  return (
    <DialogRoot
      open={!!selection}
      onOpenChange={(open) => {
        if (!open) {
          setPage(0);
          onClose();
        }
      }}
    >
      <DialogPanel title="Состав показателя">
        <section aria-label="Состав показателя">
          <p className={styles.muted}>
            {dateLabel(result.filter.from)} – {dateLabel(result.filter.to)} ·{" "}
            {rows.length} записей. Только синтетические сведения текущей
            выборки.
          </p>
          {rows.length ? (
            <>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Учебная запись</th>
                    <th>Дата</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.slice(page * 20, page * 20 + 20).map((row) => (
                    <tr key={row.id}>
                      <th scope="row">
                        {row.name}
                        <small>{row.context}</small>
                      </th>
                      <td>{row.day}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <div className={styles.pager}>
                <Button
                  variant="secondary"
                  disabled={!page}
                  onClick={() => setPage(page - 1)}
                >
                  Назад
                </Button>
                <span>
                  {page * 20 + 1}–{Math.min(page * 20 + 20, rows.length)} из{" "}
                  {rows.length}
                </span>
                <Button
                  variant="secondary"
                  disabled={(page + 1) * 20 >= rows.length}
                  onClick={() => setPage(page + 1)}
                >
                  Далее
                </Button>
              </div>
            </>
          ) : (
            <p className={styles.empty}>В этой выборке нет записей.</p>
          )}
        </section>
      </DialogPanel>
    </DialogRoot>
  );
}
