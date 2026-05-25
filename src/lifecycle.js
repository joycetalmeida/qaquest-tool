import api from '@forge/api';

const APP_ID = '1b778d0b-6d5a-454f-aa56-15d6d0ea9f93';

/**
 * Lifecycle handler — kept for future use with globalStorage.
 */
export async function handler(event) {
  const type = event?.eventType || '';
  const cloudId = event?.context?.cloudId || event?.cloudId || null;
  console.log(`[QAQuest:lifecycle] event=${type} cloudId=${cloudId}`);
}

/**
 * Fetches the real installation count by querying the Atlassian Forge
 * platform installations endpoint via asApp().requestAtlassian().
 *
 * Endpoint: GET https://api.atlassian.com/forge/app/installations
 * Returns a list of all sites where this app is currently installed.
 */
export async function getInstalledSitesData() {
  try {
    const res = await api.asApp().requestAtlassian(
      `https://api.atlassian.com/forge/app/installations`,
      {
        method: 'GET',
        headers: { Accept: 'application/json' }
      }
    );

    if (!res.ok) {
      const txt = await res.text();
      console.warn(`[QAQuest:lifecycle] Installations API returned ${res.status}: ${txt}`);
      return { count: 0, sites: [] };
    }

    const data = await res.json();
    // Response shape: { installations: [{ cloudId, ... }] } or array directly
    const installations = Array.isArray(data) ? data : (data.installations || data.data || []);
    const sites = installations
      .map((i) => i.cloudId || i.cloud_id || i.siteUrl || i.tenantId)
      .filter(Boolean);

    console.log(`[QAQuest:lifecycle] Platform API returned ${sites.length} installations`);
    return { count: sites.length || installations.length, sites };
  } catch (err) {
    console.error('[QAQuest:lifecycle] Error fetching installation count:', err);
    return { count: 0, sites: [] };
  }
}
