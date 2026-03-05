import { execFileSync } from "node:child_process";
import test from "node:test";
import assert from "node:assert/strict";

const cliPath = new URL("../dist/cli.js", import.meta.url).pathname;

test("cli help is available", () => {
  const output = execFileSync("node", [cliPath, "--help"], { encoding: "utf8" });
  assert.match(output, /Reliable AniList CLI/);
});

test("discover command is exposed", () => {
  const output = execFileSync("node", [cliPath, "discover", "--help"], { encoding: "utf8" });
  assert.match(output, /Discover seasonal and upcoming anime/);
});

test("airing mine command is exposed", () => {
  const output = execFileSync("node", [cliPath, "airing", "mine", "--help"], { encoding: "utf8" });
  assert.match(output, /Show CURRENT anime with next airing details/);
});

test("mine summary command is exposed", () => {
  const output = execFileSync("node", [cliPath, "mine", "summary", "--help"], { encoding: "utf8" });
  assert.match(output, /One-call summary of your anime\/manga lists/);
});
