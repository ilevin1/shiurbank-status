# ShiurBank Status

Independent public status page for ShiurBank. The application remains in its separate private repository. This repository contains only the monitor, static page and a synthetic one-second audio fixture. No production application source, real user data or credentials belong here.

## Architecture

- GitHub Pages serves `docs/` at `status.shiurbank.org`.
- A separate GitHub Actions workflow runs synthetic checks on a five-minute schedule. GitHub scheduling is best-effort and may be delayed or dropped; this is not a five-minute detection guarantee.
- Sanitized observations and 90 days of daily aggregates live in `state.json` on the `monitor-data` branch. The page reads that public file from GitHub, never from ShiurBank. Monitoring does not depend on a laptop, the ShiurBank API, Vercel or Supabase to store or serve its history.
- If the monitor, raw-data host or a dependency stops, individual freshness limits turn stale statuses unknown. Previously confirmed incidents stay visible until recovery is observed. GitHub itself is a remaining shared failure domain for monitoring, history and this page.
- Checks run from one external runner location. Two failed scheduled observations open an incident; two successful observations resolve it. A slow observation is degraded. HTTP read failures receive one bounded retry. Ambiguous uploads are never automatically repeated.
- Most core checks run every five minutes; downloads every 15; each upload path every hour. Actual last-check times are shown separately. This checks iOS/Android's shared API path; it does not certify native app startup, offline audio, background playback or share-extension behavior.
- History bars summarize observed checks, not continuous uptime. Gray means no observation. No historical green days or uptime percentages are invented.

## Run and validate

Node 22+; no third-party runtime dependencies or package installation required.

```
npm test
node --env-file=.monitor.env scripts/run.mjs --force
node --env-file=.monitor.env scripts/run.mjs --force --only=auth,audio
```

`output/state.json` is ignored. `--publish` reads and updates the independent branch using `GH_TOKEN`; optimistic file-SHA matching and workflow concurrency prevent overwriting a newer run. A service failure is published before the job exits unsuccessfully. A monitor runtime failure cannot publish a fabricated healthy state.

## Least-privilege monitor identity

Create one dedicated, confirmed Supabase auth user and normal non-owner ShiurBank user, owning only a pending (unlisted) teacher and a private series with lifecycle email eligibility disabled. Do not use a website-owner account, real teacher account or service-role key for recurring checks. A permanent tiny audio fixture lives in that private series.

Store these as repository Actions **secrets**: `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `MONITOR_EMAIL`, `MONITOR_PASSWORD`, `MONITOR_USER_ID`, `MONITOR_TEACHER_ID`, `MONITOR_SERIES_ID`, `MONITOR_SHIUR_ID`, `MEDIA_ORIGIN`. Do not put them in the page, history, workflow logs, issue bodies or git. The Supabase service-role/database credentials are never needed by the deployed monitor.

Each run signs out the monitor sessions it created using local session scope, avoiding accumulation of indefinitely refreshable test sessions. Cleanup never signs out other devices; a sign-out failure is reported as an authentication check failure.

Repository **variables**: `PUBLIC_SERIES_ID`, `PUBLIC_TEACHER_ID`, `SEARCH_QUERY` identify existing public canaries. `ENABLE_UPLOAD_CHECKS=true` enables both write checks after billing review and validation. Missing or disabled checks appear unknown.

## What uploads test

1. Sign in and verify the configured series is still private and owned by the dedicated teacher.
2. Direct path: obtain the normal upload reservation and signed PUT URL through the website, then upload a 1197-byte MP3.
3. Server path: multipart-upload a tiny M4A through the API used by mobile, require a confirmed MP3 conversion, and verify complete MP3 frames and an approximately one-second duration.
4. Use the normal create-shiur endpoint with `suppress_notification:true`, read the private record back, request a signed playback URL, and compare exact bytes at the start and a seek offset. The direct check also verifies the browser's storage CORS preflight. The conversion check reads back the small converted file; neither check processes listener recordings.
5. Permanently delete only the just-created fixture through the normal API and verify the record is gone. A cleanup failure fails the check. A lost create response is reconciled using the exact series, generated title and storage key. Subsequent runs clean up only stale generated test titles within the dedicated series, never the permanent audio fixture.

Uploads do not create public content, notify listeners, run transcription, generate phone audio, trigger purchases or change actual teacher content. The fixture teacher is pending and excluded from the public directory. Privacy and no-subscription invariants must be rechecked if fixture setup changes.

## Incident operations

The page automatically lists detected incidents and recovery. To inspect a failure, open the linked workflow run; output is restricted to check name, allowlisted reason and duration. Fix the affected service, run **Check ShiurBank services** manually (force all checks if required), and verify two successful observations. Do not edit monitoring results to paint a service green. To pause monitoring, disable that workflow; the public page will automatically become unknown after freshness limits expire. Credential rotation uses normal repository Secrets settings.

No emails, SMS, calls, commercial monitoring subscription or AI compute are enabled. GitHub may notify repository watchers of failed runs according to their own settings.

## Costs and quotas

GitHub Pages and standard GitHub-hosted Actions runners are free for this public repository. Larger paid runners, artifact uploads and caches are not used by the monitor. The monitor and its history contain no application secrets; source visibility is intentional.

Existing providers still meter the requests: Railway compute and egress, Supabase compute/egress/auth users, and Wasabi storage subject to account policy. Core traffic is bounded by response limits and check frequency. Each upload path runs at most once an hour normally (about 1440 tiny files/month combined), and deletes its generated content; Wasabi minimum-storage-duration policies can still bill recently deleted files. The direct fixture is 1197 bytes, the M4A source is 4253 bytes and the converted file is about 12 KB. Expected synthetic storage writes are approximately 10 MB/month before provider overhead. No paid account upgrade is implicit.

At launch, a full forced run transferred about 0.22 MB in response bodies; regular runs are smaller because uploads and downloads are less frequent. Expected recurring traffic is under 2 GB/month, excluding abnormal retries and protocol overhead. The disclosed estimate is $0–$2/month of incremental existing-provider usage, depending on allowances; this is not a hard spending cap or a guarantee about the entire ShiurBank bill. No new paid subscription is enabled. Published billing references: [GitHub Actions](https://docs.github.com/en/billing/concepts/product-billing/github-actions), [GitHub Pages](https://docs.github.com/en/pages/getting-started-with-github-pages/what-is-github-pages), [Railway](https://railway.com/pricing), [Supabase](https://supabase.com/pricing), [Wasabi pricing](https://docs.wasabi.com/docs/may-2026-wasabi-pricing), [Wasabi storage-duration policy](https://docs.wasabi.com/docs/how-does-wasabis-minimum-storage-duration-policy-work).

Manual forced runs create additional requests and tiny files. Change cadence or response budgets only after updating the cost estimate. Keep the public repository active: scheduled workflows in public repositories can be disabled by GitHub after 60 days without repository activity; data-branch commits maintain activity during normal operation. A disabled scheduler still results in unknown status, never stale green.

## DNS and rollback

The only required DNS addition is `CNAME status -> ilevin1.github.io`. Reserve the custom domain in Pages settings before adding DNS; enable HTTPS after GitHub provisions its certificate. Keep all existing apex, www, tenant, MX and TXT records unchanged. To roll back, remove only the status CNAME, disable the monitor workflow and disable this Pages site. Do not alter the ShiurBank application deployment or database to roll back the status page.
