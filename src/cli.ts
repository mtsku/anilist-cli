#!/usr/bin/env node

import { Command } from "commander";
import { ZodError, z } from "zod";

import {
  discoverSeasonalAnime,
  getAiringSchedule,
  getListCollection,
  getMediaAiringCountdown,
  getMediaRecommendations,
  getMediaRelations,
  getNextSeasonReference,
  getProfile,
  getSocialList,
  getViewer,
  saveMediaListEntry,
  searchCharacter,
  searchMedia,
  searchStaff,
  searchUser,
  type DiscoverSeason,
  type DiscoverSort,
  type MediaListEntry,
} from "./anilist.js";
import { clearStoredToken, getConfigPath, requireToken, resolveToken, saveConfig } from "./config.js";
import { ApiError, AuthError, CliError, ValidationError } from "./errors.js";
import {
  printAiringMine,
  printAiringCountdown,
  printAiringSchedule,
  printDiscoverMedia,
  printJson,
  printListCollection,
  printMediaRecommendations,
  printMediaRelations,
  printProfile,
  printSavedEntry,
  printSearchCharacter,
  printSearchMedia,
  printSearchStaff,
  printSearchUser,
  printMineSummary,
  printSocial,
  printWhoAmI,
  type AiringMineItem,
  type MineSummaryPayload,
} from "./format.js";
import { pickTitle, resolveMediaInput } from "./resolver.js";
import type { CliContext, ListStatus, MediaType, SearchKind } from "./types.js";

const statusSchema = z.enum(["CURRENT", "PLANNING", "COMPLETED", "DROPPED", "PAUSED", "REPEATING"]);
const mediaTypeSchema = z.enum(["ANIME", "MANGA"]);
const intSchema = z.coerce.number().int().nonnegative();
const seasonSchema = z.enum(["WINTER", "SPRING", "SUMMER", "FALL"]);
const discoverSortSchema = z.enum(["POPULARITY_DESC", "SCORE_DESC", "TRENDING_DESC"]);
const mediaFormatSchema = z.enum(["TV", "TV_SHORT", "MOVIE", "SPECIAL", "OVA", "ONA", "MUSIC"]);

const program = new Command();

program
  .name("anilistcli")
  .description("Reliable AniList CLI (direct GraphQL)")
  .option("--json", "Output raw JSON")
  .option("--dry-run", "Preview mutation payload without writing")
  .option("--token <token>", "Use token directly (highest precedence)")
  .showSuggestionAfterError();

program
  .command("auth")
  .description("Manage AniList token")
  .addCommand(
    new Command("set-token")
      .argument("<token>", "AniList OAuth access token")
      .description("Save token in ~/.config/anilist-cli/config.json")
      .action((token: string, _options: Record<string, unknown>, command: Command) => {
        const ctx = getContext(command);
        const parsed = z.string().min(20).parse(token.trim());
        saveConfig({ token: parsed });
        output(ctx, {
          ok: true,
          source: "config",
          configPath: getConfigPath(),
          message: "Token saved.",
        });
      }),
  )
  .addCommand(
    new Command("clear-token")
      .description("Remove stored token from config file")
      .action((_options: Record<string, unknown>, command: Command) => {
        const ctx = getContext(command);
        clearStoredToken();
        output(ctx, { ok: true, message: "Stored token removed.", configPath: getConfigPath() });
      }),
  )
  .addCommand(
    new Command("where")
      .description("Show which token source will be used")
      .action((_options: Record<string, unknown>, command: Command) => {
        const ctx = getContext(command);
        const resolved = resolveToken(ctx.tokenFlag);
        output(ctx, {
          source: resolved.source,
          tokenPresent: Boolean(resolved.token),
          configPath: getConfigPath(),
          envVars: ["ANILIST_TOKEN", "ANILIST_ACCESS_TOKEN"],
        });
      }),
  );

program
  .command("whoami")
  .description("Inspect currently authorized AniList user")
  .action(async (_options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const auth = requireToken(ctx.tokenFlag);
    const { data } = await getViewer(auth.token);
    if (ctx.json) {
      printJson(data.Viewer);
      return;
    }
    printWhoAmI(data.Viewer);
  });

program
  .command("search")
  .description("Search anime/manga/character/staff/user")
  .argument("<kind>", "anime | manga | character | staff | user")
  .argument("<query>", "Search query")
  .option("-n, --limit <number>", "Results count (1-50)", "5")
  .action(async (kind: SearchKind, query: string, options: { limit?: string }, command: Command) => {
    const ctx = getContext(command);
    const parsedKind = z.enum(["anime", "manga", "character", "staff", "user"]).parse(kind);
    const limit = z.coerce.number().int().min(1).max(50).parse(options.limit ?? "5");

    if (parsedKind === "anime" || parsedKind === "manga") {
      const { data } = await searchMedia(parsedKind.toUpperCase() as MediaType, query, limit);
      if (ctx.json) return printJson(data.Page.media);
      return printSearchMedia(data.Page.media);
    }

    if (parsedKind === "character") {
      const { data } = await searchCharacter(query, limit);
      if (ctx.json) return printJson(data.Page.characters);
      return printSearchCharacter(data.Page.characters);
    }

    if (parsedKind === "staff") {
      const { data } = await searchStaff(query, limit);
      if (ctx.json) return printJson(data.Page.staff);
      return printSearchStaff(data.Page.staff);
    }

    const { data } = await searchUser(query, limit);
    if (ctx.json) return printJson(data.Page.users);
    return printSearchUser(data.Page.users);
  });

const discover = program.command("discover").description("Discover seasonal and upcoming anime");

discover
  .command("seasonal")
  .description("Discover anime for a season")
  .option("--season <season>", "WINTER | SPRING | SUMMER | FALL")
  .option("--year <year>", "Season year (default: current season year)")
  .option("-n, --limit <number>", "Results count (1-50)", "15")
  .option("--sort <sort>", "POPULARITY_DESC | SCORE_DESC | TRENDING_DESC", "POPULARITY_DESC")
  .option("--genre <genre>", "Optional genre filter, e.g. Action")
  .option("--format <format>", "TV | TV_SHORT | MOVIE | SPECIAL | OVA | ONA | MUSIC")
  .option("--include-adult", "Include adult titles")
  .action(
    async (
      options: {
        season?: string;
        year?: string;
        limit?: string;
        sort?: string;
        genre?: string;
        format?: string;
        includeAdult?: boolean;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const current = getCurrentSeasonReference();
      const season = parseSeason(options.season ?? current.season);
      const year = z.coerce.number().int().min(1960).max(3000).parse(options.year ?? `${current.year}`);
      const limit = z.coerce.number().int().min(1).max(50).parse(options.limit ?? "15");
      const sort = parseDiscoverSort(options.sort ?? "POPULARITY_DESC");
      const format = parseMediaFormat(options.format);

      const { data } = await discoverSeasonalAnime({
        season,
        year,
        limit,
        sort,
        genre: options.genre?.trim() || undefined,
        format,
        includeAdult: Boolean(options.includeAdult),
      });

      if (ctx.json) {
        return printJson({ season, year, results: data.Page.media });
      }

      printDiscoverMedia(data.Page.media, `Seasonal anime: ${season} ${year}`);
    },
  );

discover
  .command("upcoming")
  .description("Discover next-season anime")
  .option("-n, --limit <number>", "Results count (1-50)", "15")
  .option("--sort <sort>", "POPULARITY_DESC | SCORE_DESC | TRENDING_DESC", "POPULARITY_DESC")
  .option("--genre <genre>", "Optional genre filter, e.g. Action")
  .option("--format <format>", "TV | TV_SHORT | MOVIE | SPECIAL | OVA | ONA | MUSIC")
  .option("--include-adult", "Include adult titles")
  .action(
    async (
      options: {
        limit?: string;
        sort?: string;
        genre?: string;
        format?: string;
        includeAdult?: boolean;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const next = getNextSeasonReference();
      const limit = z.coerce.number().int().min(1).max(50).parse(options.limit ?? "15");
      const sort = parseDiscoverSort(options.sort ?? "POPULARITY_DESC");
      const format = parseMediaFormat(options.format);

      const { data } = await discoverSeasonalAnime({
        season: next.season,
        year: next.year,
        limit,
        sort,
        genre: options.genre?.trim() || undefined,
        format,
        includeAdult: Boolean(options.includeAdult),
      });

      if (ctx.json) {
        return printJson({ season: next.season, year: next.year, results: data.Page.media });
      }

      printDiscoverMedia(data.Page.media, `Upcoming anime: ${next.season} ${next.year}`);
    },
  );

const airing = program.command("airing").description("Airing schedule and countdown tools");

airing
  .command("upcoming")
  .description("Show episodes airing in the next N hours")
  .option("--hours <number>", "Hours ahead to scan", "24")
  .option("-n, --limit <number>", "Results count (1-50)", "20")
  .action(async (options: { hours?: string; limit?: string }, command: Command) => {
    const ctx = getContext(command);
    const hours = z.coerce.number().int().min(1).max(168).parse(options.hours ?? "24");
    const limit = z.coerce.number().int().min(1).max(50).parse(options.limit ?? "20");

    const fromUnix = Math.floor(Date.now() / 1000);
    const toUnix = fromUnix + hours * 3600;
    const { data } = await getAiringSchedule({ fromUnix, toUnix, limit });

    if (ctx.json) {
      return printJson({ fromUnix, toUnix, results: data.Page.airingSchedules });
    }

    printAiringSchedule(data.Page.airingSchedules);
  });

airing
  .command("next")
  .description("Show next airing countdown for a specific anime")
  .argument("<input>", "title | id | URL")
  .option("--type <type>", "anime | manga", "anime")
  .option("--id", "Treat input as media id")
  .action(
    async (
      input: string,
      options: { type?: string; id?: boolean },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const token = resolveToken(ctx.tokenFlag).token;
      const mediaType = parseMediaType(options.type ?? "anime");
      const resolved = await resolveMediaInput({
        input,
        type: mediaType,
        idMode: Boolean(options.id),
        token,
      });

      const { data } = await getMediaAiringCountdown(resolved.id, token);
      if (!data.Media) {
        throw new ValidationError("Media not found.");
      }

      if (ctx.json) {
        return printJson(data.Media);
      }

      printAiringCountdown(data.Media);
    },
  );

airing
  .command("mine")
  .description("Show CURRENT anime with next airing details")
  .option("-n, --limit <number>", "Results count", "50")
  .option("--hours <number>", "Only include titles airing within N hours")
  .action(async (options: { limit?: string; hours?: string }, command: Command) => {
    const ctx = getContext(command);
    const token = requireToken(ctx.tokenFlag).token;
    const limit = z.coerce.number().int().min(1).max(500).parse(options.limit ?? "50");
    const hours = options.hours ? z.coerce.number().int().min(1).max(720).parse(options.hours) : undefined;
    const nowUnix = Math.floor(Date.now() / 1000);
    const untilUnix = hours ? nowUnix + hours * 3600 : undefined;

    const { data } = await getListCollection({
      token,
      type: "ANIME",
      status: "CURRENT",
      perChunk: 500,
    });

    if (!data.MediaListCollection) {
      throw new ValidationError("CURRENT anime list not found.");
    }

    const items = buildAiringMineItems(data.MediaListCollection.lists, nowUnix, untilUnix).slice(0, limit);

    if (ctx.json) {
      return printJson({
        user: data.MediaListCollection.user.name,
        generatedAt: new Date().toISOString(),
        total: items.length,
        hours: hours ?? null,
        items,
      });
    }

    printAiringMine(items);
  });

const media = program.command("media").description("Media relationship tools");

media
  .command("recs")
  .description("Show recommendations for an anime/manga")
  .argument("<input>", "title | id | URL")
  .option("--type <type>", "anime | manga", "anime")
  .option("--id", "Treat input as media id")
  .option("-n, --limit <number>", "Results count (1-25)", "10")
  .action(
    async (
      input: string,
      options: { type?: string; id?: boolean; limit?: string },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const token = resolveToken(ctx.tokenFlag).token;
      const mediaType = parseMediaType(options.type ?? "anime");
      const limit = z.coerce.number().int().min(1).max(25).parse(options.limit ?? "10");

      const resolved = await resolveMediaInput({
        input,
        type: mediaType,
        idMode: Boolean(options.id),
        token,
      });

      const { data } = await getMediaRecommendations(resolved.id, limit);
      if (!data.Media) {
        throw new ValidationError("Media not found.");
      }

      const recommendations = (data.Media.recommendations?.nodes ?? []).filter(
        (item): item is NonNullable<typeof item> => Boolean(item?.mediaRecommendation),
      );

      if (ctx.json) {
        return printJson({
          mediaId: resolved.id,
          title: pickTitle(data.Media.title),
          recommendations,
        });
      }

      printMediaRecommendations(pickTitle(data.Media.title), recommendations);
    },
  );

media
  .command("relations")
  .description("Show relation graph edges for an anime/manga")
  .argument("<input>", "title | id | URL")
  .option("--type <type>", "anime | manga", "anime")
  .option("--id", "Treat input as media id")
  .action(
    async (
      input: string,
      options: { type?: string; id?: boolean },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const token = resolveToken(ctx.tokenFlag).token;
      const mediaType = parseMediaType(options.type ?? "anime");
      const resolved = await resolveMediaInput({
        input,
        type: mediaType,
        idMode: Boolean(options.id),
        token,
      });

      const { data } = await getMediaRelations(resolved.id);
      if (!data.Media) {
        throw new ValidationError("Media not found.");
      }

      const edges = (data.Media.relations?.edges ?? []).filter((edge): edge is NonNullable<typeof edge> => Boolean(edge?.node));

      if (ctx.json) {
        return printJson({
          mediaId: resolved.id,
          title: pickTitle(data.Media.title),
          relations: edges,
        });
      }

      printMediaRelations(pickTitle(data.Media.title), edges);
    },
  );

const planning = program.command("planning").alias("watchlater").description("Plan/watch-later list actions");

planning
  .command("add")
  .description("Add anime/manga to PLANNING from title, id, AniList URL, or X/Twitter URL")
  .argument("<input>", "title | id | URL")
  .option("--type <type>", "anime | manga (used for title lookup)", "anime")
  .option("--id", "Treat input as media id")
  .option("--custom-list <name>", "Optional custom list name(s), comma separated")
  .option("--private", "Set entry private")
  .action(
    async (
      input: string,
      options: { type?: string; id?: boolean; customList?: string; private?: boolean },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const token = resolveToken(ctx.tokenFlag).token;
      const authToken = ctx.dryRun ? token : requireToken(ctx.tokenFlag).token;

      const type = parseMediaType(options.type ?? "anime");
      const resolved = await resolveMediaInput({
        input,
        type,
        idMode: Boolean(options.id),
        token,
      });

      const customLists = parseCsvList(options.customList);
      const payload = {
        mediaId: resolved.id,
        status: "PLANNING" as ListStatus,
        ...(customLists.length ? { customLists } : {}),
        ...(options.private ? { private: true } : {}),
      };

      if (ctx.dryRun) {
        return output(ctx, {
          dryRun: true,
          action: "SaveMediaListEntry",
          resolved,
          payload,
        });
      }

      if (!authToken) {
        throw new AuthError("AniList token is required for writing list entries.");
      }

      const { data } = await saveMediaListEntry(payload, authToken);
      if (ctx.json) return printJson(data.SaveMediaListEntry);
      printSavedEntry(data.SaveMediaListEntry, "Added to planning");
    },
  );

const list = program.command("list").description("View AniList entries");

list
  .command("view")
  .description("View list entries by type/status/custom list")
  .option("--user <username>", "Target user (default: authenticated user)")
  .option("--type <type>", "anime | manga", "anime")
  .option("--status <status>", "Single status filter")
  .option("--status-in <statuses>", "Comma-separated statuses")
  .option("--custom-list <name>", "Filter to exact custom list name")
  .option("--limit <number>", "Max entries printed", "100")
  .option("--per-chunk <number>", "Chunk size from API (1-500)", "500")
  .action(
    async (
      options: {
        user?: string;
        type?: string;
        status?: string;
        statusIn?: string;
        customList?: string;
        limit?: string;
        perChunk?: string;
      },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const username = options.user;
      const token = username ? resolveToken(ctx.tokenFlag).token : requireToken(ctx.tokenFlag).token;

      const type = parseMediaType(options.type ?? "anime");
      const status = options.status ? parseStatus(options.status) : undefined;
      const statusIn = parseStatuses(options.statusIn);
      const perChunk = z.coerce.number().int().min(1).max(500).parse(options.perChunk ?? "500");
      const limit = z.coerce.number().int().min(1).parse(options.limit ?? "100");

      const { data } = await getListCollection({
        token,
        username,
        type,
        status,
        statusIn,
        perChunk,
      });

      if (!data.MediaListCollection) {
        throw new ValidationError("List collection not found. Check username and list visibility.");
      }

      if (ctx.json) {
        return printJson(data.MediaListCollection);
      }

      printListCollection(data.MediaListCollection.user.name, data.MediaListCollection.lists, {
        customList: options.customList,
        limit,
      });
    },
  );

const mine = program.command("mine").description("Bundled self-service views");

mine
  .command("summary")
  .description("One-call summary of your anime/manga lists + next current airings")
  .option("-n, --limit <number>", "Current-airing rows to include", "8")
  .option("--hours <number>", "Only include current titles airing within N hours")
  .action(async (options: { limit?: string; hours?: string }, command: Command) => {
    const ctx = getContext(command);
    const token = requireToken(ctx.tokenFlag).token;
    const limit = z.coerce.number().int().min(1).max(100).parse(options.limit ?? "8");
    const hours = options.hours ? z.coerce.number().int().min(1).max(720).parse(options.hours) : undefined;
    const nowUnix = Math.floor(Date.now() / 1000);
    const untilUnix = hours ? nowUnix + hours * 3600 : undefined;

    const [animeCollection, mangaCollection] = await Promise.all([
      getListCollection({ token, type: "ANIME", perChunk: 500 }),
      getListCollection({ token, type: "MANGA", perChunk: 500 }),
    ]);

    if (!animeCollection.data.MediaListCollection || !mangaCollection.data.MediaListCollection) {
      throw new ValidationError("Unable to load your list summary.");
    }

    const animeEntries = flattenEntries(animeCollection.data.MediaListCollection.lists);
    const mangaEntries = flattenEntries(mangaCollection.data.MediaListCollection.lists);
    const currentAiring = buildAiringMineItems(animeCollection.data.MediaListCollection.lists, nowUnix, untilUnix).slice(0, limit);

    const payload: MineSummaryPayload = {
      user: animeCollection.data.MediaListCollection.user.name,
      anime: summarizeStatusCounts(animeEntries),
      manga: summarizeStatusCounts(mangaEntries),
      currentAiring,
    };

    if (ctx.json) {
      return printJson({
        generatedAt: new Date().toISOString(),
        hours: hours ?? null,
        ...payload,
      });
    }

    printMineSummary(payload);
  });

const status = program.command("status").description("Update entry status");

status
  .command("set")
  .description("Set list status for media")
  .argument("<input>", "title | id | URL")
  .argument("<status>", "PLANNING | CURRENT | PAUSED | COMPLETED | DROPPED | REPEATING")
  .option("--type <type>", "anime | manga", "anime")
  .option("--id", "Treat input as media id")
  .action(
    async (
      input: string,
      nextStatus: string,
      options: { type?: string; id?: boolean },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const token = resolveToken(ctx.tokenFlag).token;
      const authToken = ctx.dryRun ? token : requireToken(ctx.tokenFlag).token;

      const mediaType = parseMediaType(options.type ?? "anime");
      const resolved = await resolveMediaInput({
        input,
        type: mediaType,
        idMode: Boolean(options.id),
        token,
      });

      const statusValue = parseStatus(nextStatus);
      const payload = { mediaId: resolved.id, status: statusValue };

      if (ctx.dryRun) {
        return output(ctx, { dryRun: true, action: "SaveMediaListEntry", resolved, payload });
      }

      if (!authToken) {
        throw new AuthError("AniList token is required for writing list entries.");
      }

      const { data } = await saveMediaListEntry(payload, authToken);
      if (ctx.json) return printJson(data.SaveMediaListEntry);
      printSavedEntry(data.SaveMediaListEntry, "Status updated");
    },
  );

const progress = program.command("progress").description("Update progress");

progress
  .command("set")
  .description("Set watched/read progress")
  .argument("<input>", "title | id | URL")
  .argument("<progress>", "Episodes/chapters consumed")
  .option("--type <type>", "anime | manga", "anime")
  .option("--id", "Treat input as media id")
  .option("--volumes <number>", "Manga volumes read")
  .action(
    async (
      input: string,
      progressRaw: string,
      options: { type?: string; id?: boolean; volumes?: string },
      command: Command,
    ) => {
      const ctx = getContext(command);
      const token = resolveToken(ctx.tokenFlag).token;
      const authToken = ctx.dryRun ? token : requireToken(ctx.tokenFlag).token;

      const mediaType = parseMediaType(options.type ?? "anime");
      const resolved = await resolveMediaInput({
        input,
        type: mediaType,
        idMode: Boolean(options.id),
        token,
      });

      const progressValue = intSchema.parse(progressRaw);
      const volumesRaw = options.volumes;
      const payload = {
        mediaId: resolved.id,
        progress: progressValue,
        ...(volumesRaw ? { progressVolumes: intSchema.parse(volumesRaw) } : {}),
      };

      if (ctx.dryRun) {
        return output(ctx, { dryRun: true, action: "SaveMediaListEntry", resolved, payload });
      }

      if (!authToken) {
        throw new AuthError("AniList token is required for writing list entries.");
      }

      const { data } = await saveMediaListEntry(payload, authToken);
      if (ctx.json) return printJson(data.SaveMediaListEntry);
      printSavedEntry(data.SaveMediaListEntry, "Progress updated");
    },
  );

program
  .command("profile")
  .description("View profile for self or another user")
  .argument("[username]", "AniList username")
  .action(async (username: string | undefined, _options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const token = username ? resolveToken(ctx.tokenFlag).token : requireToken(ctx.tokenFlag).token;
    const { data } = await getProfile({ token, username });

    if (!data.user) {
      throw new ValidationError("Profile not found.");
    }

    if (ctx.json) {
      return printJson(data.user);
    }
    printProfile(data.user);
  });

program
  .command("user")
  .description("View another user profile + list summary")
  .argument("<username>", "AniList username")
  .action(async (username: string, _options: Record<string, unknown>, command: Command) => {
    const ctx = getContext(command);
    const token = resolveToken(ctx.tokenFlag).token;
    const profile = await getProfile({ token, username });
    if (!profile.data.user) {
      throw new ValidationError("User not found.");
    }

    const animeLists = await getListCollection({ token, username, type: "ANIME", perChunk: 100 });
    const mangaLists = await getListCollection({ token, username, type: "MANGA", perChunk: 100 });

    const payload = {
      profile: profile.data.user,
      animeSummary: summarizeLists(animeLists.data.MediaListCollection?.lists ?? []),
      mangaSummary: summarizeLists(mangaLists.data.MediaListCollection?.lists ?? []),
    };

    if (ctx.json) return printJson(payload);

    printProfile(profile.data.user);
    console.log("\nAnime list summary:");
    printSummary(payload.animeSummary);
    console.log("\nManga list summary:");
    printSummary(payload.mangaSummary);
  });

addSocialCommand("friends");
addSocialCommand("followers");
addSocialCommand("following");

program.parseAsync(process.argv).catch((error: unknown) => {
  handleError(error, program.opts());
});

function addSocialCommand(kind: "friends" | "followers" | "following") {
  program
    .command(kind)
    .description(`View ${kind} for self or another user`)
    .argument("[username]", "AniList username")
    .option("-n, --limit <number>", "Max users to return", "50")
    .action(async (username: string | undefined, options: { limit?: string }, command: Command) => {
      const ctx = getContext(command);
      const limit = z.coerce.number().int().min(1).max(200).parse(options.limit ?? "50");
      const token = username ? resolveToken(ctx.tokenFlag).token : requireToken(ctx.tokenFlag).token;

      const { data } = await getSocialList({ token, username, relation: kind, limit });
      if (ctx.json) {
        return printJson(data);
      }
      printSocial(kind, data.user.name, data.users);
    });
}

function getContext(command: Command): CliContext {
  const rootOpts = program.opts<{ json?: boolean; dryRun?: boolean; token?: string }>();
  const localOpts = typeof command.opts === "function" ? command.opts<{ json?: boolean; dryRun?: boolean; token?: string }>() : {};
  return {
    json: Boolean(localOpts.json ?? rootOpts.json),
    dryRun: Boolean(localOpts.dryRun ?? rootOpts.dryRun),
    tokenFlag: localOpts.token ?? rootOpts.token,
  };
}

function parseMediaType(value: string): MediaType {
  const normalized = value.trim().toUpperCase();
  if (normalized === "ANIME" || normalized === "MANGA") {
    return mediaTypeSchema.parse(normalized);
  }
  throw new ValidationError(`Invalid media type: ${value}. Use anime or manga.`);
}

function parseStatus(value: string): ListStatus {
  return statusSchema.parse(value.trim().toUpperCase());
}

function parseStatuses(value: string | undefined): ListStatus[] | undefined {
  if (!value) {
    return undefined;
  }
  const parts = value
    .split(",")
    .map((part) => part.trim())
    .filter(Boolean);
  if (!parts.length) {
    return undefined;
  }
  return parts.map((part) => parseStatus(part));
}

function parseCsvList(value: string | undefined): string[] {
  if (!value) {
    return [];
  }
  return value
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);
}

function parseSeason(value: string): DiscoverSeason {
  return seasonSchema.parse(value.trim().toUpperCase());
}

function parseDiscoverSort(value: string): DiscoverSort {
  return discoverSortSchema.parse(value.trim().toUpperCase());
}

function parseMediaFormat(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }
  return mediaFormatSchema.parse(value.trim().toUpperCase());
}

function getCurrentSeasonReference(now = new Date()): { season: DiscoverSeason; year: number } {
  const month = now.getUTCMonth() + 1;
  const year = now.getUTCFullYear();

  if (month <= 2) {
    return { season: "WINTER", year };
  }
  if (month <= 5) {
    return { season: "SPRING", year };
  }
  if (month <= 8) {
    return { season: "SUMMER", year };
  }
  return { season: "FALL", year };
}

function flattenEntries(
  lists: Array<{ name: string; status?: string | null; isCustomList?: boolean | null; entries: MediaListEntry[] }>,
): MediaListEntry[] {
  return lists.flatMap((list) => list.entries ?? []);
}

function buildAiringMineItems(
  lists: Array<{ name: string; status?: string | null; isCustomList?: boolean | null; entries: MediaListEntry[] }>,
  nowUnix: number,
  untilUnix?: number,
): AiringMineItem[] {
  const entries = flattenEntries(lists).filter((entry) => entry.status === "CURRENT" && entry.media?.id);
  const items = entries.map((entry) => {
    const next = entry.media?.nextAiringEpisode;
    const airingAt = typeof next?.airingAt === "number" ? next.airingAt : null;
    const secondsUntil = airingAt !== null ? Math.max(0, airingAt - nowUnix) : null;
    return {
      mediaId: entry.media?.id ?? 0,
      title: pickTitle(entry.media?.title ?? {}),
      progress: typeof entry.progress === "number" ? entry.progress : 0,
      totalEpisodes: entry.media?.episodes,
      nextEpisode: next?.episode ?? null,
      nextAiringAt: airingAt,
      relativeCountdown: secondsUntil === null ? "n/a" : formatCountdown(secondsUntil),
      siteUrl: entry.media?.siteUrl ?? null,
    } satisfies AiringMineItem;
  });

  const filtered = untilUnix
    ? items.filter((item) => typeof item.nextAiringAt === "number" && item.nextAiringAt <= untilUnix)
    : items;

  return filtered.sort((a, b) => {
    if (typeof a.nextAiringAt !== "number" && typeof b.nextAiringAt !== "number") {
      return a.title.localeCompare(b.title);
    }
    if (typeof a.nextAiringAt !== "number") return 1;
    if (typeof b.nextAiringAt !== "number") return -1;
    if (a.nextAiringAt !== b.nextAiringAt) return a.nextAiringAt - b.nextAiringAt;
    return a.title.localeCompare(b.title);
  });
}

function summarizeStatusCounts(entries: MediaListEntry[]) {
  const base = {
    total: entries.length,
    current: 0,
    planning: 0,
    completed: 0,
    paused: 0,
    dropped: 0,
    repeating: 0,
  };

  for (const entry of entries) {
    const status = entry.status ?? "";
    if (status === "CURRENT") base.current += 1;
    else if (status === "PLANNING") base.planning += 1;
    else if (status === "COMPLETED") base.completed += 1;
    else if (status === "PAUSED") base.paused += 1;
    else if (status === "DROPPED") base.dropped += 1;
    else if (status === "REPEATING") base.repeating += 1;
  }

  return base;
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

function summarizeLists(
  lists: Array<{ name: string; status?: string | null; isCustomList?: boolean | null; entries: Array<unknown> }>,
) {
  return lists.map((list) => ({
    name: list.name,
    status: list.status,
    isCustomList: Boolean(list.isCustomList),
    count: list.entries.length,
  }));
}

function printSummary(items: Array<{ name: string; status?: string | null; isCustomList?: boolean; count: number }>) {
  for (const item of items) {
    const type = item.isCustomList ? "custom" : item.status ?? "group";
    console.log(`- ${item.name} (${type}): ${item.count}`);
  }
}

function output(ctx: CliContext, payload: unknown) {
  if (ctx.json) {
    return printJson(payload);
  }
  if (typeof payload === "string") {
    console.log(payload);
    return;
  }
  printJson(payload);
}

function handleError(error: unknown, opts: { json?: boolean }) {
  const json = Boolean(opts.json);

  if (error instanceof ZodError) {
    const message = error.issues.map((issue) => `${issue.path.join(".") || "input"}: ${issue.message}`).join("; ");
    return fail(new ValidationError(message), json);
  }

  if (error instanceof CliError || error instanceof ApiError || error instanceof AuthError) {
    return fail(error, json);
  }

  if (error instanceof Error) {
    return fail(new CliError("UNEXPECTED", error.message), json);
  }

  return fail(new CliError("UNEXPECTED", "Unknown error."), json);
}

function fail(error: CliError, json: boolean) {
  if (json) {
    printJson({ ok: false, code: error.code, message: error.message, details: error.details });
  } else {
    console.error(`Error: ${error.message}`);
  }
  process.exitCode = 1;
}
