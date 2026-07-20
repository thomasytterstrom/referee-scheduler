import { createContext, useContext, useEffect, useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase, supabaseConfigured } from "../../persistence/supabaseClient.ts";
import type { SchedulerSupabaseClient } from "../../persistence/supabaseClient.ts";

export interface CloudDirectoryState {
  configured: boolean;
  client: SchedulerSupabaseClient | null;
  session: Session | null;
  loading: boolean;
  error: string | null;
  signIn(email: string): Promise<void>;
  signOut(): Promise<void>;
}

const CloudDirectoryCtx = createContext<CloudDirectoryState | null>(null);

export function CloudDirectoryProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) {
      setLoading(false);
      return;
    }

    let mounted = true;
    void supabase.auth.getSession().then(({ data, error: authError }) => {
      if (!mounted) return;
      if (authError) setError(authError.message);
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
    });

    return () => {
      mounted = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const state = useMemo<CloudDirectoryState>(() => {
    return {
      configured: supabaseConfigured,
      client: supabase,
      session,
      loading,
      error,
      async signIn(email) {
        if (!supabase) return;
        setError(null);
        const { error: signInError } = await supabase.auth.signInWithOtp({
          email,
          options: { emailRedirectTo: window.location.href },
        });
        if (signInError) {
          setError(signInError.message);
          throw new Error(signInError.message);
        }
      },
      async signOut() {
        if (!supabase) return;
        setError(null);
        const { error: signOutError } = await supabase.auth.signOut();
        if (signOutError) {
          setError(signOutError.message);
          throw new Error(signOutError.message);
        }
      },
    };
  }, [error, loading, session]);

  return <CloudDirectoryCtx.Provider value={state}>{children}</CloudDirectoryCtx.Provider>;
}

export function useCloudDirectory(): CloudDirectoryState {
  const state = useContext(CloudDirectoryCtx);
  if (!state) throw new Error("useCloudDirectory must be used within a CloudDirectoryProvider");
  return state;
}
