import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
import { Button } from "./Button";
import styles from "./primitives.module.css";

export const DialogRoot = Dialog.Root;
export const DialogTrigger = Dialog.Trigger;
export function DialogPanel({
  title,
  children,
  size = "default",
  bodyClassName,
}: {
  title: string;
  size?: "default" | "wide";
  bodyClassName?: string;
  children: ReactNode;
}) {
  return (
    <Dialog.Portal>
      <Dialog.Overlay className={styles.overlay} />
      <Dialog.Content
        className={`${styles.dialog} ${size === "wide" ? styles.dialogWide : ""}`}
        aria-describedby={undefined}
      >
        <header className={styles.dialogHeader}>
          <Dialog.Title className={styles.dialogTitle}>{title}</Dialog.Title>
          <Dialog.Close asChild>
            <Button variant="secondary">Закрыть</Button>
          </Dialog.Close>
        </header>
        <div className={`${styles.dialogBody} ${bodyClassName ?? ""}`}>
          {children}
        </div>
      </Dialog.Content>
    </Dialog.Portal>
  );
}
