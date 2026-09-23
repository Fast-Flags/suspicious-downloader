<!-- src/routes/download/+page.svelte -->
<script lang="ts">
	import { onMount } from 'svelte';
	import { goto } from '$app/navigation';
	import { page } from '$app/state';
	import { job, fromSearchParams } from '$lib/download.svelte';
	import { Button, WavyLinearProgress, Card } from 'm3-svelte';

	let scale = $state(1);

	onMount(() => {
		job.start(fromSearchParams(page.url.searchParams));
		return () => job.stop(); // leaving the route (incl. browser back) aborts it
	});

	const label = $derived(
		job.status === 'done' ? `Saved ${job.fileName}`
		: job.status === 'cancelled' ? 'Cancelled'
		: job.status === 'error' ? job.error
		: job.progress?.phase === 'compressing' ? 'Building zip..'
		: job.progress?.packagesTotal
			? `${job.progress.packagesDone} / ${job.progress.packagesTotal} packages`
			: 'Starting..'
	);

	const back = () => goto(`/?${page.url.searchParams}`);
</script>

<div class="flex h-dvh items-center justify-center overflow-hidden p-4">
	<div
		class="w-[560px] max-w-full transition-transform duration-200 [&>*]:w-full"
		style:transform="scale({scale})"
	>
		<Card variant="filled">
			<div class="flex flex-col gap-4">
				<WavyLinearProgress percent={job.percent} />
				<span>{label}</span>
				<span class="truncate text-sm opacity-70">{job.logs.at(-1) ?? ''}</span>

				<div class="grid grid-cols-2 gap-2 [&>*]:w-full">
					{#if job.status === 'running'}
						<Button variant="outlined" onclick={job.cancel}>Cancel</Button>
					{:else}
						<Button variant="tonal" onclick={() => job.start(fromSearchParams(page.url.searchParams))}>
							Retry
						</Button>
					{/if}
					<Button variant="tonal" onclick={back}>Back</Button>
				</div>
			</div>
		</Card>
	</div>
</div>