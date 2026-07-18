// Title + optional subtitle at the top of each wizard step.

import styles from "./components.module.css";

export function StepHeader({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <header className={styles.stepHeader}>
      <h2>{title}</h2>
      {subtitle && <p>{subtitle}</p>}
    </header>
  );
}
