// Import — drop a .xlsx file or paste TSV/CSV, run the fixture parser as a fast-fill overlay onto the
// current tournament (via the store's mergeImport), and surface the merge report (counts, warnings,
// per-row errors). Referees are never touched by import.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import type { MergeResult } from "../../import/fixtures.ts";
import type { ImportInput } from "../../import/fixtures.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "@/ui/shadcn/ui/button";
import { Textarea } from "@/ui/shadcn/ui/textarea";
import { FileDrop } from "../components/FileDrop.tsx";
import { StepHeader } from "../components/StepHeader.tsx";

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
    <div className="max-w-[760px]">
      <StepHeader title={t("wizard.import.title")} subtitle={t("wizard.import.instructions")} />

      <FileDrop accept=".xlsx,.csv,.tsv" label={t("wizard.import.upload")} onFile={onFile} />

      <Textarea
        className="my-3 resize-y font-mono text-sm"
        rows={6}
        value={text}
        placeholder={t("wizard.import.paste")}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-1.5">
        <Button disabled={!text.trim()} onClick={() => run(text)}>
          {t("common.import")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="font-semibold">
            {t("wizard.import.rowsImported", { count: countMatches(result) })}{" "}
            <span className="font-normal text-muted-foreground">
              {t("wizard.import.added", { count: result.added.length })} ·{" "}
              {t("wizard.import.moved", { count: result.moved.length })} ·{" "}
              {t("wizard.import.removed", { count: result.removed.length })}
            </span>
          </p>
          {result.warnings.length > 0 && (
            <details>
              <summary>{t("wizard.import.warningsHeading")} ({result.warnings.length})</summary>
              <ul className="mt-1 pl-5 text-muted-foreground">
                {result.warnings.map((w, i) => (
                  <li key={i}>{w}</li>
                ))}
              </ul>
            </details>
          )}
          {result.errors.length > 0 && (
            <details open>
              <summary className="text-destructive">
                {t("wizard.import.errorsHeading")} ({result.errors.length})
              </summary>
              <ul className="mt-1 pl-5 text-muted-foreground">
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
