// Tests for supabaseTournaments.ts — optimistic concurrency check + migration path.
// Uses a hand-rolled Supabase client mock (no network).

import { describe, expect, it, vi } from "vitest";
import type { Tournament } from "../model/tournament.ts";
import {
  deleteCloudTournament,
  migrateLocalTournamentsToCloud,
  saveCloudTournament,
} from "./supabaseTournaments.ts";

const emptyTournament = (): Tournament => ({ referees: [], courts: [], days: [] });

// Minimal mock builder — each method returns a chainable proxy that resolves with `response`.
function mockClient(overrides: Record<string, unknown> = {}) {
  const response = { data: null, error: null, ...overrides };

  const chain = {
    select: () => chain,
    insert: () => chain,
    upsert: () => chain,
    update: () => chain,
    delete: () => chain,
    eq: () => chain,
    in: () => chain,
    single: () => Promise.resolve(response),
    maybeSingle: () => Promise.resolve({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) => Promise.resolve(response).then(resolve),
  };

  const from = vi.fn(() => chain);
  const auth = {
    getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
  };

  return { from, auth } as unknown as import("./supabaseClient.ts").SchedulerSupabaseClient;
}

// ---- saveCloudTournament ----

describe("saveCloudTournament", () => {
  it("returns ok:true and an updatedAt when the row is new (no lastKnownUpdatedAt)", async () => {
    const client = mockClient();
    const result = await saveCloudTournament(
      client,
      { id: "t1", name: "Test", tournament: emptyTournament(), lastKnownUpdatedAt: null },
      "user-123",
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.updatedAt).toBeTruthy();
  });

  it("detects a conflict when updated_at has moved", async () => {
    // The 'existing' row has a different updated_at than what the client last saw.
    const existingUpdatedAt = "2024-01-02T00:00:00.000Z";
    const clientSawUpdatedAt = "2024-01-01T00:00:00.000Z";

    const chain = {
      select: () => chain,
      single: () => Promise.resolve({ data: { updated_at: existingUpdatedAt }, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      eq: () => chain,
      in: () => chain,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };

    const client = {
      from: vi.fn(() => chain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
      },
    } as unknown as import("./supabaseClient.ts").SchedulerSupabaseClient;

    const result = await saveCloudTournament(
      client,
      {
        id: "t1",
        name: "Test",
        tournament: emptyTournament(),
        lastKnownUpdatedAt: clientSawUpdatedAt,
      },
      "user-123",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("conflict");
  });

  it("proceeds without conflict check when lastKnownUpdatedAt matches", async () => {
    const sharedUpdatedAt = "2024-01-01T00:00:00.000Z";

    const chain = {
      select: () => chain,
      single: () => Promise.resolve({ data: { updated_at: sharedUpdatedAt }, error: null }),
      upsert: () => Promise.resolve({ data: null, error: null }),
      eq: () => chain,
      in: () => chain,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };

    const client = {
      from: vi.fn(() => chain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
      },
    } as unknown as import("./supabaseClient.ts").SchedulerSupabaseClient;

    const result = await saveCloudTournament(
      client,
      {
        id: "t1",
        name: "Test",
        tournament: emptyTournament(),
        lastKnownUpdatedAt: sharedUpdatedAt,
      },
      "user-123",
    );
    expect(result.ok).toBe(true);
  });

  it("returns ok:false with reason:'error' when upsert fails", async () => {
    const chain = {
      select: () => chain,
      single: () => Promise.resolve({ data: null, error: null }),
      upsert: () => Promise.resolve({ data: null, error: { message: "DB error" } }),
      eq: () => chain,
      in: () => chain,
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };

    const client = {
      from: vi.fn(() => chain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
      },
    } as unknown as import("./supabaseClient.ts").SchedulerSupabaseClient;

    const result = await saveCloudTournament(
      client,
      { id: "t1", name: "Test", tournament: emptyTournament(), lastKnownUpdatedAt: null },
      "user-123",
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("error");
      expect(result.message).toBe("DB error");
    }
  });
});

// ---- migrateLocalTournamentsToCloud ----

describe("migrateLocalTournamentsToCloud", () => {
  it("skips tournaments that already exist in the cloud", async () => {
    // Cloud already has t1.
    const chain = {
      select: () => chain,
      in: () => Promise.resolve({ data: [{ id: "t1" }], error: null }),
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      eq: () => chain,
      single: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };

    const client = {
      from: vi.fn(() => chain),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
      },
    } as unknown as import("./supabaseClient.ts").SchedulerSupabaseClient;

    const uploaded = await migrateLocalTournamentsToCloud(
      client,
      [
        { id: "t1", name: "Existing", tournament: emptyTournament() },
        { id: "t2", name: "New", tournament: emptyTournament() },
      ],
      "user-123",
    );

    // Only t2 should have been uploaded.
    expect(uploaded).toEqual(["t2"]);
  });

  it("returns empty array when there are no local tournaments", async () => {
    const client = mockClient();
    const uploaded = await migrateLocalTournamentsToCloud(client, [], "user-123");
    expect(uploaded).toEqual([]);
  });

  it("skips tournaments that were previously deleted in the cloud", async () => {
    const tables: string[] = [];
    const chain = {
      table: "",
      select: () => chain,
      in: () => {
        if (chain.table === "tournaments") return Promise.resolve({ data: [], error: null });
        if (chain.table === "tournament_tombstones") {
          return Promise.resolve({ data: [{ tournament_id: "t2" }], error: null });
        }
        return Promise.resolve({ data: [], error: null });
      },
      eq: () => chain,
      insert: vi.fn(() => Promise.resolve({ data: null, error: null })),
      single: () => Promise.resolve({ data: null, error: null }),
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({ data: null, error: null }).then(resolve),
    };

    const client = {
      from: vi.fn((table: string) => {
        tables.push(table);
        chain.table = table;
        return chain;
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
      },
    } as unknown as import("./supabaseClient.ts").SchedulerSupabaseClient;

    const uploaded = await migrateLocalTournamentsToCloud(
      client,
      [
        { id: "t1", name: "Keep", tournament: emptyTournament() },
        { id: "t2", name: "Deleted", tournament: emptyTournament() },
      ],
      "user-123",
    );

    expect(uploaded).toEqual(["t1"]);
    expect(chain.insert).toHaveBeenCalledTimes(1);
    const rows = chain.insert.mock.calls[0]?.[0] as Array<{ id: string }>;
    expect(rows.map((r) => r.id)).toEqual(["t1"]);
    expect(tables).toContain("tournament_tombstones");
  });
});

describe("deleteCloudTournament", () => {
  it("writes a tombstone and deletes by id", async () => {
    const tables: string[] = [];
    const eq = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const upsert = vi.fn(() => Promise.resolve({ data: null, error: null }));
    const chain = {
      table: "",
      delete: vi.fn(() => chain),
      upsert,
      eq,
    };
    const client = {
      from: vi.fn((table: string) => {
        tables.push(table);
        chain.table = table;
        return chain;
      }),
      auth: {
        getUser: vi.fn().mockResolvedValue({ data: { user: { id: "user-123" } }, error: null }),
      },
    } as unknown as import("./supabaseClient.ts").SchedulerSupabaseClient;

    await expect(deleteCloudTournament(client, "t1")).resolves.toBeUndefined();
    expect(tables).toEqual(["tournament_tombstones", "tournaments"]);
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(chain.delete).toHaveBeenCalledTimes(1);
    expect(eq).toHaveBeenCalledWith("id", "t1");
  });
});
