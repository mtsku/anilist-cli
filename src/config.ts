import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import { AuthError, ValidationError } from "./errors.js";
import type { ConfigFile, TokenSource } from "./types.js";

const CONFIG_DIR = join(homedir(), ".config", "anilist-cli");
const CONFIG_FILE = join(CONFIG_DIR, "config.json");

export function getConfigPath() {
  return CONFIG_FILE;
}

export function loadConfig(): ConfigFile {
  if (!existsSync(CONFIG_FILE)) {
    return {};
  }
  try {
    const raw = readFileSync(CONFIG_FILE, "utf8");
    const parsed = JSON.parse(raw) as ConfigFile;
    if (parsed.token && typeof parsed.token !== "string") {
      throw new ValidationError("Stored token is not valid text.");
    }
    return parsed;
  } catch (error) {
    if (error instanceof ValidationError) {
      throw error;
    }
    throw new ValidationError(`Could not read config file: ${CONFIG_FILE}`, error);
  }
}

export function saveConfig(next: ConfigFile) {
  mkdirSync(CONFIG_DIR, { recursive: true, mode: 0o700 });
  const payload: ConfigFile = {
    ...next,
    updatedAt: new Date().toISOString(),
  };
  writeFileSync(CONFIG_FILE, `${JSON.stringify(payload, null, 2)}\n`, { mode: 0o600 });
  chmodSync(CONFIG_FILE, 0o600);
}

export function clearStoredToken() {
  const config = loadConfig();
  delete config.token;
  saveConfig(config);
}

export function resolveToken(tokenFlag?: string): { token?: string; source: TokenSource } {
  if (tokenFlag?.trim()) {
    return { token: tokenFlag.trim(), source: "flag" };
  }

  const envToken = process.env.ANILIST_TOKEN ?? process.env.ANILIST_ACCESS_TOKEN;
  if (envToken?.trim()) {
    return { token: envToken.trim(), source: "env" };
  }

  const fileToken = loadConfig().token;
  if (fileToken?.trim()) {
    return { token: fileToken.trim(), source: "config" };
  }

  return { token: undefined, source: "none" };
}

export function requireToken(tokenFlag?: string): { token: string; source: Exclude<TokenSource, "none"> } {
  const resolved = resolveToken(tokenFlag);
  if (!resolved.token || resolved.source === "none") {
    throw new AuthError(
      "AniList token is required for this command. Set ANILIST_TOKEN or run: anilistcli auth set-token <token>",
    );
  }
  return { token: resolved.token, source: resolved.source };
}
