// Import — drop one or more files (.xlsx/.csv/.tsv) or paste TSV/CSV, run the fixture parser as a
// fast-fill overlay onto the current tournament (via store.mergeImport), and surface the merge report
// (per-file counts, union added/moved/removed, warnings, per-row errors). Referees are never touched.

import { useState } from "react";
import { useStore } from "../state/store.tsx";
import type { ImportSource, MergeResult } from "../../import/fixtures.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "@/ui/shadcn/ui/button";
import { Textarea } from "@/ui/shadcn/ui/textarea";
import { FileDrop } from "../components/FileDrop.tsx";
import { StepHeader } from "../components/StepHeader.tsx";

function importedCount(result: MergeResult): number {
  return result.fileCounts.reduce((sum, file) => sum + file.matchCount, 0);
}

export function ImportStep() {
  const store = useStore();
  const [text, setText] = useState("");
  const [result, setResult] = useState<MergeResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  const run = (inputs: ImportSource[]) => {
    try {
      setError(null);
      setResult(store.importMatches(inputs));
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const onFiles = async (files: File[]) => {
    try {
      const inputs = await Promise.all(
        files.map(async (file) => ({
          name: file.name,
          input: /\.xlsx$/i.test(file.name) ? await file.arrayBuffer() : await file.text(),
        })),
      );
      run(inputs);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="max-w-[760px]">
      <StepHeader title={t("wizard.import.title")} subtitle={t("wizard.import.instructions")} />

      <FileDrop
        accept=".xlsx,.csv,.tsv"
        label={t("wizard.import.upload")}
        multiple
        onFiles={onFiles}
      />

      <Textarea
        className="my-3 resize-y font-mono text-sm"
        rows={6}
        value={text}
        placeholder={t("wizard.import.paste")}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex gap-1.5">
        <Button
          disabled={!text.trim()}
          onClick={() => run([{ name: t("wizard.import.pasteSource"), input: text }])}
        >
          {t("common.import")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {result && (
        <div className="mt-4 flex flex-col gap-2">
          <p className="font-semibold">
            {t("wizard.import.rowsImported", { count: importedCount(result) })}{" "}
            <span className="font-normal text-muted-foreground">
              {t("wizard.import.added", { count: result.added.length })} ·{" "}
              {t("wizard.import.moved", { count: result.moved.length })} ·{" "}
              {t("wizard.import.removed", { count: result.removed.length })}
            </span>
          </p>
          {result.fileCounts.length > 0 && (
            <details>
              <summary>{t("wizard.import.fileCountsHeading")} ({result.fileCounts.length})</summary>
              <ul className="mt-1 pl-5 text-muted-foreground">
                {result.fileCounts.map((file, i) => (
                  <li key={`${file.fileName}-${i}`}>
                    {t("wizard.import.fileCount", { file: file.fileName, count: file.matchCount })}
                  </li>
                ))}
              </ul>
            </details>
          )}
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
