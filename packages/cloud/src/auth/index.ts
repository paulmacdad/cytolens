/**
 * Cloud authentication — Supabase Auth wrapper.
 */
export interface CloudUser {
  id: string;
  email: string;
}

export interface AuthState {
  user: CloudUser | null;
  loading: boolean;
}
