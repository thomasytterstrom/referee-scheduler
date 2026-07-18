// Launch picker (shown when there is no lastOpenedId): the IndexedDB library of tournaments with
// open / delete, plus "New tournament". A new tournament is persisted immediately so it appears in the
// library and reload works.

import { useEffect, useRef, useState } from "react";
import { Plus, Trash2, Upload } from "lucide-react";
import type { Tournament } from "../../model/tournament.ts";
import type { TournamentMeta } from "../../persistence/db.ts";
import {
  deleteTournament,
  listTournaments,
  loadTournament,
  saveTournament,
} from "../../persistence/db.ts";
import { deserialize } from "../../persistence/serialize.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "@/ui/shadcn/ui/button";
import { Card } from "@/ui/shadcn/ui/card";
import bannerImg from "../../assets/beach-banner.png";

export interface Active {
  id: string;
  name: string;
  tournament: Tournament;
}

const emptyTournament = (): Tournament => ({ referees: [], courts: [], days: [] });
const newId = (): string => `tourn-${crypto.randomUUID()}`;

export function TournamentPicker({ onOpen }: { onOpen: (a: Active) => void | Promise<void> }) {
  const [list, setList] = useState<TournamentMeta[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listTournaments().then((l) =>
      setList([...l].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    );
  useEffect(() => {
    void refresh();
  }, []);

  const create = async () => {
    const rec: Active = { id: newId(), name: t("wizard.picker.defaultName"), tournament: emptyTournament() };
    await saveTournament(rec);
    await onOpen(rec);
  };

  // Load an exported JSON envelope as a brand-new library entry. The envelope carries no id/name, so
  // mint a fresh id and recover the name from the export filename (`<name>_<date>.json`).
  const importFile = async (file: File) => {
    try {
      setImportError(null);
      const tournament = deserialize(JSON.parse(await file.text()));
      const name =
        file.name
          .replace(/\.json$/i, "")
          .replace(/_\d{4}-\d{2}-\d{2}$/, "")
          .trim() || t("wizard.picker.defaultName");
      const rec: Active = { id: newId(), name, tournament };
      await saveTournament(rec);
      await onOpen(rec);
    } catch (e) {
      setImportError(e instanceof Error ? e.message : String(e));
    }
  };

  const open = async (id: string) => {
    const rec = await loadTournament(id);
    if (rec) await onOpen({ id: rec.id, name: rec.name, tournament: rec.tournament });
  };

  const remove = async (id: string) => {
    await deleteTournament(id);
    await refresh();
  };

  return (
    <div>
      {/* Hero banner — SBT montage with an ocean-blue gradient wash and the app title overlaid. */}
      <section className="relative isolate flex min-h-[420px] flex-col justify-center overflow-hidden lg:min-h-[520px]">
        <img
          src={bannerImg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover object-center"
        />
        <div className="absolute inset-0 bg-gradient-to-br from-primary/60 via-primary/40 to-primary/60" />
        <div className="relative mx-auto flex max-w-3xl flex-col items-start gap-5 px-6 py-20 text-primary-foreground sm:py-28">
          <h1 className="text-4xl font-semibold tracking-tight drop-shadow-sm sm:text-5xl">
            {t("common.appName")}
          </h1>
          <p className="max-w-xl text-lg text-primary-foreground/90">
            {t("wizard.picker.tagline")}
          </p>
          <div className="flex flex-wrap items-center gap-3">
            <Button size="lg" onClick={create} className="bg-sand text-sand-foreground hover:bg-sand/90">
              <Plus className="size-4" />
              {t("wizard.picker.new")}
            </Button>
            <Button
              size="lg"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              className="border-primary-foreground/40 bg-transparent text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
            >
              <Upload className="size-4" />
              {t("wizard.picker.import")}
            </Button>
            <input
              ref={fileRef}
              type="file"
              accept=".json,application/json"
              hidden
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void importFile(f);
                e.target.value = "";
              }}
            />
          </div>
          {importError && (
            <p className="text-sm text-primary-foreground/90">
              {t("wizard.picker.importError", { error: importError })}
            </p>
          )}
        </div>
      </section>

      <main className="mx-auto max-w-3xl px-6 py-10">
        <h2 className="mb-4 text-lg font-semibold">{t("wizard.picker.yourTournaments")}</h2>
        {list.length === 0 ? (
          <p className="text-muted-foreground italic">{t("wizard.picker.empty")}</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {list.map((m) => (
              <li key={m.id}>
                <Card className="flex-row items-center gap-3 p-2 transition-colors hover:border-primary">
                  <button
                    type="button"
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50"
                    onClick={() => open(m.id)}
                  >
                    <span className="truncate font-semibold">{m.name}</span>
                    <span className="text-xs text-muted-foreground">
                      {t("wizard.picker.updated", { date: new Date(m.updatedAt).toLocaleString() })}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={t("common.delete")}
                    className="text-muted-foreground hover:text-destructive"
                    onClick={() => remove(m.id)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
