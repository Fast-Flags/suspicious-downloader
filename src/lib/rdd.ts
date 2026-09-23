/*
    rdd - https://github.com/latte-soft/rdd
    forked rdd - 
    forked by mally & the fast-flag team

    Copyright (C) 2024 Latte Softworks <latte.to> | MIT License
*/

import JSZip from "jszip";

export const DEFAULT_HOST = "https://setup-aws.rbxcdn.com";
export const LIVE_CHANNEL = "LIVE";
export const DEFAULT_CONCURRENCY = 4;
export const DEFAULT_COMPRESSION_LEVEL = 5;

type WindowsBinary = { platform: "windows"; blobDir: string };
type MacBinary = { platform: "mac"; blobDir: string; archive: string };
export type BinaryTypeInfo = WindowsBinary | MacBinary;

export const BINARY_TYPES = {
    WindowsPlayer: { platform: "windows", blobDir: "/" },
    WindowsStudio64: { platform: "windows", blobDir: "/" },
    MacPlayer: { platform: "mac", blobDir: "/mac/", archive: "RobloxPlayer.zip" },
    MacStudio: { platform: "mac", blobDir: "/mac/", archive: "RobloxStudioApp.zip" },
} as const satisfies Record<string, BinaryTypeInfo>;

export type BinaryType = keyof typeof BINARY_TYPES;
export const BINARY_TYPE_NAMES = Object.keys(BINARY_TYPES) as BinaryType[];

export function isBinaryType(value: unknown): value is BinaryType {
    return typeof value === "string" && Object.hasOwn(BINARY_TYPES, value);
}

type ExtractRoots = Readonly<Record<string, string>>;

// Root extract locations for different known zips possible in the Win manifests
const PLAYER_EXTRACT_ROOTS: ExtractRoots = {
    "RobloxApp.zip": "",
    "shaders.zip": "shaders/",
    "ssl.zip": "ssl/",

    "WebView2.zip": "",
    "WebView2RuntimeInstaller.zip": "WebView2RuntimeInstaller/",

    "content-avatar.zip": "content/avatar/",
    "content-configs.zip": "content/configs/",
    "content-fonts.zip": "content/fonts/",
    "content-sky.zip": "content/sky/",
    "content-sounds.zip": "content/sounds/",
    "content-textures2.zip": "content/textures/",
    "content-models.zip": "content/models/",

    "content-textures3.zip": "PlatformContent/pc/textures/",
    "content-terrain.zip": "PlatformContent/pc/terrain/",
    "content-platform-fonts.zip": "PlatformContent/pc/fonts/",

    "extracontent-luapackages.zip": "ExtraContent/LuaPackages/",
    "extracontent-translations.zip": "ExtraContent/translations/",
    "extracontent-models.zip": "ExtraContent/models/",
    "extracontent-textures.zip": "ExtraContent/textures/",
    "extracontent-places.zip": "ExtraContent/places/",
};

const STUDIO_EXTRACT_ROOTS: ExtractRoots = {
    "RobloxStudio.zip": "",
    "redist.zip": "",
    "Libraries.zip": "",
    "LibrariesQt5.zip": "",

    "WebView2.zip": "",
    "WebView2RuntimeInstaller.zip": "",

    "shaders.zip": "shaders/",
    "ssl.zip": "ssl/",

    "Qml.zip": "Qml/",
    "Plugins.zip": "Plugins/",
    "StudioFonts.zip": "StudioFonts/",
    "BuiltInPlugins.zip": "BuiltInPlugins/",
    "ApplicationConfig.zip": "ApplicationConfig/",
    "BuiltInStandalonePlugins.zip": "BuiltInStandalonePlugins/",

    "content-qt_translations.zip": "content/qt_translations/",
    "content-sky.zip": "content/sky/",
    "content-fonts.zip": "content/fonts/",
    "content-avatar.zip": "content/avatar/",
    "content-models.zip": "content/models/",
    "content-sounds.zip": "content/sounds/",
    "content-configs.zip": "content/configs/",
    "content-api-docs.zip": "content/api_docs/",
    "content-textures2.zip": "content/textures/",
    "content-studio_svg_textures.zip": "content/studio_svg_textures/",

    "content-platform-fonts.zip": "PlatformContent/pc/fonts/",
    "content-terrain.zip": "PlatformContent/pc/terrain/",
    "content-textures3.zip": "PlatformContent/pc/textures/",

    "extracontent-translations.zip": "ExtraContent/translations/",
    "extracontent-luapackages.zip": "ExtraContent/LuaPackages/",
    "extracontent-textures.zip": "ExtraContent/textures/",
    "extracontent-scripts.zip": "ExtraContent/scripts/",
    "extracontent-models.zip": "ExtraContent/models/",
};

// 4 WindowsPlayer and WindowsStudio64
const APP_SETTINGS_XML = `<?xml version="1.0" encoding="UTF-8"?>
<Settings>
	<ContentFolder>content</ContentFolder>
	<BaseUrl>http://www.roblox.com</BaseUrl>
</Settings>
`;

const DEPLOY_HISTORY_NAMES: Record<BinaryType, string> = {
    WindowsPlayer: "WindowsPlayer",
    WindowsStudio64: "Studio64",
    MacPlayer: "Client",
    MacStudio: "Studio",
};

// errors

export class RddError extends Error {
    override name = "RddError";
}

export class HttpError extends RddError {
    override name = "HttpError";

    constructor(
        readonly url: string,
        readonly status: number,
        body = "",
    ) {
        super(`Request failed (${status}) @ ${url}${body ? ` - ${body}` : ""}`);
    }
}


export class VersionLookupError extends RddError {
    override name = "VersionLookupError";

    constructor(readonly url: string, options?: ErrorOptions) {
        super(`Couldn't fetch the latest version from ${url}`, options);
    }
}

// input normalization

export function normalizeChannel(channel?: string | null): string {
    const trimmed = channel?.trim();
    if (!trimmed || trimmed.toUpperCase() === LIVE_CHANNEL) return LIVE_CHANNEL;
    return trimmed.toLowerCase();
}

/** only the version GUID is actually necessary; the "version-" prefix is added if missing */
export function normalizeVersion(version: string): string {
    const v = version.trim().toLowerCase();
    return v.startsWith("version-") ? v : `version-${v}`;
}

export function normalizeBlobDir(dir: string): string {
    let d = dir.trim();
    if (!d.startsWith("/")) d = `/${d}`;
    if (!d.endsWith("/")) d += "/";
    return d;
}

export function normalizeHost(host: string): string {
    return host.trim().replace(/\/+$/, "");
}

export function getChannelPath(host: string, channel: string): string {
    return channel === LIVE_CHANNEL ? host : `${host}/channel/${encodeURIComponent(channel)}`;
}

export function getClientSettingsUrl(binaryType: BinaryType, channel: string): string {
    return `https://clientsettings.roblox.com/v2/client-version/${encodeURIComponent(binaryType)}/channel/${encodeURIComponent(normalizeChannel(channel))}`;
}

// networking

async function fetchOk(url: string, signal?: AbortSignal): Promise<Response> {
    const res = await fetch(url, { signal });
    if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new HttpError(url, res.status, body.slice(0, 200));
    }
    return res;
}

export async function fetchText(url: string, signal?: AbortSignal): Promise<string> {
    return (await fetchOk(url, signal)).text();
}

/** downloads a binary, streaming it so `onChunk` can report byte-level progress */
export async function fetchBytes(
    url: string,
    signal?: AbortSignal,
    onChunk?: (byteCount: number) => void,
): Promise<ArrayBuffer> {
    const res = await fetchOk(url, signal);
    if (!res.body || !onChunk) return res.arrayBuffer();

    const reader = res.body.getReader();
    const chunks: Uint8Array[] = [];
    let received = 0;

    for (; ;) {
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        received += value.byteLength;
        onChunk(value.byteLength);
    }

    const out = new Uint8Array(received);
    let offset = 0;
    for (const chunk of chunks) {
        out.set(chunk, offset);
        offset += chunk.byteLength;
    }
    return out.buffer as ArrayBuffer;
}


export async function resolveLatestVersion(
    binaryType: BinaryType,
    channel?: string,
    signal?: AbortSignal,
): Promise<string> {
    const url = getClientSettingsUrl(binaryType, channel ?? LIVE_CHANNEL);

    let res: Response;
    try {
        res = await fetch(url, { signal });
    } catch (err) {
        if (signal?.aborted) throw err;
        throw new VersionLookupError(url, { cause: err }); // Almost always CORS
    }

    if (!res.ok) throw new HttpError(url, res.status);

    const json = (await res.json()) as { clientVersionUpload?: unknown };
    if (typeof json.clientVersionUpload !== "string") {
        throw new RddError(`Unexpected response from ${url}`);
    }
    return json.clientVersionUpload;
}

// manifest

export interface ManifestEntry {
    name: string;
    checksum: string;
    packedSize: number;
    size: number;
}

/**
 * rbxPkgManifest.txt format:
 *   v0
 *   <file name>
 *   <md5>
 *   <packed size>
 *   <size>
 *   ...repeated
 */
export function parseManifest(body: string): ManifestEntry[] {
    const lines = body.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    if (lines[0] !== "v0") {
        throw new RddError(`rbxPkgManifest version incorrect; expected "v0", got "${lines[0] ?? ""}"`);
    }

    const entries: ManifestEntry[] = [];
    for (let i = 1; i < lines.length; i++) {
        const name = lines[i]!;
        if (!name.includes(".")) continue; // Not a file name; skip stray metadata

        const [checksum = "", packed = "", size = ""] = lines.slice(i + 1, i + 4);
        entries.push({
            name,
            checksum,
            packedSize: Number.parseInt(packed, 10) || 0,
            size: Number.parseInt(size, 10) || 0,
        });
        i += 3;
    }
    return entries;
}

// download

export interface DownloadProgress {
    phase: "manifest" | "packages" | "compressing" | "done";
    packagesDone: number;
    packagesTotal: number;
    bytesReceived: number;
    /** sum of packed sizes from the manifest; 0 when unknown (e.g. Mac) */
    bytesTotal: number;
    /** 0-100, only set during "compressing" */
    compressPercent?: number;
}

export interface DownloadOptions {
    binaryType: BinaryType;
    /** version hash, with or without the "version-" prefix */
    version: string;
    /** deployment channel; defaults to "LIVE" */
    channel?: string;
    /** override the blob directory, e.g. "/mac/arm64/" */
    blobDir?: string;
    /** override the CDN host; defaults to DEFAULT_HOST */
    hostPath?: string;
    /** DEFLATE the assembled zip instead of STORE (Windows only). Default: false */
    compress?: boolean;
    /** 1-9, only used when `compress` is true */
    compressionLevel?: number;
    /** max packages downloaded/extracted at once */
    concurrency?: number;
    signal?: AbortSignal;
    onLog?: (message: string) => void;
    /** called often (per network chunk); throttle in your UI if needed */
    onProgress?: (progress: DownloadProgress) => void;
}

export interface DownloadResult {
    fileName: string;
    blob: Blob;
}

interface Context {
    binaryType: BinaryType;
    channel: string;
    version: string;
    versionPath: string;
    compress: boolean;
    compressionLevel: number;
    concurrency: number;
    signal?: AbortSignal;
    log: (message: string) => void;
    update: (patch: Partial<DownloadProgress>) => void;
    addBytes: (byteCount: number) => void;
    progress: Readonly<DownloadProgress>;
}

export async function downloadDeployment(options: DownloadOptions): Promise<DownloadResult> {
    const { binaryType } = options;
    if (!isBinaryType(binaryType)) {
        throw new RddError(`Unsupported binaryType "${String(binaryType)}"; expected one of ${BINARY_TYPE_NAMES.join(", ")}`);
    }

    const compressionLevel = options.compressionLevel ?? DEFAULT_COMPRESSION_LEVEL;
    if (!Number.isInteger(compressionLevel) || compressionLevel < 1 || compressionLevel > 9) {
        throw new RddError(`compressionLevel must be an integer between 1 and 9, got ${compressionLevel}`);
    }

    const info: BinaryTypeInfo = BINARY_TYPES[binaryType];
    const channel = normalizeChannel(options.channel);
    const version = normalizeVersion(options.version);
    const blobDir = normalizeBlobDir(options.blobDir ?? info.blobDir);
    const host = normalizeHost(options.hostPath ?? DEFAULT_HOST);

    const progress: DownloadProgress = {
        phase: "manifest",
        packagesDone: 0,
        packagesTotal: 0,
        bytesReceived: 0,
        bytesTotal: 0,
    };
    const update = (patch: Partial<DownloadProgress>) => {
        Object.assign(progress, patch);
        options.onProgress?.({ ...progress });
    };

    const ctx: Context = {
        binaryType,
        channel,
        version,
        versionPath: `${getChannelPath(host, channel)}${blobDir}${version}-`,
        compress: options.compress ?? false,
        compressionLevel,
        concurrency: Math.max(1, Math.floor(options.concurrency ?? DEFAULT_CONCURRENCY)),
        signal: options.signal,
        log: options.onLog ?? (() => { }),
        update,
        addBytes: (n) => update({ bytesReceived: progress.bytesReceived + n }),
        progress,
    };

    const fileName = `${channel}-${binaryType}-${version}.zip`;
    const blob = info.platform === "mac"
        ? await downloadMac(ctx, info.archive)
        : await downloadWindows(ctx);

    update({ phase: "done" });
    return { fileName, blob };
}

async function downloadMac(ctx: Context, archive: string): Promise<Blob> {
    ctx.log(`[+] Fetching zip archive for BinaryType "${ctx.binaryType}" (${archive})..`);
    ctx.update({ phase: "packages", packagesTotal: 1 });

    const data = await fetchBytes(ctx.versionPath + archive, ctx.signal, ctx.addBytes);

    ctx.update({ packagesDone: 1 });
    ctx.log(`[+] Downloaded "${archive}"`);
    return new Blob([data], { type: "application/zip" });
}

async function downloadWindows(ctx: Context): Promise<Blob> {
    ctx.log(`[+] Fetching rbxPkgManifest for ${ctx.version}@${ctx.channel}..`);
    const entries = parseManifest(await fetchText(`${ctx.versionPath}rbxPkgManifest.txt`, ctx.signal));
    const names = new Set(entries.map((e) => e.name));

    let extractRoots: ExtractRoots;
    if (names.has("RobloxApp.zip")) {
        if (ctx.binaryType === "WindowsStudio64") {
            throw new RddError(`BinaryType \`${ctx.binaryType}\` given, but "RobloxApp.zip" was found in the manifest!`);
        }
        extractRoots = PLAYER_EXTRACT_ROOTS;
    } else if (names.has("RobloxStudio.zip")) {
        if (ctx.binaryType === "WindowsPlayer") {
            throw new RddError(`BinaryType \`${ctx.binaryType}\` given, but "RobloxStudio.zip" was found in the manifest!`);
        }
        extractRoots = STUDIO_EXTRACT_ROOTS;
    } else {
        throw new RddError("Bad/unrecognized rbxPkgManifest, aborting..");
    }

    const packages = entries.filter((e) => e.name.endsWith(".zip"));
    for (const skipped of entries.filter((e) => !e.name.endsWith(".zip"))) {
        ctx.log(`[*] Skipping non-zip manifest entry "${skipped.name}"`);
    }

    ctx.update({
        phase: "packages",
        packagesTotal: packages.length,
        bytesTotal: packages.reduce((sum, e) => sum + e.packedSize, 0),
    });
    ctx.log(`[+] Fetching ${packages.length} blobs for BinaryType \`${ctx.binaryType}\`..`);

    const zip = new JSZip();
    zip.file("AppSettings.xml", APP_SETTINGS_XML);

    // One failed package cancels the rest instead of leaving them running
    const controller = linkedAbortController(ctx.signal);
    try {
        await runPool(packages, ctx.concurrency, async (entry) => {
            controller.signal.throwIfAborted();
            await downloadPackage(ctx, zip, entry, extractRoots, controller.signal);
        });
    } catch (err) {
        controller.abort(err);
        throw err;
    }

    if (ctx.compress) {
        ctx.log(`[!] NOTE: Compressing final zip (level ${ctx.compressionLevel}/9), this may take a bit longer than with no compression..`);
    }
    ctx.log("[+] Exporting assembled zip file..");
    ctx.update({ phase: "compressing", compressPercent: 0 });

    return zip.generateAsync(
        {
            type: "blob",
            mimeType: "application/zip",
            compression: ctx.compress ? "DEFLATE" : "STORE",
            compressionOptions: { level: ctx.compressionLevel },
            streamFiles: true,
        },
        (meta) => ctx.update({ compressPercent: meta.percent }),
    );
}

async function downloadPackage(
    ctx: Context,
    out: JSZip,
    entry: ManifestEntry,
    extractRoots: ExtractRoots,
    signal: AbortSignal,
): Promise<void> {
    const { name } = entry;
    ctx.log(`[+] Fetching "${name}"..`);
    const data = await fetchBytes(ctx.versionPath + name, signal, ctx.addBytes);

    const root = Object.hasOwn(extractRoots, name) ? extractRoots[name] : undefined;

    if (root === undefined) {
        ctx.log(`[*] Package "${name}" has no extraction root for \`${ctx.binaryType}\`; adding it to the zip root as-is (THE OUTPUT MAY BE INCOMPLETE!)`);
        out.file(name, data);
    } else {
        ctx.log(`[+] Extracting "${name}"..`);
        const pkg = await JSZip.loadAsync(data);
        const jobs: Promise<void>[] = [];

        pkg.forEach((path, file) => {
            if (file.dir || path.endsWith("\\") || path.endsWith("/")) return;
            const fixedPath = path.replace(/\\/g, "/");
            jobs.push(file.async("uint8array").then((bytes) => {
                out.file(root + fixedPath, bytes);
            }));
        });

        await Promise.all(jobs);
    }

    const packagesDone = ctx.progress.packagesDone + 1;
    ctx.update({ packagesDone });
    ctx.log(`[+] Done with "${name}"! (Packages left: ${ctx.progress.packagesTotal - packagesDone})`);
}

// Utils

/** Runs `task` over `items` with at most `limit` in flight; rejects on first failure */
async function runPool<T>(items: readonly T[], limit: number, task: (item: T) => Promise<void>): Promise<void> {
    let cursor = 0;
    const worker = async () => {
        while (cursor < items.length) {
            await task(items[cursor++]!);
        }
    };
    const workerCount = Math.max(1, Math.min(limit, items.length));
    await Promise.all(Array.from({ length: workerCount }, worker));
}

function linkedAbortController(parent?: AbortSignal): AbortController {
    const controller = new AbortController();
    if (parent) {
        if (parent.aborted) controller.abort(parent.reason);
        else parent.addEventListener("abort", () => controller.abort(parent.reason), { once: true });
    }
    return controller;
}

export async function resolvePreviousVersion(
    binaryType: BinaryType,
    channel?: string,
    signal?: AbortSignal,
    hostPath: string = DEFAULT_HOST,
): Promise<string> {
    const info = BINARY_TYPES[binaryType];
    const base = getChannelPath(normalizeHost(hostPath), normalizeChannel(channel));
    const url = `${base}${info.platform === "mac" ? "/mac" : ""}/DeployHistory.txt`;
    const history = await fetchText(url, signal);

    // trailing space stops "Studio" from also matching "Studio64"
    const re = new RegExp(`New ${DEPLOY_HISTORY_NAMES[binaryType]} (version-[0-9a-f]+)`, "g");
    const versions = [...history.matchAll(re)].map((m) => m[1]!);

    const distinct: string[] = [];
    for (let i = versions.length - 1; i >= 0; i--) {
        const v = versions[i]!;
        if (!distinct.includes(v)) distinct.push(v);
        if (distinct.length === 2) return v;
    }

    throw new RddError(`Couldn't find a previous ${binaryType} version in ${url}`);
}