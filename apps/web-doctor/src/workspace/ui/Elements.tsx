import {
  useId,
  useLayoutEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { DialogPanel, DialogRoot } from "@psycho/ui-web";
import styles from "./workspace.module.css";
export { styles };
export type IconName =
  | "home"
  | "people"
  | "calendar"
  | "bell"
  | "book"
  | "plus"
  | "search"
  | "arrow"
  | "back"
  | "check"
  | "clock"
  | "file"
  | "chart"
  | "heart"
  | "message"
  | "settings"
  | "logout"
  | "chevron"
  | "external"
  | "edit"
  | "close"
  | "download"
  | "shield"
  | "menu"
  | "refresh"
  | "activity"
  | "print"
  | "pill";
const paths: Record<IconName, ReactNode> = {
  home: (
    <>
      <path d="m3 10 9-7 9 7v10a1 1 0 0 1-1 1h-5v-7H9v7H4a1 1 0 0 1-1-1Z" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="7" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 4a3 3 0 0 1 0 6m2 5a5 5 0 0 1 3 5" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4m10-4v4M3 11h18m-13 4h2m4 0h2m-8 3h2" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9m-12 9h12m-8 4h4" />
    </>
  ),
  book: (
    <>
      <path d="M12 5C8 2 5 3 3 4v16c3-2 6-1 9 1 3-2 6-3 9-1V4c-2-1-5-2-9 1Zm0 0v16" />
    </>
  ),
  pill: (
    <path d="m8 16 8-8 M7 3a6 6 0 0 1 8 0l6 6a6 6 0 0 1-8 8l-6-6a6 6 0 0 1 0-8Z" />
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H5v18h14V8Zm0 0v5h5M8 12h8m-8 4h6" />
    </>
  ),
  chart: <path d="M4 3v17h17M7 14l4-5 4 3 5-7" />,
  heart: (
    <path d="M20.8 5.6a5.5 5.5 0 0 0-7.8 0L12 6.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8L12 22l8.8-8.6a5.5 5.5 0 0 0 0-7.8Z" />
  ),
  message: (
    <path d="M21 12a8 8 0 0 1-8 8H4l-2 2V12a9 9 0 0 1 19 0ZM7 9h10M7 13h7" />
  ),
  settings: (
    <>
      <path d="M4 7h16M4 17h16" />
      <circle cx="8" cy="7" r="2" />
      <circle cx="16" cy="17" r="2" />
    </>
  ),
  logout: <path d="M9 3H4v18h5m5-16 7 7-7 7m-6-7h13" />,
  chevron: <path d="m9 5 7 7-7 7" />,
  external: <path d="M14 3h7v7m0-7L10 14m0-10H4v16h16v-6" />,
  edit: <path d="m15 4 5 5M4 20l5-1L21 7a2 2 0 0 0-4-4L5 15Zm0 0 1-5" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  download: <path d="M12 3v12m-5-5 5 5 5-5M4 17v4h16v-4" />,
  shield: (
    <>
      <path d="M12 3 3 7v6c0 5 9 9 9 9s9-4 9-9V7Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  menu: <path d="M4 6h16M4 12h16M4 18h16" />,
  refresh: (
    <>
      <path d="M20 7v5h-5M4 17v-5h5" />
      <path d="M6 6a8 8 0 0 1 14 6M4 12a8 8 0 0 0 14 6" />
    </>
  ),
  activity: <path d="M2 12h5l3-8 4 16 3-8h5" />,
  print: (
    <>
      <path d="M6 9V3h12v6M6 17H3V9h18v8h-3M6 14h12v7H6Z" />
    </>
  ),
};
export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  );
}
export function Button({
  children,
  variant = "primary",
  icon,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  icon?: IconName;
}) {
  return (
    <button
      {...props}
      className={`${styles.button} ${styles[variant]} ${props.className ?? ""}`}
      type={props.type ?? "button"}
    >
      {icon && <Icon name={icon} size={18} />}
      <span>{children}</span>
    </button>
  );
}
export function Field({
  label,
  hint,
  error,
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <label className={styles.field} htmlFor={id}>
      <span>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </span>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      <input
        {...props}
        id={id}
        aria-invalid={!!error}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {error && (
        <small id={`${id}-error`} className={styles.errorText}>
          {error}
        </small>
      )}
    </label>
  );
}
export function Textarea({
  label,
  hint,
  error,
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
}) {
  const id = useId();
  return (
    <label className={styles.field} htmlFor={id}>
      <span>
        {label}
        {props.required && <span aria-hidden="true"> *</span>}
      </span>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      <textarea
        {...props}
        id={id}
        rows={props.rows ?? 3}
        aria-invalid={!!error}
        aria-describedby={
          [hint && `${id}-hint`, error && `${id}-error`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      />
      {error && (
        <small id={`${id}-error`} className={styles.errorText}>
          {error}
        </small>
      )}
    </label>
  );
}
export function Select({
  label,
  hint,
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string }) {
  const id = useId();
  return (
    <label className={styles.field} htmlFor={id}>
      <span>{label}</span>
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      <select
        {...props}
        id={id}
        aria-describedby={
          [props["aria-describedby"], hint && `${id}-hint`]
            .filter(Boolean)
            .join(" ") || undefined
        }
      >
        {children}
      </select>
    </label>
  );
}
export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "green" | "amber" | "red";
}) {
  return <span className={`${styles.badge} ${styles[tone]}`}>{children}</span>;
}
export function Empty({
  icon = "file",
  title,
  children,
  action,
}: {
  icon?: IconName;
  title: string;
  children: ReactNode;
  action?: ReactNode;
}) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}>
        <Icon name={icon} size={27} />
      </span>
      <h3>{title}</h3>
      <p>{children}</p>
      {action}
    </div>
  );
}
export function Modal({
  open,
  onClose,
  title,
  className,
  wide = false,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  className?: string;
  wide?: boolean;
  children: ReactNode;
}) {
  useLayoutEffect(() => {
    if (!open) return;
    const opener = document.activeElement;
    return () => {
      // The shared controlled Dialog has no DialogTrigger. Restore its external
      // opener only if closing did not already move focus to another route.
      window.requestAnimationFrame(() => {
        if (
          opener instanceof HTMLElement &&
          opener.isConnected &&
          document.activeElement === document.body
        ) {
          opener.focus({ preventScroll: true });
        }
      });
    };
  }, [open]);
  return (
    <DialogRoot
      open={open}
      onOpenChange={(value) => {
        if (!value) onClose();
      }}
    >
      <DialogPanel
        title={title}
        size={wide ? "wide" : "default"}
        bodyClassName={wide ? styles.wideDialogBody : undefined}
      >
        <div
          className={`${styles.root} ${styles.modalBody} ${className ?? ""}`}
        >
          {children}
        </div>
      </DialogPanel>
    </DialogRoot>
  );
}
export function Section({
  title,
  description,
  action,
  children,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section className={styles.panel}>
      <div className={styles.sectionHeading}>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}
export function ErrorNotice({ children }: { children: ReactNode }) {
  return (
    <div className={styles.errorNotice} role="alert">
      <Icon name="bell" />
      <div>{children}</div>
    </div>
  );
}
