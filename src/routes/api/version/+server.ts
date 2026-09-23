import { error, json } from '@sveltejs/kit';
import { getClientSettingsUrl, isBinaryType } from '$lib/rdd';

export async function GET({ url, fetch, setHeaders }) {
	const binaryType = url.searchParams.get('binaryType');
	if (!isBinaryType(binaryType)) error(400, 'Invalid binaryType');

	const channel = url.searchParams.get('channel') || 'LIVE';
	const res = await fetch(getClientSettingsUrl(binaryType, channel));
	if (!res.ok) error(res.status, `clientsettings returned ${res.status}`);

	const data = await res.json();
	setHeaders({ 'cache-control': 'public, max-age=60' });
	return json({ version: data.clientVersionUpload });
}