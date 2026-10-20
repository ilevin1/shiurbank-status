export const CHECKS = [
  { id: 'website', name: 'Website', description: 'The homepage and its JavaScript load.', everyMinutes: 5, slowMs: 8000 },
  { id: 'catalog-web', name: 'Browsing on the website', description: 'A known public series and its shiurim load through the website.', everyMinutes: 5, slowMs: 5000 },
  { id: 'catalog-mobile', name: 'Mobile app services', description: 'The direct API used by iOS and Android returns real catalog content. Installed-app behavior is not covered by this check.', everyMinutes: 5, slowMs: 5000 },
  { id: 'search', name: 'Search', description: 'A known teacher appears in a real search response.', everyMinutes: 5, slowMs: 4000 },
  { id: 'auth', name: 'Sign-in & account access', description: 'A dedicated account signs in, refreshes its session and loads its profile. Anonymous access to its private audio is denied.', everyMinutes: 5, slowMs: 8000 },
  { id: 'audio', name: 'Audio playback & seeking', description: 'A private audio fixture is retrieved through the normal signed-URL API, with byte-for-byte start and seek checks. Device background playback is not covered.', everyMinutes: 5, slowMs: 8000 },
  { id: 'downloads', name: 'Audio downloads', description: 'The normal authenticated download endpoint returns a small playable MP3.', everyMinutes: 15, slowMs: 15000 },
  { id: 'upload-direct', name: 'Direct uploads & publishing', description: 'Upload a tiny MP3 through the normal presigned route, publish privately, verify its bytes and remove the test content.', everyMinutes: 60, slowMs: 30000 },
  { id: 'upload-server', name: 'Uploads through the server', description: 'Send a tiny audio file through the normal multipart upload route, publish privately, verify it and remove the test content.', everyMinutes: 60, slowMs: 30000 },
];
export const LABELS = { operational: 'Operational', degraded: 'Degraded', outage: 'Outage', unknown: 'Unknown', maintenance: 'Maintenance' };
export function staleAfterMs(check) { return Math.max(20, check.everyMinutes * 2 + 10) * 60000; }
