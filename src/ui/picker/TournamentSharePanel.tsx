// Owner-only share panel: invite co-editors by email, list current editors, revoke access.

import { useEffect, useState } from "react";
import { X, UserPlus } from "lucide-react";
import { Button } from "@/ui/shadcn/ui/button";
import { Input } from "@/ui/shadcn/ui/input";
import { t } from "../../i18n/t.ts";
import type { CloudEditorRecord } from "../../persistence/supabaseTournaments.ts";
import { useCloudTournaments } from "../state/cloudTournaments.tsx";

interface Props {
  tournamentId: string;
  onClose: () => void;
}

export function TournamentSharePanel({ tournamentId, onClose }: Props) {
  const cloud = useCloudTournaments();
  const [editors, setEditors] = useState<CloudEditorRecord[]>([]);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const reload = async () => {
    try {
      const rows = await cloud.listEditors(tournamentId);
      setEditors(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tournamentId]);

  const invite = async () => {
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setBusy(true);
    setError(null);
    try {
      await cloud.addEditor(tournamentId, trimmed);
      setEmail("");
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const revoke = async (invitedEmail: string) => {
    setBusy(true);
    setError(null);
    try {
      await cloud.removeEditor(tournamentId, invitedEmail);
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-semibold">{t("tournamentCloud.share.title")}</h3>
        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="flex gap-2">
        <Input
          type="email"
          placeholder={t("tournamentCloud.share.emailPlaceholder")}
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && void invite()}
        />
        <Button disabled={busy || !email.trim()} onClick={() => void invite()}>
          <UserPlus className="size-4" />
          {t("tournamentCloud.share.invite")}
        </Button>
      </div>

      {error && <p className="text-sm text-destructive">{error}</p>}

      {editors.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {editors.map((ed) => (
            <li key={ed.invitedEmail} className="flex items-center justify-between text-sm">
              <span>
                {ed.invitedEmail}
                {!ed.editorUserId && (
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({t("tournamentCloud.share.pending")})
                  </span>
                )}
              </span>
              <Button
                variant="ghost"
                size="icon"
                disabled={busy}
                onClick={() => void revoke(ed.invitedEmail)}
              >
                <X className="size-3" />
              </Button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-muted-foreground">{t("tournamentCloud.share.noEditors")}</p>
      )}
    </div>
  );
}
