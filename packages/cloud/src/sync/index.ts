/**
 * Cloud sync — experiment metadata sync over Supabase.
 * FCS event data never leaves the local machine.
 */
export interface SyncStatus {
  lastSynced: Date | null;
  pending: number;
  error: string | null;
}
