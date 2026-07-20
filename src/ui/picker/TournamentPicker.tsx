// Launch picker (shown when there is no lastOpenedId): the tournament library with
// open / delete / archive, plus "New tournament". When signed in, cloud storage is the source of
// truth (owner + shared tournaments); otherwise falls back to local IndexedDB.

import { useEffect, useRef, useState } from "react";
import { Archive, ArchiveRestore, Plus, Share2, Trash2, Upload } from "lucide-react";
import type { Tournament } from "../../model/tournament.ts";
import type { TournamentMeta } from "../../persistence/db.ts";
import {
  deleteTournament,
  listTournaments,
  loadTournament,
  saveTournament,
} from "../../persistence/db.ts";
import { fetchCloudTournament, useCloudTournaments } from "../state/cloudTournaments.tsx";
import type { CloudTournamentMeta } from "../../persistence/supabaseTournaments.ts";
import { deserialize } from "../../persistence/serialize.ts";
import { t } from "../../i18n/t.ts";
import { Button } from "@/ui/shadcn/ui/button";
import { Card } from "@/ui/shadcn/ui/card";
import { ThemeToggle } from "../theme.tsx";
import { TournamentSharePanel } from "./TournamentSharePanel.tsx";
import bannerImg from "../../assets/beach-banner.png";
import { useCloudDirectory } from "../state/cloudDirectory.tsx";

export interface Active {
  id: string;
  name: string;
  tournament: Tournament;
  /** Present when this tournament came from cloud storage. */
  ownerId?: string;
  isOwner?: boolean;
  isArchived?: boolean;
  /** The updated_at the cloud row had when we loaded it — used for optimistic concurrency. */
  cloudUpdatedAt?: string;
}

const emptyTournament = (): Tournament => ({ referees: [], courts: [], days: [] });
const newId = (): string => `tourn-${crypto.randomUUID()}`;

// Shared hero banner used by both picker variants.
function PickerHero({
  onNew,
  onImport,
  importError,
  fileRef,
}: {
  onNew: () => void;
  onImport: (f: File) => void;
  importError: string | null;
  fileRef: React.RefObject<HTMLInputElement | null>;
}) {
  return (
    <section className="relative isolate flex min-h-[420px] flex-col justify-center overflow-hidden lg:min-h-[520px]">
      <img
        src={bannerImg}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover object-center"
      />
      <div className="absolute inset-0 bg-gradient-to-br from-primary/60 via-primary/40 to-primary/60" />
      <ThemeToggle className="absolute top-4 right-4 z-10 text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground" />
      <div className="relative mx-auto flex max-w-3xl flex-col items-start gap-5 px-6 py-20 text-primary-foreground sm:py-28">
        <h1 className="text-4xl font-semibold tracking-tight drop-shadow-sm sm:text-5xl">
          {t("common.appName")}
        </h1>
        <p className="max-w-xl text-lg text-primary-foreground/90">
          {t("wizard.picker.tagline")}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <Button size="lg" onClick={onNew} className="bg-sand text-sand-foreground hover:bg-sand/90">
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
              if (f) onImport(f);
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
  );
}

// Dispatcher: when signed in render the cloud picker, otherwise the local picker.
export function TournamentPicker({ onOpen }: { onOpen: (a: Active) => void | Promise<void> }) {
  const { session, client } = useCloudDirectory();
  if (session && client) return <CloudTournamentPicker onOpen={onOpen} />;
  return <LocalTournamentPicker onOpen={onOpen} />;
}

// ---- Cloud picker (signed-in users) ----

function CloudTournamentPicker({ onOpen }: { onOpen: (a: Active) => void | Promise<void> }) {
  const { client } = useCloudDirectory();
  const cloudCtx = useCloudTournaments();
  const [importError, setImportError] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<"active" | "archived">("active");
  const [shareTarget, setShareTarget] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const create = async () => {
    const rec: Active = { id: newId(), name: t("wizard.picker.defaultName"), tournament: emptyTournament() };
    await saveTournament(rec);
    await onOpen(rec);
  };

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

  const openCloud = async (meta: CloudTournamentMeta) => {
    if (!client) return;
    const rec = await fetchCloudTournament(client, meta.id);
    if (!rec) return;
    await onOpen({
      id: rec.id,
      name: rec.name,
      tournament: rec.tournament,
      ownerId: rec.ownerId,
      isOwner: rec.isOwner,
      isArchived: rec.status === "archived",
      cloudUpdatedAt: rec.updatedAt,
    });
  };

  const archiveCloud = async (meta: CloudTournamentMeta) => {
    await cloudCtx.setStatus(meta.id, meta.status === "archived" ? "active" : "archived");
    await cloudCtx.refresh();
  };

  const filteredCloud = cloudCtx.list.filter((m) => m.status === statusFilter);

  return (
    <div>
      <PickerHero
        onNew={create}
        onImport={(f) => void importFile(f)}
        importError={importError}
        fileRef={fileRef}
      />

      <main className="mx-auto max-w-3xl px-6 py-10">
        <div className="mb-4 flex items-center gap-3">
          <h2 className="text-lg font-semibold">{t("wizard.picker.yourTournaments")}</h2>
          <div className="flex gap-1 rounded-md border p-0.5">
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm ${statusFilter === "active" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setStatusFilter("active")}
            >
              {t("tournamentCloud.filter.active")}
            </button>
            <button
              type="button"
              className={`rounded px-3 py-1 text-sm ${statusFilter === "archived" ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"}`}
              onClick={() => setStatusFilter("archived")}
            >
              {t("tournamentCloud.filter.archived")}
            </button>
          </div>
          {cloudCtx.loading && (
            <span className="text-xs text-muted-foreground">{t("tournamentCloud.loading")}</span>
          )}
        </div>

        {cloudCtx.error && (
          <p className="mb-4 text-sm text-destructive">{cloudCtx.error}</p>
        )}

        {shareTarget && (
          <Card className="mb-4 p-4">
            <TournamentSharePanel
              tournamentId={shareTarget}
              onClose={() => setShareTarget(null)}
            />
          </Card>
        )}

        {filteredCloud.length === 0 ? (
          <p className="text-muted-foreground italic">
            {statusFilter === "archived"
              ? t("tournamentCloud.filter.emptyArchived")
              : t("wizard.picker.empty")}
          </p>
        ) : (
          <ul className="flex flex-col gap-2">
            {filteredCloud.map((m) => (
              <li key={m.id}>
                <Card className="flex-row items-center gap-3 p-2 transition-colors hover:border-primary">
                  <button
                    type="button"
                    disabled={m.status === "archived"}
                    className="flex min-w-0 flex-1 flex-col items-start gap-0.5 rounded-md px-3 py-2 text-left outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:opacity-60"
                    onClick={() => void openCloud(m)}
                  >
                    <span className="truncate font-semibold">
                      {m.name}
                      {!m.isOwner && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          ({t("tournamentCloud.shared")})
                        </span>
                      )}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {t("wizard.picker.updated", { date: new Date(m.updatedAt).toLocaleString() })}
                    </span>
                  </button>

                  {m.isOwner && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={t("tournamentCloud.share.title")}
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => setShareTarget(shareTarget === m.id ? null : m.id)}
                      >
                        <Share2 className="size-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        title={
                          m.status === "archived"
                            ? t("tournamentCloud.unarchive")
                            : t("tournamentCloud.archive")
                        }
                        className="text-muted-foreground hover:text-foreground"
                        onClick={() => void archiveCloud(m)}
                      >
                        {m.status === "archived" ? (
                          <ArchiveRestore className="size-4" />
                        ) : (
                          <Archive className="size-4" />
                        )}
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.delete")}
                        className="text-muted-foreground hover:text-destructive"
                        onClick={() => void cloudCtx.remove(m.id)}
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    </>
                  )}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}

// ---- Local picker (anonymous users) ----

function LocalTournamentPicker({ onOpen }: { onOpen: (a: Active) => void | Promise<void> }) {
  const [list, setLocalList] = useState<TournamentMeta[]>([]);
  const [importError, setImportError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const refresh = () =>
    listTournaments().then((l) =>
      setLocalList([...l].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))),
    );

  useEffect(() => {
    void refresh();
  }, []);

  const create = async () => {
    const rec: Active = { id: newId(), name: t("wizard.picker.defaultName"), tournament: emptyTournament() };
    await saveTournament(rec);
    await onOpen(rec);
  };

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

  const openLocal = async (id: string) => {
    const rec = await loadTournament(id);
    if (rec) await onOpen({ id: rec.id, name: rec.name, tournament: rec.tournament });
  };

  const removeLocal = async (id: string) => {
    await deleteTournament(id);
    await refresh();
  };

  return (
    <div>
      <PickerHero
        onNew={create}
        onImport={(f) => void importFile(f)}
        importError={importError}
        fileRef={fileRef}
      />

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
                    onClick={() => void openLocal(m.id)}
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
                    onClick={() => void removeLocal(m.id)}
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
