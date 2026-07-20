// App-level referee-directory manager (referee-directory-spec §4), shown under the tournament picker.
// Rename is uniqueness-checked; delete removes only the library entry (tournaments keep their snapshot
// copy). Rendered outside a tournament, since the directory is shared across all of them.

import { useState } from "react";
import type { Referee } from "../../model/tournament.ts";
import { sortByName } from "../../model/directory.ts";
import { useDirectory } from "../state/directory.tsx";
import { t } from "../../i18n/t.ts";
import { Button } from "@/ui/shadcn/ui/button";
import { Input } from "@/ui/shadcn/ui/input";
import { CloudDirectoryPanel } from "./CloudDirectoryPanel.tsx";

export function RefereeLibrary() {
  const dir = useDirectory();
  const entries = sortByName(dir.library);

  return (
    <section className="mx-auto max-w-3xl px-6 pb-16">
      <CloudDirectoryPanel />
      <h2 className="text-lg font-semibold">{t("library.title")}</h2>
      <p className="mt-1 mb-4 text-sm text-muted-foreground">{t("library.subtitle")}</p>
      {entries.length === 0 ? (
        <p className="text-muted-foreground italic">{t("library.empty")}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {entries.map((r) => (
            <LibraryRow key={r.id} entry={r} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LibraryRow({ entry }: { entry: Referee }) {
  const dir = useDirectory();
  const [draft, setDraft] = useState(entry.name);
  const [error, setError] = useState("");

  const commit = () => {
    const name = draft.trim();
    if (!name || name === entry.name) {
      setDraft(entry.name); // revert empties / no-ops
      setError("");
      return;
    }
    const res = dir.rename(entry.id, name);
    if (res.ok) {
      setError("");
    } else {
      setError(res.reason === "duplicate" ? t("library.duplicate", { name }) : "");
      setDraft(entry.name);
    }
  };

  const remove = () => {
    if (window.confirm(t("library.confirmDelete", { name: entry.name }))) dir.remove(entry.id);
  };

  return (
    <li className="flex items-center gap-2">
      <Input
        value={draft}
        aria-label={t("library.rename")}
        aria-invalid={error ? true : undefined}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => e.key === "Enter" && e.currentTarget.blur()}
      />
      {error && <span className="text-xs text-destructive">{error}</span>}
      <Button variant="destructive" onClick={remove}>
        {t("common.delete")}
      </Button>
    </li>
  );
}
