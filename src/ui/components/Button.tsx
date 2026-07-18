// Minimal shared button: a variant + the standard button attributes. Defaults type="button" so it
// never accidentally submits a form.

import type { ButtonHTMLAttributes } from "react";
import styles from "./components.module.css";

type Variant = "primary" | "default" | "danger";

export function Button({
  variant = "default",
  className,
  type,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  const cls = [styles.btn, styles[variant], className].filter(Boolean).join(" ");
  return <button type={type ?? "button"} className={cls} {...rest} />;
}
