import type {
  AiringScheduleItem,
  DiscoverMediaItem,
  MediaAiringCountdown,
  MediaListEntry,
  MediaRecommendation,
  MediaRelationEdge,
  SearchCharacterItem,
  SearchMediaItem,
  SearchStaffItem,
  SearchUserItem,
  SocialUser,
  UserProfile,
  Viewer,
} from "./anilist.js";
import { pickTitle } from "./resolver.js";

export interface AiringMineItem {
  mediaId: number;
  title: string;
  progress: number;
  totalEpisodes?: number | null;
  nextEpisode?: number | null;
  nextAiringAt?: number | null;
  relativeCountdown: string;
  siteUrl?: string | null;
}

export interface MineSummaryPayload {
  user: string;
  anime: {
    total: number;
    current: number;
    planning: number;
    completed: number;
    paused: number;
    dropped: number;
    repeating: number;
  };
  manga: {
    total: number;
    current: number;
    planning: number;
    completed: number;
    paused: number;
    dropped: number;
    repeating: number;
  };
  currentAiring: AiringMineItem[];
}

export function printJson(value: unknown) {
  console.log(JSON.stringify(value, null, 2));
}

export function printSearchMedia(items: SearchMediaItem[]) {
  if (!items.length) {
    console.log("No media found.");
    return;
  }
  for (const item of items) {
    const title = pickTitle(item.title);
    const progressTotal = item.type === "ANIME" ? item.episodes : item.chapters;
    const suffix = progressTotal ? ` • total ${progressTotal}` : "";
    console.log(`#${item.id} ${title} (${item.type})${suffix}`);
    if (item.siteUrl) {
      console.log(`  ${item.siteUrl}`);
    }
  }
}

export function printSearchCharacter(items: SearchCharacterItem[]) {
  if (!items.length) {
    console.log("No characters found.");
    return;
  }
  for (const item of items) {
    console.log(`#${item.id} ${item.name.full ?? item.name.native ?? "Unknown"}`);
    if (item.siteUrl) {
      console.log(`  ${item.siteUrl}`);
    }
  }
}

export function printSearchStaff(items: SearchStaffItem[]) {
  if (!items.length) {
    console.log("No staff found.");
    return;
  }
  for (const item of items) {
    console.log(`#${item.id} ${item.name.full ?? item.name.native ?? "Unknown"}`);
    if (item.siteUrl) {
      console.log(`  ${item.siteUrl}`);
    }
  }
}

export function printSearchUser(items: SearchUserItem[]) {
  if (!items.length) {
    console.log("No users found.");
    return;
  }
  for (const item of items) {
    console.log(`#${item.id} ${item.name}`);
    if (item.siteUrl) {
      console.log(`  ${item.siteUrl}`);
    }
  }
}

export function printWhoAmI(viewer: Viewer) {
  console.log(`${viewer.name} (#${viewer.id})`);
  if (viewer.siteUrl) {
    console.log(viewer.siteUrl);
  }
}

export function printProfile(user: UserProfile) {
  console.log(`${user.name} (#${user.id})`);
  if (user.siteUrl) {
    console.log(user.siteUrl);
  }
  const anime = user.statistics?.anime;
  if (anime) {
    console.log(`Anime: ${anime.count ?? 0} entries • mean score ${anime.meanScore ?? "n/a"} • episodes ${anime.episodesWatched ?? 0}`);
    printStatusSummary(anime.statuses);
  }
  const manga = user.statistics?.manga;
  if (manga) {
    console.log(`Manga: ${manga.count ?? 0} entries • mean score ${manga.meanScore ?? "n/a"} • chapters ${manga.chaptersRead ?? 0}`);
    printStatusSummary(manga.statuses);
  }
}

export function printSocial(kind: string, ownerName: string, users: SocialUser[]) {
  console.log(`${ownerName} ${kind}: ${users.length}`);
  for (const user of users) {
    console.log(`- ${user.name} (#${user.id})${user.siteUrl ? ` • ${user.siteUrl}` : ""}`);
  }
}

export function printListCollection(
  ownerName: string,
  lists: Array<{ name: string; status?: string | null; isCustomList?: boolean | null; entries: MediaListEntry[] }>,
  opts: { customList?: string; limit?: number },
) {
  const selected = opts.customList
    ? lists.filter((list) => list.name.toLowerCase() === opts.customList?.toLowerCase())
    : lists;

  if (!selected.length) {
    console.log("No matching list groups found.");
    return;
  }

  console.log(`${ownerName} lists`);
  let shown = 0;
  for (const list of selected) {
    if (!list.entries.length) continue;
    console.log(`\n[${list.name}] ${list.entries.length}`);
    for (const entry of list.entries) {
      if (opts.limit && shown >= opts.limit) {
        console.log("\nReached --limit.");
        return;
      }
      const title = pickTitle(entry.media?.title ?? {});
      const progress = formatProgress(entry);
      console.log(`- ${title} (#${entry.media?.id ?? "?"}) ${entry.status ?? ""}${progress}`.trim());
      shown += 1;
    }
  }
}

export function printSavedEntry(entry: MediaListEntry, action: string) {
  const title = pickTitle(entry.media?.title ?? {});
  console.log(`${action}: ${title} (#${entry.media?.id ?? "?"})`);
  console.log(`Status: ${entry.status ?? "n/a"}`);
  if (typeof entry.progress === "number") {
    console.log(`Progress: ${entry.progress}`);
  }
  if (typeof entry.progressVolumes === "number") {
    console.log(`Volumes: ${entry.progressVolumes}`);
  }
  if (entry.media?.siteUrl) {
    console.log(entry.media.siteUrl);
  }
}

export function printDiscoverMedia(items: DiscoverMediaItem[], header: string) {
  console.log(header);
  if (!items.length) {
    console.log("No results.");
    return;
  }

  for (const item of items) {
    const title = pickTitle(item.title);
    const score = typeof item.averageScore === "number" ? `score ${item.averageScore}` : "score n/a";
    const pops = typeof item.popularity === "number" ? `pop ${item.popularity}` : "pop n/a";
    const eps = typeof item.episodes === "number" ? `eps ${item.episodes}` : "eps ?";
    const next = item.nextAiringEpisode ? ` • ep ${item.nextAiringEpisode.episode} in ${formatCountdown(item.nextAiringEpisode.timeUntilAiring)}` : "";
    console.log(`#${item.id} ${title} (${item.format ?? item.type}) • ${score} • ${pops} • ${eps}${next}`);
    if (item.siteUrl) {
      console.log(`  ${item.siteUrl}`);
    }
  }
}

export function printAiringSchedule(items: AiringScheduleItem[]) {
  if (!items.length) {
    console.log("No upcoming episodes in the selected window.");
    return;
  }

  for (const item of items) {
    const media = item.media;
    const title = pickTitle(media?.title ?? {});
    const at = formatTimestamp(item.airingAt);
    const countdown = formatCountdown(item.timeUntilAiring);
    console.log(`${at} • in ${countdown} • ${title} ep ${item.episode} (#${media?.id ?? "?"})`);
    if (media?.siteUrl) {
      console.log(`  ${media.siteUrl}`);
    }
  }
}

export function printAiringCountdown(media: MediaAiringCountdown) {
  const title = pickTitle(media.title);
  console.log(`${title} (#${media.id})`);

  if (!media.nextAiringEpisode) {
    console.log("No next airing episode available.");
    if (media.siteUrl) {
      console.log(media.siteUrl);
    }
    return;
  }

  const next = media.nextAiringEpisode;
  console.log(`Next: episode ${next.episode}`);
  console.log(`Airs: ${formatTimestamp(next.airingAt)} (in ${formatCountdown(next.timeUntilAiring)})`);
  if (media.siteUrl) {
    console.log(media.siteUrl);
  }
}

export function printAiringMine(items: AiringMineItem[]) {
  if (!items.length) {
    console.log("No CURRENT anime found for the selected filter.");
    return;
  }

  for (const item of items) {
    const progressSuffix = typeof item.totalEpisodes === "number" ? `/${item.totalEpisodes}` : "";
    const nextEpisode = typeof item.nextEpisode === "number" ? `ep ${item.nextEpisode}` : "n/a";
    const nextAt = typeof item.nextAiringAt === "number" ? formatTimestamp(item.nextAiringAt) : "n/a";
    console.log(
      `#${item.mediaId} ${item.title} • progress ${item.progress}${progressSuffix} • next ${nextEpisode} • ${nextAt} (${item.relativeCountdown})`,
    );
    if (item.siteUrl) {
      console.log(`  ${item.siteUrl}`);
    }
  }
}

export function printMineSummary(payload: MineSummaryPayload) {
  console.log(`User: ${payload.user}`);
  console.log(
    `Anime: total ${payload.anime.total} • CURRENT ${payload.anime.current} • PLANNING ${payload.anime.planning} • COMPLETED ${payload.anime.completed} • PAUSED ${payload.anime.paused} • DROPPED ${payload.anime.dropped} • REPEATING ${payload.anime.repeating}`,
  );
  console.log(
    `Manga: total ${payload.manga.total} • CURRENT ${payload.manga.current} • PLANNING ${payload.manga.planning} • COMPLETED ${payload.manga.completed} • PAUSED ${payload.manga.paused} • DROPPED ${payload.manga.dropped} • REPEATING ${payload.manga.repeating}`,
  );
  console.log("\nCurrent anime: next airings");
  printAiringMine(payload.currentAiring);
}

export function printMediaRecommendations(seedTitle: string, recs: MediaRecommendation[]) {
  console.log(`Recommendations for ${seedTitle}`);
  if (!recs.length) {
    console.log("No recommendations found.");
    return;
  }

  for (const rec of recs) {
    const media = rec.mediaRecommendation;
    if (!media) continue;
    const title = pickTitle(media.title);
    const rating = typeof rec.rating === "number" ? rec.rating : "n/a";
    const season = media.season && media.seasonYear ? `${media.season} ${media.seasonYear}` : "unknown season";
    console.log(`#${media.id} ${title} (${media.format ?? media.type}) • rating ${rating} • ${season}`);
    if (media.siteUrl) {
      console.log(`  ${media.siteUrl}`);
    }
  }
}

export function printMediaRelations(seedTitle: string, edges: MediaRelationEdge[]) {
  console.log(`Relations for ${seedTitle}`);
  if (!edges.length) {
    console.log("No relations found.");
    return;
  }

  for (const edge of edges) {
    const node = edge.node;
    if (!node) continue;
    const title = pickTitle(node.title);
    console.log(`[${edge.relationType ?? "RELATED"}] #${node.id} ${title} (${node.format ?? node.type})`);
    if (node.siteUrl) {
      console.log(`  ${node.siteUrl}`);
    }
  }
}

function printStatusSummary(statuses: Array<{ status?: string | null; count?: number | null }> | null | undefined) {
  if (!statuses?.length) {
    return;
  }
  const line = statuses
    .filter((s) => s.status && s.count)
    .map((s) => `${s.status}:${s.count}`)
    .join(" • ");
  if (line) {
    console.log(`  ${line}`);
  }
}

function formatProgress(entry: MediaListEntry) {
  const media = entry.media;
  const progress = entry.progress;
  if (!media || typeof progress !== "number") {
    return "";
  }
  const total = media.type === "ANIME" ? media.episodes : media.chapters;
  const volumePart =
    media.type === "MANGA" && typeof entry.progressVolumes === "number"
      ? ` • volumes ${entry.progressVolumes}${media.volumes ? `/${media.volumes}` : ""}`
      : "";
  if (typeof total === "number") {
    return ` • progress ${progress}/${total}${volumePart}`;
  }
  return ` • progress ${progress}${volumePart}`;
}

function formatTimestamp(unixSeconds: number): string {
  return new Date(unixSeconds * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatCountdown(totalSeconds: number): string {
  const seconds = Math.max(0, totalSeconds);
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3_600);
  const minutes = Math.floor((seconds % 3_600) / 60);

  if (days > 0) {
    return `${days}d ${hours}h`;
  }
  if (hours > 0) {
    return `${hours}h ${minutes}m`;
  }
  return `${minutes}m`;
}
