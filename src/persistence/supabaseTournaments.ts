// Cloud tournament CRUD over Supabase (issue #9).
// Signed-in users' tournaments are stored in public.tournaments with owner_id = auth.uid().
// Co-editor rows in public.tournament_editors give others read+edit access.
// Optimistic concurrency: every save sends the `updatedAt` it last saw; if the server row has
// a newer updated_at the save is rejected and the caller must prompt the user to reload.

import type { SchedulerSupabaseClient } from "./supabaseClient.ts";
import type { TournamentStatus } from "./db.ts";
import type { Tournament } from "../model/tournament.ts";

export interface CloudTournamentMeta {
  id: string;
  name: string;
  status: TournamentStatus;
  updatedAt: string;
  ownerId: string;
  isOwner: boolean;
}

export interface CloudStoredTournament extends CloudTournamentMeta {
  tournament: Tournament;
}

export interface CloudEditorRecord {
  tournamentId: string;
  invitedEmail: string;
  editorUserId: string | null;
}

export type SaveResult =
  | { ok: true; updatedAt: string }
  | { ok: false; reason: "conflict" | "error"; message: string };

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function listCloudTournaments(
  client: SchedulerSupabaseClient,
): Promise<CloudTournamentMeta[]> {
  const userId = (await client.auth.getUser()).data.user?.id;
  const { data, error } = await client
    .from("tournaments")
    .select("id,name,status,updated_at,owner_id")
    .order("updated_at", { ascending: false });
  throwIfError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    status: (row.status ?? "active") as TournamentStatus,
    updatedAt: row.updated_at,
    ownerId: row.owner_id,
    isOwner: row.owner_id === userId,
  }));
}

export async function loadCloudTournament(
  client: SchedulerSupabaseClient,
  id: string,
): Promise<CloudStoredTournament | null> {
  const userId = (await client.auth.getUser()).data.user?.id;
  const { data, error } = await client
    .from("tournaments")
    .select("id,name,status,updated_at,owner_id,data")
    .eq("id", id)
    .single();
  if (error) {
    if (error.code === "PGRST116") return null; // not found
    throw new Error(error.message);
  }
  return {
    id: data.id,
    name: data.name,
    status: (data.status ?? "active") as TournamentStatus,
    updatedAt: data.updated_at,
    ownerId: data.owner_id,
    isOwner: data.owner_id === userId,
    tournament: data.data as Tournament,
  };
}

export async function saveCloudTournament(
  client: SchedulerSupabaseClient,
  rec: { id: string; name: string; tournament: Tournament; lastKnownUpdatedAt: string | null },
  ownerId: string,
): Promise<SaveResult> {
  const now = new Date().toISOString();

  if (rec.lastKnownUpdatedAt) {
    // Optimistic concurrency: check the row's updated_at before writing.
    const { data: existing } = await client
      .from("tournaments")
      .select("updated_at")
      .eq("id", rec.id)
      .single();
    if (existing && existing.updated_at !== rec.lastKnownUpdatedAt) {
      return {
        ok: false,
        reason: "conflict",
        message: "This tournament was modified elsewhere. Reload to get the latest version.",
      };
    }
  }

  const { error } = await client.from("tournaments").upsert(
    {
      id: rec.id,
      owner_id: ownerId,
      name: rec.name,
      status: "active",
      data: rec.tournament,
      updated_at: now,
    },
    { onConflict: "id" },
  );

  if (error) return { ok: false, reason: "error", message: error.message };
  return { ok: true, updatedAt: now };
}

export async function setCloudTournamentStatus(
  client: SchedulerSupabaseClient,
  id: string,
  status: TournamentStatus,
): Promise<void> {
  const { error } = await client
    .from("tournaments")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", id);
  throwIfError(error);
}

export async function deleteCloudTournament(
  client: SchedulerSupabaseClient,
  id: string,
): Promise<void> {
  const userId = (await client.auth.getUser()).data.user?.id;
  if (!userId) throw new Error("Not signed in");

  const { error: tombstoneError } = await client.from("tournament_tombstones").upsert(
    {
      tournament_id: id,
      owner_id: userId,
      deleted_at: new Date().toISOString(),
    },
    { onConflict: "tournament_id" },
  );
  throwIfError(tombstoneError);

  const { error } = await client.from("tournaments").delete().eq("id", id);
  throwIfError(error);
}

// ---- Sharing / editors ----

export async function listCloudEditors(
  client: SchedulerSupabaseClient,
  tournamentId: string,
): Promise<CloudEditorRecord[]> {
  const { data, error } = await client
    .from("tournament_editors")
    .select("tournament_id,invited_email,editor_user_id")
    .eq("tournament_id", tournamentId);
  throwIfError(error);
  return (data ?? []).map((row) => ({
    tournamentId: row.tournament_id,
    invitedEmail: row.invited_email,
    editorUserId: row.editor_user_id,
  }));
}

export async function addCloudEditor(
  client: SchedulerSupabaseClient,
  tournamentId: string,
  invitedEmail: string,
): Promise<void> {
  // Try to resolve the email to a user_id via profiles.
  const { data: profileData } = await client
    .from("profiles")
    .select("id")
    .eq("email", invitedEmail)
    .maybeSingle();
  const editorUserId = profileData?.id ?? null;
  const { error } = await client.from("tournament_editors").upsert(
    { tournament_id: tournamentId, invited_email: invitedEmail, editor_user_id: editorUserId },
    { onConflict: "tournament_id,invited_email" },
  );
  throwIfError(error);
}

export async function removeCloudEditor(
  client: SchedulerSupabaseClient,
  tournamentId: string,
  invitedEmail: string,
): Promise<void> {
  const { error } = await client
    .from("tournament_editors")
    .delete()
    .eq("tournament_id", tournamentId)
    .eq("invited_email", invitedEmail);
  throwIfError(error);
}

// ---- First-sign-in migration ----
// Uploads local tournaments that are not yet in the cloud. Returns the ids uploaded.
export async function migrateLocalTournamentsToCloud(
  client: SchedulerSupabaseClient,
  localTournaments: Array<{ id: string; name: string; tournament: Tournament }>,
  ownerId: string,
): Promise<string[]> {
  if (localTournaments.length === 0) return [];

  // Fetch ids that already exist in the cloud.
  const ids = localTournaments.map((t) => t.id);
  const { data: existing } = await client
    .from("tournaments")
    .select("id")
    .in("id", ids);
  const existingIds = new Set((existing ?? []).map((r: { id: string }) => r.id));

  const { data: deleted } = await client
    .from("tournament_tombstones")
    .select("tournament_id")
    .eq("owner_id", ownerId)
    .in("tournament_id", ids);
  const deletedIds = new Set(
    (deleted ?? []).map((r: { tournament_id: string }) => r.tournament_id),
  );

  const toUpload = localTournaments.filter(
    (t) => !existingIds.has(t.id) && !deletedIds.has(t.id),
  );
  if (toUpload.length === 0) return [];

  const now = new Date().toISOString();
  const rows = toUpload.map((t) => ({
    id: t.id,
    owner_id: ownerId,
    name: t.name,
    status: "active",
    data: t.tournament,
    updated_at: now,
  }));

  const { error } = await client.from("tournaments").insert(rows);
  throwIfError(error);
  return toUpload.map((t) => t.id);
}
