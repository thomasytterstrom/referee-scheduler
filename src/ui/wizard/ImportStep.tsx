// Import — drop a .xlsx file or paste TSV/CSV, run the fixture parser as a fast-fill overlay onto the
// current tournament (via the store's mergeImport), and surface the merge report (counts, warnings,
// per-row errors). Referees are never touched by import.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import type { MergeResult } from "../../import/fixtures.ts";
import type { ImportInput } from "../../import/fixtures.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "../components/Button.tsx";
import { FileDrop } from "../components/FileDrop.tsx";
import { StepHeader } from "../components/StepHeader.tsx";
import styles from "./Wizard.module.css";

function countMatches(result: MergeResult): number {
  return result.tournament.days.reduce(
    (sum, d) => sum + d.rounds.reduce((r, rd) => r + rd.matches.length, 0),
    0,
  );
}

export function ImportStep() {
  const store = useStore();
  const [text, setText] = useState("");
  const [result, setResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (input: ImportInput) => {
    try {
      setError(null);
      setResult(store.importMatches(input));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFile = async (file: File) => {
    const input = /\.xlsx$/i.test(file.name) ? await file.arrayBuffer() : await file.text();
    run(input);
  };

  return (
    <div className={styles.step}>
      <StepHeader title={t("wizard.import.title")} subtitle={t("wizard.import.instructions")} />

      <FileDrop accept=".xlsx,.csv,.tsv" label={t("wizard.import.upload")} onFile={onFile} />

      <textarea
        className={styles.paste}
        rows={6}
        value={text}
        placeholder={t("wizard.import.paste")}
        onChange={(e) => setText(e.target.value)}
      />
      <div className={styles.addRow}>
        <Button variant="primary" disabled={!text.trim()} onClick={() => run(text)}>
          {t("common.import")}
        </Button>
      </div>

      {error && <p className={styles.error}>{error}</p>}

      {result && (
        <div className={styles.importSummary}>
          <p className={styles.summaryLine}>
            {t("wizard.import.rowsImported", { count: countMatches(result) })}{" "}
            <span className={styles.muted}>
              {t("wizard.import.added", { count: result.added.length })} ·{" "}
              {t("wizard.import.moved", { count: result.moved.length })} ·{" "}
              {t("wizard.import.removed", { count: result.removed.length })}
            </span>
          </p>
          {result.warnings.length > 0 && (
            <details>
              <summary>{t("wizard.import.warningsHeading")} ({result.warnings.length})</summary>
              <ul className={styles.msgList}>
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {result.errors.length > 0 && (
            <details open>
              <summary className={styles.error}>
                {t("wizard.import.errorsHeading")} ({result.errors.length})
              </summary>
              <ul className={styles.msgList}>
                {result.errors.map((er, i) => (
                  <li key={i}>{er}</li>
                ))}
              </ul>
            </details>
          )}
        </div>
      )}
    </div>
  );
}
