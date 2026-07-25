#!/usr/bin/env node
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "../..");
const remotePath = process.argv[2] ?? resolve(import.meta.dirname, "_remote-migrations.json");
const remote = JSON.parse(readFileSync(remotePath, "utf8"));
const local = readdirSync(resolve(root, "supabase/migrations"))
	.filter((f) => f.endsWith(".sql"))
	.map((f) => {
		const m = f.match(/^(\d+)_(.+)\.sql$/);
		return m ? { version: m[1], name: m[2], file: f } : null;
	})
	.filter(Boolean);

const key = (x) => `${x.version}_${x.name}`;
const remoteKeys = new Set(remote.map(key));
const localKeys = new Set(local.map(key));

const onlyLocal = local.filter((l) => !remoteKeys.has(key(l))).sort((a, b) => a.version.localeCompare(b.version));
const onlyRemote = remote.filter((r) => !localKeys.has(key(r)));
const versionMismatch = local
	.filter((l) => remote.some((r) => r.version === l.version && r.name !== l.name))
	.map((l) => ({ local: l, remote: remote.find((r) => r.version === l.version) }));

console.log(JSON.stringify({ onlyLocal, onlyRemote, versionMismatch, counts: { local: local.length, remote: remote.length } }, null, 2));
