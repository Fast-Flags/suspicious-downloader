<script lang="ts">
	import { Button, Card, Checkbox, Icon, Select, TextField } from 'm3-svelte';
	import iconDownload from '@ktibow/iconset-material-symbols/download';
	import iconBack from '@ktibow/iconset-material-symbols/arrow-back';
	import { containerTransform } from 'm3-svelte';
	import iconCopy from '@ktibow/iconset-material-symbols/content-copy';
	import { fromSearchParams, toSearchParams } from '$lib/download.svelte';
	import { isBinaryType, resolvePreviousVersion } from '$lib/rdd';
	import { fade } from 'svelte/transition';
	import { page } from '$app/state';
	import { goto } from '$app/navigation';
	import { onMount } from 'svelte';
	import { getPlayedIntro, setPlayed } from '$lib/shared.svelte';

	function getRandomElement<T>(arr: T[]): T | undefined {
		if (arr.length === 0) return undefined;
		const randomIndex = Math.floor(Math.random() * arr.length);
		return arr[randomIndex];
	}

	let scale = $state(1);

	const init = fromSearchParams(page.url.searchParams);

	const funtexts = [
		'hahahaha',
		'hi',
		'👀',
		'hooray',
		'long ears',
		"i'd say this is rdd m3"
	];
	const funtext = getRandomElement(funtexts);

	let introPhase = $state<'seed' | 'expanded' | 'gone'>('seed');
	const [send, receive] = containerTransform({ duration: 600 });

	let binaryType = $state(init.binaryType);
	let channel = $state(init.channel);
	let versionHash = $state(init.version);
	let compressZip = $state(init.compress);
	let parallelDownloads = $state(init.parallel);

	let error = $state('');

	const params = (version: string) =>
		toSearchParams({
			binaryType,
			channel,
			version,
			compress: compressZip,
			parallel: parallelDownloads
		});

	const go = (version: string) => goto(`/download?${params(version)}`);

	async function previous() {
		error = '';
		try {
			if (!isBinaryType(binaryType)) return;
			const prev = await resolvePreviousVersion(binaryType, channel);
			versionHash = prev;
			go(prev);
		} catch (e) {
			error = e instanceof Error ? e.message : String(e);
		}
	}

	async function copyLink() {
		const url = new URL(`/download?${params(versionHash)}`, location.origin);
		await navigator.clipboard.writeText(url.toString());
	}

	onMount(() => {
		if (getPlayedIntro()) return; // already played, do nothing
		setPlayed();

		const grow = setTimeout(() => (introPhase = 'expanded'), 50);
		const shrink = setTimeout(() => (introPhase = 'seed'), 1400);
		const remove = setTimeout(() => (introPhase = 'gone'), 1400 + 600);

		return () => {
			clearTimeout(grow);
			clearTimeout(shrink);
			clearTimeout(remove);
		};
	});
</script>

{#if introPhase !== 'gone'}
	<div class="pointer-events-none fixed inset-0 z-50 h-full w-full">
		{#if introPhase === 'expanded'}
			<div
				class="pointer-events-auto flex h-full w-full items-center justify-center"
				style="background: var(--m3-scheme-surface, #1c1b1f); color: var(--m3-scheme-on-surface, #fff);"
				in:receive={{ key: 'container' }}
				out:fade={{ duration: 200 }}
			>
				<p class="text-2xl">{funtext}</p>
			</div>
		{/if}
	</div>
{/if}

<div class="flex h-dvh items-center justify-center overflow-hidden p-4">
	<div
		class="w-[560px] max-w-full transition-transform duration-200 [&>*]:w-full"
		style:transform="scale({scale})"
	>
		<Card variant="filled">
			<div class="flex flex-col gap-4">
				<div class="grid grid-cols-[8rem_1fr] items-center gap-x-4 gap-y-3">
					<span>Binary Type</span>
					<Select
						label="Binary type"
						options={[
							{ text: 'WindowsPlayer', value: 'WindowsPlayer' },
							{ text: 'WindowsStudio64', value: 'WindowsStudio64' },
							{ text: 'MacPlayer', value: 'MacPlayer' },
							{ text: 'MacStudio', value: 'MacStudio' }
						]}
						bind:value={binaryType}
					/>

					<span>Channel</span>
					<TextField label="LIVE" bind:value={channel} />

					<span>Version Hash</span>
					<TextField label="Optional" bind:value={versionHash} />
				</div>

				<div class="flex flex-row flex-wrap gap-x-6 gap-y-2">
					<label class="flex cursor-pointer items-center gap-2">
						<Checkbox><input type="checkbox" bind:checked={parallelDownloads} /></Checkbox>
						<span>Parallel Downloads</span>
					</label>

					<label class="flex cursor-pointer items-center gap-2">
						<Checkbox><input type="checkbox" bind:checked={compressZip} /></Checkbox>
						<span>Compress Zip</span>
					</label>
				</div>

				<div class="grid grid-cols-3 gap-2 [&>*]:w-full">
					<Button variant="tonal" iconType="left" onclick={() => go('')}>
						<Icon icon={iconDownload} /> Latest
					</Button>
					<Button variant="tonal" iconType="left" onclick={previous}>
						<Icon icon={iconBack} /> Previous
					</Button>
					<Button variant="outlined" iconType="left" onclick={copyLink}>
						<Icon icon={iconCopy} /> Copy link
					</Button>
				</div>
				<div class="[&>*]:w-full">
					<Button
						variant="filled"
						iconType="left"
						disabled={!versionHash.trim()}
						onclick={() => go(versionHash)}
					>
						<Icon icon={iconDownload} /> Download Specified
					</Button>
				</div>
			</div>
			{#if error}<span class="text-sm text-red-500">{error}</span>{/if}
		</Card>
	</div>
</div>
