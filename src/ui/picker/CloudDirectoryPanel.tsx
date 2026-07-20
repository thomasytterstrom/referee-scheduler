import { useState } from "react";
import { Button } from "@/ui/shadcn/ui/button";
import { Input } from "@/ui/shadcn/ui/input";
import { t } from "../../i18n/t.ts";
import { useCloudDirectory } from "../state/cloudDirectory.tsx";
import { useDirectory } from "../state/directory.tsx";

export function CloudDirectoryPanel() {
  const cloud = useCloudDirectory();
  const directory = useDirectory();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  const signIn = async () => {
    if (!email.trim()) return;
    setBusy(true);
    try {
      await cloud.signIn(email.trim());
      setSent(true);
    } finally {
      setBusy(false);
    }
  };

  if (!cloud.configured) {
    return (
      <section className="mb-6 rounded-lg border bg-muted/30 p-4">
        <h3 className="font-semibold">{t("cloud.title")}</h3>
        <p className="mt-1 text-sm text-muted-foreground">{t("cloud.unconfigured")}</p>
      </section>
    );
  }

  return (
    <section className="mb-6 rounded-lg border bg-muted/30 p-4">
      <div className="flex flex-col gap-3">
        <div>
          <h3 className="font-semibold">{t("cloud.title")}</h3>
          <p className="mt-1 text-sm text-muted-foreground">
            {directory.cloudName
              ? t("cloud.syncedAs", { email: directory.cloudName })
              : t("cloud.subtitle")}
          </p>
        </div>

        {!cloud.session ? (
          <div className="flex flex-col gap-2 sm:flex-row">
            <Input
              type="email"
              value={email}
              placeholder={t("cloud.email")}
              onChange={(e) => setEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void signIn()}
            />
            <Button disabled={busy || !email.trim()} onClick={() => void signIn()}>
              {busy ? t("cloud.sending") : t("cloud.signIn")}
            </Button>
          </div>
        ) : (
          <div className="flex gap-2 items-center flex-wrap">
            <Button variant="outline" onClick={() => void cloud.signOut()}>
              {t("cloud.signOut")}
            </Button>
          </div>
        )}

        {sent && <p className="text-sm text-muted-foreground">{t("cloud.linkSent")}</p>}
        {cloud.error && <p className="text-sm text-destructive">{cloud.error}</p>}
        {directory.syncError && <p className="text-sm text-destructive">{directory.syncError}</p>}
        <p className="text-xs text-muted-foreground">
          {t("cloud.status", { status: t(`cloud.sync.${directory.syncStatus}`) })}
        </p>
      </div>
    </section>
  );
}
