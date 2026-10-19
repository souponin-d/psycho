import { useState } from "react";
import { Button, InfoDialogView } from "@psycho/ui-web";
import type { ExampleContext } from "@psycho/ui-web/examples";

export function InfoDialogExample({ fixture, recordAction }: ExampleContext) {
  const [open, setOpen] = useState(false);
  return (
    <div className="stack">
      <h2>Информационный диалог</h2>
      <p className="muted">
        Задача #7 использует готовый механизм диалога. Его можно проверить
        отдельно в примере «Поля и базовый диалог».
      </p>
      <InfoDialogView
        open={open}
        title="Об учебных данных"
        trigger={<Button>Открыть информацию</Button>}
        onOpenChange={(next) => {
          setOpen(next);
          recordAction("onOpenChange", next);
        }}
      >
        <div className="stack">
          {Array.from(
            { length: fixture.scenario === "long" ? 24 : 1 },
            (_, index) => (
              <p key={index}>
                Это вымышленные данные для проверки интерфейса. Набор не
                является медицинским эталоном.
              </p>
            ),
          )}
        </div>
      </InfoDialogView>
    </div>
  );
}
