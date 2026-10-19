import { forwardRef, type ComponentProps } from "react";
import styles from "./primitives.module.css";

type ButtonProps = ComponentProps<"button"> & {
  variant?: "primary" | "secondary";
};
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  function Button(
    { type = "button", variant = "primary", className = "", ...props },
    ref,
  ) {
    return (
      <button
        {...props}
        type={type}
        ref={ref}
        data-variant={variant}
        className={`${styles.button} ${className}`}
      />
    );
  },
);
