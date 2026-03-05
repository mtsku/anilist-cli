import { z } from "zod";

import { getMediaById, searchMedia } from "./anilist.js";
import { ValidationError } from "./errors.js";
import type { MediaType, ResolvedMedia } from "./types.js";

const ANILIST_URL = /anilist\.co\/(anime|manga)\/(\d+)/i;

const resolveInputSchema = z.object({
  input: z.string().min(1),
  type: z.enum(["ANIME", "MANGA"]).optional(),
  idMode: z.boolean().default(false),
  token: z.string().optional(),
});

export async function resolveMediaInput(raw: {
  input: string;
  type?: MediaType;
  idMode?: boolean;
  token?: string;
}): Promise<ResolvedMedia> {
  const parsed = resolveInputSchema.parse(raw);
  const input = parsed.input.trim();

  if (parsed.idMode || /^\d+$/.test(input)) {
    const mediaId = Number.parseInt(input, 10);
    return resolveById(mediaId, parsed.type, parsed.token, "id");
  }

  const fromUrl = await parseMediaFromUrl(input, parsed.type, parsed.token);
  if (fromUrl) {
    return fromUrl;
  }

  return resolveByTitle(input, parsed.type ?? "ANIME");
}

async function resolveById(
  mediaId: number,
  mediaType: MediaType | undefined,
  token: string | undefined,
  source: ResolvedMedia["source"],
): Promise<ResolvedMedia> {
  const { data } = await getMediaById(mediaId, mediaType, token);
  if (!data.Media) {
    throw new ValidationError(`Media not found for id ${mediaId}.`);
  }
  return {
    id: data.Media.id,
    type: data.Media.type,
    title: pickTitle(data.Media.title),
    siteUrl: data.Media.siteUrl,
    source,
  };
}

async function resolveByTitle(query: string, type: MediaType): Promise<ResolvedMedia> {
  const { data } = await searchMedia(type, query, 5);
  const first = data.Page.media[0];
  if (!first) {
    throw new ValidationError(`No ${type.toLowerCase()} results found for “${query}”.`);
  }
  return {
    id: first.id,
    type: first.type,
    title: pickTitle(first.title),
    siteUrl: first.siteUrl,
    source: "title",
  };
}

async function parseMediaFromUrl(urlText: string, type: MediaType | undefined, token?: string): Promise<ResolvedMedia | null> {
  let url: URL;
  try {
    url = new URL(urlText);
  } catch {
    return null;
  }

  const direct = extractAnilistFromText(urlText);
  if (direct) {
    return resolveById(direct.id, type ?? direct.type, token, "url");
  }

  const host = url.hostname.toLowerCase();
  if (["x.com", "twitter.com", "www.twitter.com", "www.x.com", "fxtwitter.com", "vxtwitter.com"].includes(host)) {
    const guessed = await extractFromSocialUrl(urlText);
    if (guessed) {
      return resolveById(guessed.id, type ?? guessed.type, token, "url");
    }
    throw new ValidationError(
      "Could not find an AniList link in that social post. Pass a direct AniList URL or use title/id input.",
    );
  }

  return null;
}

function extractAnilistFromText(text: string): { type: MediaType; id: number } | null {
  const match = text.match(ANILIST_URL);
  if (!match?.[1] || !match[2]) {
    return null;
  }
  return {
    type: match[1].toUpperCase() as MediaType,
    id: Number.parseInt(match[2], 10),
  };
}

async function extractFromSocialUrl(inputUrl: string): Promise<{ type: MediaType; id: number } | null> {
  const rewritten = inputUrl
    .replace("https://twitter.com/", "https://fxtwitter.com/")
    .replace("https://x.com/", "https://fxtwitter.com/")
    .replace("https://www.twitter.com/", "https://fxtwitter.com/")
    .replace("https://www.x.com/", "https://fxtwitter.com/");

  try {
    const response = await fetch(rewritten, {
      redirect: "follow",
      headers: {
        "User-Agent": "anilistcli/0.1",
      },
    });
    if (!response.ok) {
      return null;
    }
    const html = await response.text();
    return extractAnilistFromText(html);
  } catch {
    return null;
  }
}

export function pickTitle(title: {
  romaji?: string | null;
  english?: string | null;
  native?: string | null;
}): string {
  return title.english?.trim() || title.romaji?.trim() || title.native?.trim() || "Untitled";
}
