export const MEDIA_TYPES = ["ANIME", "MANGA"] as const;
export type MediaType = (typeof MEDIA_TYPES)[number];

export const LIST_STATUSES = [
  "CURRENT",
  "PLANNING",
  "COMPLETED",
  "DROPPED",
  "PAUSED",
  "REPEATING",
] as const;
export type ListStatus = (typeof LIST_STATUSES)[number];

export const SEARCH_KINDS = ["anime", "manga", "character", "staff", "user"] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

export type TokenSource = "flag" | "env" | "config" | "none";

export interface ConfigFile {
  token?: string;
  updatedAt?: string;
}

export interface RequestMeta {
  rateLimit?: number;
  rateRemaining?: number;
  retryAfter?: number;
}

export interface CliContext {
  json: boolean;
  dryRun: boolean;
  tokenFlag?: string;
}

export interface ResolvedMedia {
  id: number;
  type: MediaType;
  title: string;
  siteUrl?: string | null;
  source: "id" | "url" | "title";
}
