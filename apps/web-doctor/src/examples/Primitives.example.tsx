import { useState } from "react";
import {
  Button,
  DialogRoot,
  DialogTrigger,
  DialogPanel,
  TextField,
} from "@psycho/ui-web";
import type { ExampleContext } from "@psycho/ui-web/examples";

export function PrimitivesExample({ fixture, recordAction }: ExampleContext) {
  const [value, setValue] = useState("");
  const [mode, setMode] = useState("normal");
  const [open, setOpen] = useState(false);
  return (
    <div className="two-columns">
      <section className="stack">
        <h2>Поле и кнопка</h2>
        <label className="stack">
          Состояние поля
          <select
            className="example-select"
            value={mode}
            onChange={(event) => setMode(event.currentTarget.value)}
          >
            <option value="normal">Обычное</option>
            <option value="disabled">Недоступное</option>
            <option value="error">С ошибкой</option>
          </select>
        </label>
        <TextField
          label="Учебное название"
          hint="Вводите только вымышленные значения."
          value={value}
          disabled={mode === "disabled"}
          error={
            mode === "error"
              ? "Пример переданной ошибки. Это не результат проверки данных."
              : undefined
          }
          onChange={(next) => {
            setValue(next);
            recordAction("onChange", next);
          }}
        />
        <div className="row">
          <Button onClick={() => recordAction("onClick", "demo-button")}>
            Проверить действие
          </Button>
          <Button disabled variant="secondary">
            Недоступно
          </Button>
        </div>
      </section>
      <section className="stack">
        <h2>Базовый диалог</h2>
        <p className="muted">
          Проверьте Tab, Shift+Tab, Escape и возврат фокуса. Длинное содержимое
          включается выбором набора.
        </p>
        <div>
          <DialogRoot
            open={open}
            onOpenChange={(next) => {
              setOpen(next);
              recordAction("onOpenChange", next);
            }}
          >
            <DialogTrigger asChild>
              <Button variant="secondary">Открыть базовый диалог</Button>
            </DialogTrigger>
            <DialogPanel title="Проверка информационного диалога">
              <div className="stack">
                {Array.from(
                  { length: fixture.scenario === "long" ? 24 : 2 },
                  (_, index) => (
                    <p key={index}>
                      Учебный блок {index + 1}. Содержимое диалога
                      прокручивается, а заголовок и кнопка закрытия остаются
                      доступными.
                    </p>
                  ),
                )}
                <a
                  href="https://github.com/souponin-d/psycho"
                  target="_blank"
                  rel="noreferrer"
                >
                  Репозиторий проекта
                </a>
              </div>
            </DialogPanel>
          </DialogRoot>
        </div>
      </section>
    </div>
  );
}
