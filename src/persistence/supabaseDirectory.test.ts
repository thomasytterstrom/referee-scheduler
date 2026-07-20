import { describe, expect, test } from "vitest";
import type { SchedulerSupabaseClient } from "./supabaseClient.ts";
import { loadCloudDirectory, saveCloudDirectory } from "./supabaseDirectory.ts";

describe("supabaseDirectory adapter", () => {
  test("maps remote referee rows into directory records", async () => {
    const client = {
      from(table: string) {
        expect(table).toBe("referees");
        return {
          select(columns: string) {
            expect(columns).toBe("id,name,updated_at,deleted_at");
            return Promise.resolve({
              data: [
                {
                  id: "ref-1",
                  name: "Anna",
                  updated_at: "2026-01-01T10:00:00.000Z",
                  deleted_at: null,
                },
              ],
              error: null,
            });
          },
        };
      },
    } as unknown as SchedulerSupabaseClient;

    await expect(loadCloudDirectory(client)).resolves.toEqual([
      { id: "ref-1", name: "Anna", updatedAt: "2026-01-01T10:00:00.000Z", deletedAt: null },
    ]);
  });

  test("surfaces Supabase errors instead of swallowing them", async () => {
    const client = {
      from(table: string) {
        expect(table).toBe("referees");
        return {
          upsert(rows: unknown[]) {
            expect(rows).toHaveLength(1);
            return Promise.resolve({ data: null, error: { message: "RLS denied" } });
          },
        };
      },
    } as unknown as SchedulerSupabaseClient;

    await expect(
      saveCloudDirectory(client, [
        { id: "ref-1", name: "Anna", updatedAt: "2026-01-01T10:00:00.000Z", deletedAt: null },
      ]),
    ).rejects.toThrow("RLS denied");
  });
});
