import { ApiError } from "./errors.js";
import type { ListStatus, MediaType, RequestMeta } from "./types.js";

const API_URL = "https://graphql.anilist.co";
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export interface GraphqlOptions {
  token?: string;
  retries?: number;
  timeoutMs?: number;
}

interface GraphqlError {
  message?: string;
  status?: number;
  locations?: Array<{ line: number; column: number }>;
  path?: Array<string | number>;
}

interface GraphqlResponse<T> {
  data?: T;
  errors?: GraphqlError[];
}

export async function graphqlRequest<T>(
  query: string,
  variables: Record<string, unknown> = {},
  options: GraphqlOptions = {},
): Promise<{ data: T; meta: RequestMeta }> {
  const retries = options.retries ?? 2;
  const timeoutMs = options.timeoutMs ?? 20_000;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "application/json",
          ...(options.token ? { Authorization: `Bearer ${options.token}` } : {}),
        },
        body: JSON.stringify({ query, variables }),
        signal: controller.signal,
      });

      const meta: RequestMeta = {
        rateLimit: toInt(response.headers.get("x-ratelimit-limit")),
        rateRemaining: toInt(response.headers.get("x-ratelimit-remaining")),
        retryAfter: toInt(response.headers.get("retry-after")),
      };

      const payload = (await response.json()) as GraphqlResponse<T>;
      const payloadStatus = payload.errors?.[0]?.status;
      const status = response.status || payloadStatus;

      if ((!response.ok || payload.errors?.length) && status && RETRYABLE_STATUS.has(status) && attempt < retries) {
        const waitMs = backoff(attempt, meta.retryAfter);
        await sleep(waitMs);
        continue;
      }

      if (!response.ok || payload.errors?.length) {
        throw new ApiError(buildApiErrorMessage(payload.errors, response.status), response.status, payload.errors);
      }

      if (!payload.data) {
        throw new ApiError("AniList returned no data.", response.status, payload.errors);
      }

      return { data: payload.data, meta };
    } catch (error) {
      if (error instanceof ApiError) {
        throw error;
      }
      if (attempt < retries) {
        await sleep(backoff(attempt));
        continue;
      }
      throw new ApiError(
        error instanceof Error ? `Network error: ${error.message}` : "Network error calling AniList API.",
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  throw new ApiError("AniList request failed after retries.");
}

export interface SearchMediaItem {
  id: number;
  type: MediaType;
  format?: string | null;
  episodes?: number | null;
  chapters?: number | null;
  volumes?: number | null;
  seasonYear?: number | null;
  siteUrl?: string | null;
  title: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  };
}

export async function searchMedia(type: MediaType, queryText: string, limit = 5) {
  const query = `
    query SearchMedia($type: MediaType!, $search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        media(type: $type, search: $search, sort: SEARCH_MATCH) {
          id
          type
          format
          episodes
          chapters
          volumes
          seasonYear
          siteUrl
          title { romaji english native }
        }
      }
    }
  `;

  return graphqlRequest<{ Page: { media: SearchMediaItem[] } }>(query, {
    type,
    search: queryText,
    perPage: limit,
  });
}

export interface SearchCharacterItem {
  id: number;
  name: {
    full?: string | null;
    native?: string | null;
    alternative?: string[] | null;
  };
  siteUrl?: string | null;
}

export async function searchCharacter(queryText: string, limit = 5) {
  const query = `
    query SearchCharacter($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        characters(search: $search, sort: SEARCH_MATCH) {
          id
          name { full native alternative }
          siteUrl
        }
      }
    }
  `;
  return graphqlRequest<{ Page: { characters: SearchCharacterItem[] } }>(query, {
    search: queryText,
    perPage: limit,
  });
}

export interface SearchStaffItem {
  id: number;
  name: {
    full?: string | null;
    native?: string | null;
    alternative?: string[] | null;
  };
  siteUrl?: string | null;
}

export async function searchStaff(queryText: string, limit = 5) {
  const query = `
    query SearchStaff($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        staff(search: $search, sort: SEARCH_MATCH) {
          id
          name { full native alternative }
          siteUrl
        }
      }
    }
  `;
  return graphqlRequest<{ Page: { staff: SearchStaffItem[] } }>(query, {
    search: queryText,
    perPage: limit,
  });
}

export interface SearchUserItem {
  id: number;
  name: string;
  siteUrl?: string | null;
  avatar?: { large?: string | null } | null;
}

export async function searchUser(queryText: string, limit = 5) {
  const query = `
    query SearchUser($search: String!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        users(search: $search, sort: SEARCH_MATCH) {
          id
          name
          siteUrl
          avatar { large }
        }
      }
    }
  `;
  return graphqlRequest<{ Page: { users: SearchUserItem[] } }>(query, {
    search: queryText,
    perPage: limit,
  });
}

export interface Viewer {
  id: number;
  name: string;
  siteUrl?: string | null;
  avatar?: { large?: string | null } | null;
}

export async function getViewer(token: string) {
  const query = `
    query ViewerQuery {
      Viewer {
        id
        name
        siteUrl
        avatar { large }
      }
    }
  `;
  return graphqlRequest<{ Viewer: Viewer }>(query, {}, { token });
}

export interface UserProfile {
  id: number;
  name: string;
  siteUrl?: string | null;
  about?: string | null;
  avatar?: { large?: string | null } | null;
  statistics?: {
    anime?: {
      count?: number | null;
      meanScore?: number | null;
      minutesWatched?: number | null;
      episodesWatched?: number | null;
      statuses?: Array<{ status?: string | null; count?: number | null }> | null;
    } | null;
    manga?: {
      count?: number | null;
      meanScore?: number | null;
      chaptersRead?: number | null;
      volumesRead?: number | null;
      statuses?: Array<{ status?: string | null; count?: number | null }> | null;
    } | null;
  } | null;
}

export async function getProfile(opts: { token?: string; username?: string }) {
  const userFields = `
    id
    name
    siteUrl
    about
    avatar { large }
    statistics {
      anime {
        count
        meanScore
        minutesWatched
        episodesWatched
        statuses { status count }
      }
      manga {
        count
        meanScore
        chaptersRead
        volumesRead
        statuses { status count }
      }
    }
  `;

  if (opts.username) {
    const query = `
      query ProfileByName($name: String!) {
        User(name: $name) {
          ${userFields}
        }
      }
    `;
    const { data, meta } = await graphqlRequest<{ User: UserProfile | null }>(
      query,
      { name: opts.username },
      { token: opts.token },
    );

    if (!data.User) {
      throw new ApiError(`User not found: ${opts.username}`);
    }

    return {
      data: {
        user: data.User,
        viewer: null,
      },
      meta,
    };
  }

  const query = `
    query ProfileViewer {
      Viewer {
        ${userFields}
      }
    }
  `;

  const { data, meta } = await graphqlRequest<{ Viewer: UserProfile | null }>(query, {}, { token: opts.token });

  return {
    data: {
      user: data.Viewer,
      viewer: data.Viewer,
    },
    meta,
  };
}

export interface SocialUser {
  id: number;
  name: string;
  siteUrl?: string | null;
  avatar?: { medium?: string | null } | null;
}

export async function getSocialList(opts: {
  token?: string;
  username?: string;
  relation: "friends" | "followers" | "following";
  limit: number;
}) {
  const owner = await resolveUserIdentity(opts.username, opts.token);

  const followers =
    opts.relation === "followers" || opts.relation === "friends"
      ? await fetchUserRelation(owner.id, "followers", opts.limit, opts.relation === "friends" ? opts.limit * 4 : opts.limit, opts.token)
      : [];

  const following =
    opts.relation === "following" || opts.relation === "friends"
      ? await fetchUserRelation(owner.id, "following", opts.limit, opts.relation === "friends" ? opts.limit * 4 : opts.limit, opts.token)
      : [];

  const users =
    opts.relation === "followers"
      ? followers.slice(0, opts.limit)
      : opts.relation === "following"
        ? following.slice(0, opts.limit)
        : pickRelation({ followers, following }, "friends").slice(0, opts.limit);

  return {
    data: {
      user: owner,
      relation: opts.relation,
      users,
    },
    meta: {},
  };
}

export interface MediaListEntry {
  id: number;
  status?: string | null;
  progress?: number | null;
  progressVolumes?: number | null;
  score?: number | null;
  media?: {
    id: number;
    type: MediaType;
    episodes?: number | null;
    chapters?: number | null;
    volumes?: number | null;
    nextAiringEpisode?: {
      airingAt: number;
      timeUntilAiring: number;
      episode: number;
    } | null;
    siteUrl?: string | null;
    title: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    };
  } | null;
}

export async function getListCollection(opts: {
  token?: string;
  username?: string;
  type: MediaType;
  status?: ListStatus;
  statusIn?: ListStatus[];
  perChunk: number;
}) {
  const query = `
    query ListCollection(
      $userId: Int!
      $type: MediaType!
      $status: MediaListStatus
      $statusIn: [MediaListStatus]
      $perChunk: Int
    ) {
      MediaListCollection(
        userId: $userId
        type: $type
        status: $status
        status_in: $statusIn
        perChunk: $perChunk
      ) {
        user { id name }
        lists {
          name
          status
          isCustomList
          entries {
            id
            status
            progress
            progressVolumes
            score
            media {
              id
              type
              episodes
              chapters
              volumes
              nextAiringEpisode { airingAt timeUntilAiring episode }
              siteUrl
              title { romaji english native }
            }
          }
        }
      }
    }
  `;

  const user = await resolveUserIdentity(opts.username, opts.token);

  return graphqlRequest<{
    MediaListCollection: {
      user: { id: number; name: string };
      lists: Array<{
        name: string;
        status?: string | null;
        isCustomList?: boolean | null;
        entries: MediaListEntry[];
      }>;
    } | null;
  }>(
    query,
    {
      userId: user.id,
      type: opts.type,
      status: opts.status,
      statusIn: opts.statusIn?.length ? opts.statusIn : undefined,
      perChunk: opts.perChunk,
    },
    { token: opts.token },
  );
}

export async function getMediaById(id: number, type?: MediaType, token?: string) {
  const query = `
    query MediaById($id: Int!, $type: MediaType) {
      Media(id: $id, type: $type) {
        id
        type
        siteUrl
        episodes
        chapters
        volumes
        title { romaji english native }
        mediaListEntry {
          id
          status
          progress
          progressVolumes
        }
      }
    }
  `;

  return graphqlRequest<{
    Media: {
      id: number;
      type: MediaType;
      siteUrl?: string | null;
      episodes?: number | null;
      chapters?: number | null;
      volumes?: number | null;
      title: { romaji?: string | null; english?: string | null; native?: string | null };
      mediaListEntry?: {
        id: number;
        status?: string | null;
        progress?: number | null;
        progressVolumes?: number | null;
      } | null;
    } | null;
  }>(query, { id, type }, { token });
}

export type DiscoverSeason = "WINTER" | "SPRING" | "SUMMER" | "FALL";
export type DiscoverSort = "POPULARITY_DESC" | "SCORE_DESC" | "TRENDING_DESC";

export interface DiscoverMediaItem {
  id: number;
  type: MediaType;
  format?: string | null;
  season?: DiscoverSeason | null;
  seasonYear?: number | null;
  episodes?: number | null;
  status?: string | null;
  averageScore?: number | null;
  popularity?: number | null;
  genres?: string[] | null;
  siteUrl?: string | null;
  nextAiringEpisode?: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  } | null;
  title: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  };
}

export async function discoverSeasonalAnime(opts: {
  season: DiscoverSeason;
  year: number;
  limit: number;
  sort: DiscoverSort;
  genre?: string;
  format?: string;
  includeAdult?: boolean;
}) {
  const query = `
    query DiscoverSeasonal(
      $season: MediaSeason!
      $seasonYear: Int!
      $perPage: Int!
      $sort: [MediaSort]
      $genre: String
      $format: MediaFormat
      $isAdult: Boolean
    ) {
      Page(page: 1, perPage: $perPage) {
        media(
          type: ANIME
          season: $season
          seasonYear: $seasonYear
          sort: $sort
          genre: $genre
          format: $format
          isAdult: $isAdult
        ) {
          id
          type
          format
          season
          seasonYear
          episodes
          status
          averageScore
          popularity
          genres
          siteUrl
          nextAiringEpisode { airingAt timeUntilAiring episode }
          title { romaji english native }
        }
      }
    }
  `;

  return graphqlRequest<{ Page: { media: DiscoverMediaItem[] } }>(query, {
    season: opts.season,
    seasonYear: opts.year,
    perPage: opts.limit,
    sort: [opts.sort],
    genre: opts.genre,
    format: opts.format,
    isAdult: opts.includeAdult ? undefined : false,
  });
}

export function getNextSeasonReference(now = new Date()): { season: DiscoverSeason; year: number } {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  if (month <= 2) {
    return { season: "SPRING", year };
  }
  if (month <= 5) {
    return { season: "SUMMER", year };
  }
  if (month <= 8) {
    return { season: "FALL", year };
  }
  return { season: "WINTER", year: year + 1 };
}

export interface AiringScheduleItem {
  airingAt: number;
  episode: number;
  timeUntilAiring: number;
  media?: {
    id: number;
    siteUrl?: string | null;
    format?: string | null;
    title: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    };
  } | null;
}

export async function getAiringSchedule(opts: { fromUnix: number; toUnix: number; limit: number }) {
  const query = `
    query AiringSchedule($airingAfter: Int!, $airingBefore: Int!, $perPage: Int!) {
      Page(page: 1, perPage: $perPage) {
        airingSchedules(
          airingAt_greater: $airingAfter
          airingAt_lesser: $airingBefore
          sort: TIME
        ) {
          airingAt
          episode
          timeUntilAiring
          media {
            id
            format
            siteUrl
            title { romaji english native }
          }
        }
      }
    }
  `;

  return graphqlRequest<{ Page: { airingSchedules: AiringScheduleItem[] } }>(query, {
    airingAfter: opts.fromUnix,
    airingBefore: opts.toUnix,
    perPage: opts.limit,
  });
}

export interface MediaAiringCountdown {
  id: number;
  type: MediaType;
  siteUrl?: string | null;
  nextAiringEpisode?: {
    airingAt: number;
    timeUntilAiring: number;
    episode: number;
  } | null;
  title: {
    romaji?: string | null;
    english?: string | null;
    native?: string | null;
  };
}

export async function getMediaAiringCountdown(mediaId: number, token?: string) {
  const query = `
    query MediaAiringCountdown($id: Int!) {
      Media(id: $id) {
        id
        type
        siteUrl
        title { romaji english native }
        nextAiringEpisode { airingAt timeUntilAiring episode }
      }
    }
  `;

  return graphqlRequest<{ Media: MediaAiringCountdown | null }>(query, { id: mediaId }, { token });
}

export interface MediaRecommendation {
  rating?: number | null;
  mediaRecommendation?: {
    id: number;
    type: MediaType;
    format?: string | null;
    season?: DiscoverSeason | null;
    seasonYear?: number | null;
    siteUrl?: string | null;
    title: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    };
  } | null;
}

export async function getMediaRecommendations(mediaId: number, limit: number) {
  const query = `
    query MediaRecommendations($id: Int!, $perPage: Int!) {
      Media(id: $id) {
        id
        title { romaji english native }
        recommendations(sort: [RATING_DESC], perPage: $perPage) {
          nodes {
            rating
            mediaRecommendation {
              id
              type
              format
              season
              seasonYear
              siteUrl
              title { romaji english native }
            }
          }
        }
      }
    }
  `;

  return graphqlRequest<{
    Media: {
      id: number;
      title: { romaji?: string | null; english?: string | null; native?: string | null };
      recommendations?: {
        nodes?: MediaRecommendation[] | null;
      } | null;
    } | null;
  }>(query, { id: mediaId, perPage: limit });
}

export interface MediaRelationEdge {
  relationType?: string | null;
  node?: {
    id: number;
    type: MediaType;
    format?: string | null;
    status?: string | null;
    siteUrl?: string | null;
    title: {
      romaji?: string | null;
      english?: string | null;
      native?: string | null;
    };
  } | null;
}

export async function getMediaRelations(mediaId: number) {
  const query = `
    query MediaRelations($id: Int!) {
      Media(id: $id) {
        id
        title { romaji english native }
        relations {
          edges {
            relationType
            node {
              id
              type
              format
              status
              siteUrl
              title { romaji english native }
            }
          }
        }
      }
    }
  `;

  return graphqlRequest<{
    Media: {
      id: number;
      title: { romaji?: string | null; english?: string | null; native?: string | null };
      relations?: {
        edges?: MediaRelationEdge[] | null;
      } | null;
    } | null;
  }>(query, { id: mediaId });
}

export async function saveMediaListEntry(
  input: {
    id?: number;
    mediaId?: number;
    status?: ListStatus;
    progress?: number;
    progressVolumes?: number;
    customLists?: string[];
    private?: boolean;
  },
  token: string,
) {
  const query = `
    mutation SaveEntry(
      $id: Int
      $mediaId: Int
      $status: MediaListStatus
      $progress: Int
      $progressVolumes: Int
      $customLists: [String]
      $private: Boolean
    ) {
      SaveMediaListEntry(
        id: $id
        mediaId: $mediaId
        status: $status
        progress: $progress
        progressVolumes: $progressVolumes
        customLists: $customLists
        private: $private
      ) {
        id
        status
        progress
        progressVolumes
        media {
          id
          type
          episodes
          chapters
          volumes
          siteUrl
          title { romaji english native }
        }
      }
    }
  `;

  return graphqlRequest<{ SaveMediaListEntry: MediaListEntry }>(query, input as Record<string, unknown>, {
    token,
  });
}

async function fetchUserRelation(
  userId: number,
  relation: "followers" | "following",
  limit: number,
  scanCap: number,
  token?: string,
): Promise<SocialUser[]> {
  const relationField = relation === "followers" ? "followers" : "following";
  const query = `
    query SocialRelation($userId: Int!, $page: Int!, $perPage: Int!) {
      Page(page: $page, perPage: $perPage) {
        ${relationField}(userId: $userId) { id name siteUrl avatar { medium } }
      }
    }
  `;

  const results: SocialUser[] = [];
  let page = 1;
  const hardCap = Math.max(limit, Math.min(scanCap, 500));

  while (results.length < hardCap) {
    const perPage = Math.min(50, hardCap - results.length);
    if (perPage <= 0) break;

    const { data } = await graphqlRequest<{
      Page: { followers?: SocialUser[]; following?: SocialUser[] };
    }>(query, { userId, page, perPage }, { token });

    const chunk = relation === "followers" ? data.Page.followers ?? [] : data.Page.following ?? [];
    if (!chunk.length) {
      break;
    }

    results.push(...chunk);
    if (chunk.length < perPage) {
      break;
    }

    page += 1;
  }

  return dedupeUsers(results);
}

function dedupeUsers(users: SocialUser[]): SocialUser[] {
  const seen = new Set<number>();
  const result: SocialUser[] = [];
  for (const user of users) {
    if (seen.has(user.id)) continue;
    seen.add(user.id);
    result.push(user);
  }
  return result;
}

async function resolveUserIdentity(username: string | undefined, token?: string): Promise<{ id: number; name: string }> {
  if (username) {
    const query = `
      query ResolveUser($name: String!) {
        User(name: $name) { id name }
      }
    `;
    const { data } = await graphqlRequest<{ User: { id: number; name: string } | null }>(query, { name: username }, { token });
    if (!data.User) {
      throw new ApiError(`User not found: ${username}`);
    }
    return data.User;
  }

  if (!token) {
    throw new ApiError("Token required when username is omitted.");
  }

  const viewer = await getViewer(token);
  return { id: viewer.data.Viewer.id, name: viewer.data.Viewer.name };
}

function pickRelation(
  user: { followers: SocialUser[]; following: SocialUser[] },
  relation: "friends" | "followers" | "following",
): SocialUser[] {
  if (relation === "followers") return user.followers;
  if (relation === "following") return user.following;
  const followerIds = new Set(user.followers.map((item) => item.id));
  return user.following.filter((item) => followerIds.has(item.id));
}

function toInt(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function backoff(attempt: number, retryAfterSeconds?: number): number {
  if (retryAfterSeconds && retryAfterSeconds > 0) {
    return retryAfterSeconds * 1_000;
  }
  return Math.min(1_000 * 2 ** attempt, 8_000);
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function buildApiErrorMessage(errors: GraphqlError[] | undefined, status?: number): string {
  const first = errors?.[0];
  if (!first?.message) {
    return status ? `AniList API request failed with status ${status}.` : "AniList API request failed.";
  }
  if (first.status === 401 || /unauthorized/i.test(first.message)) {
    return "AniList authentication failed. Check your token and try again.";
  }
  if (first.status === 429 || /too many requests/i.test(first.message)) {
    return "AniList rate limit hit. Wait a minute and retry.";
  }
  return first.message;
}
