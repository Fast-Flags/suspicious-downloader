// src/lib/download.svelte.ts
import {
	DEFAULT_CONCURRENCY,
	downloadDeployment,
	isBinaryType,
	resolveLatestVersion,
	type DownloadProgress
} from '$lib/rdd';

export type Status = 'idle' | 'running' | 'done' | 'error' | 'cancelled';

export interface StartOptions {
	binaryType: string;
	channel: string;
	/** empty = resolve latest */
	version: string;
	compress: boolean;
	parallel: boolean;
}

export function toSearchParams(o: StartOptions): URLSearchParams {
	const sp = new URLSearchParams({ binaryType: o.binaryType });
	if (o.channel.trim()) sp.set('channel', o.channel.trim());
	if (o.version.trim()) sp.set('version', o.version.trim());
	if (o.compress) sp.set('compress', '1');
	if (!o.parallel) sp.set('parallel', '0');
	return sp;
}

export function fromSearchParams(sp: URLSearchParams): StartOptions {
	return {
		binaryType: sp.get('binaryType') ?? 'WindowsPlayer',
		channel: sp.get('channel') ?? '',
		version: sp.get('version') ?? '',
		compress: sp.get('compress') === '1',
		parallel: sp.get('parallel') !== '0'
	};
}

class DownloadJob {
	status = $state<Status>('idle');
	progress = $state<DownloadProgress | null>(null);
	logs = $state<string[]>([]);
	error = $state('');
	fileName = $state('');

	percent = $derived.by(() => {
		const p = this.progress;
		if (!p) return 0;
		if (p.phase === 'compressing') return p.compressPercent ?? 0;
		if (p.bytesTotal) return (p.bytesReceived / p.bytesTotal) * 100;
		if (p.packagesTotal) return (p.packagesDone / p.packagesTotal) * 100;
		return 0;
	});

	#controller: AbortController | null = null;
	#pending: DownloadProgress | null = null;
	#run = 0;

	// onProgress fires per network chunk; flush at most once per frame
	#onProgress = (p: DownloadProgress) => {
		if (!this.#pending) {
			requestAnimationFrame(() => {
				if (this.#pending) this.progress = this.#pending;
				this.#pending = null;
			});
		}
		this.#pending = p;
	};

	#log = (msg: string) => {
		this.logs.push(msg);
		if (this.logs.length > 500) this.logs.shift();
	};

	start = async (opts: StartOptions) => {
		this.#controller?.abort(); // kill any previous run
		const run = ++this.#run;
		const live = () => run === this.#run;
		const controller = (this.#controller = new AbortController());

		this.status = 'running';
		this.progress = null;
		this.#pending = null;
		this.logs = [];
		this.error = '';

		try {
			if (!isBinaryType(opts.binaryType)) {
				throw new Error(`Unknown binary type "${opts.binaryType}"`);
			}

			let version = opts.version.trim();
			if (!version) {
				this.#log('[+] Resolving latest version..');
				version = await fetchLatestVersion(opts.binaryType, opts.channel, controller.signal);
				this.#log(`[+] Latest is ${version}`);
			}

			const { fileName, blob } = await downloadDeployment({
				binaryType: opts.binaryType,
				channel: opts.channel,
				version,
				compress: opts.compress,
				concurrency: opts.parallel ? DEFAULT_CONCURRENCY : 1,
				signal: controller.signal,
				onLog: (m) => {
					if (live()) this.#log(m);
				},
				onProgress: (p) => {
					if (live()) this.#onProgress(p);
				}
			});

			if (!live()) return;
			this.fileName = fileName;
			saveBlob(blob, fileName);
			this.status = 'done';
		} catch (e) {
			if (!live()) return;
			if (controller.signal.aborted) {
				this.status = 'cancelled';
			} else {
				this.error = e instanceof Error ? e.message : String(e);
				this.status = 'error';
			}
		} finally {
			if (live()) this.#controller = null;
		}
	};

	cancel = () => this.#controller?.abort();

	stop = () => {
		this.#controller?.abort();
		this.#run++;
		this.#controller = null;
		this.#pending = null;
		this.status = 'idle';
		this.progress = null;
	};
}

function saveBlob(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = name;
	a.click();
	setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

async function fetchLatestVersion(binaryType: string, channel: string, signal?: AbortSignal) {
	const qs = new URLSearchParams({ binaryType, channel: channel.trim() || 'LIVE' });
	const res = await fetch(`/api/version?${qs}`, { signal });
	if (!res.ok) throw new Error(`Version lookup failed (${res.status}): ${await res.text()}`);
	return (await res.json()).version as string;
}

export const job = new DownloadJob();