import type { SchedulerSupabaseClient } from "./supabaseClient.ts";
import type { DirectoryRecord } from "./directorySync.ts";

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

export async function loadCloudDirectory(
  client: SchedulerSupabaseClient,
): Promise<DirectoryRecord[]> {
  const { data, error } = await client
    .from("referees")
    .select("id,name,updated_at,deleted_at");
  throwIfError(error);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: row.name,
    updatedAt: row.updated_at,
    deletedAt: row.deleted_at,
  }));
}

export async function saveCloudDirectory(
  client: SchedulerSupabaseClient,
  rows: DirectoryRecord[],
): Promise<void> {
  if (rows.length === 0) return;
  const { error } = await client.from("referees").upsert(
    rows.map((row) => ({
      id: row.id,
      name: row.name,
      updated_at: row.updatedAt,
      deleted_at: row.deletedAt ?? null,
    })),
  );
  throwIfError(error);
}

export async function saveCloudReferee(
  client: SchedulerSupabaseClient,
  row: DirectoryRecord,
): Promise<void> {
  await saveCloudDirectory(client, [row]);
}
