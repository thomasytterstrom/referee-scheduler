import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SchedulerSupabaseClient = SupabaseClient;

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase: SchedulerSupabaseClient | null = supabaseConfigured
  ? createClient(url, anonKey)
  : null;
