import { useId, type ComponentProps } from "react";
import styles from "./primitives.module.css";

export type TextFieldProps = Omit<
  ComponentProps<"input">,
  "value" | "onChange"
> & {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  error?: string;
};
export function TextField({
  label,
  value,
  onChange,
  hint,
  error,
  id: suppliedId,
  className = "",
  "aria-describedby": describedBy,
  ...props
}: TextFieldProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const descriptions =
    [
      describedBy,
      hint ? `${id}-hint` : undefined,
      error ? `${id}-error` : undefined,
    ]
      .filter(Boolean)
      .join(" ") || undefined;
  return (
    <div className={styles.field}>
      <label htmlFor={id} className={styles.label}>
        {label}
      </label>
      <input
        {...props}
        id={id}
        value={value}
        onChange={(event) => onChange(event.currentTarget.value)}
        aria-describedby={descriptions}
        aria-invalid={error ? true : undefined}
        className={`${styles.input} ${className}`}
      />
      {hint && (
        <p id={`${id}-hint`} className={styles.hint}>
          {hint}
        </p>
      )}
      {error && (
        <p id={`${id}-error`} className={styles.error}>
          {error}
        </p>
      )}
    </div>
  );
}
