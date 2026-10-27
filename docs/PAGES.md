# User documentation site (GitHub Pages)

Operator-facing HTML lives in [`site/`](../site/), not in this `docs/` folder.
The single-file app is **built in CI** (`frontend` `build:singlefile`) and
published as [`tilari.html`](https://tilari.fi/tilari.html)
next to the guides. Do not commit that generated file.

| Path | Audience | Language |
|------|----------|----------|
| [`site/index.html`](../site/index.html) | People who *use* Tilari | Finnish (default) |
| [`site/en/index.html`](../site/en/index.html) | Same | English |
| [`site/sv/index.html`](../site/sv/index.html) | Same | Swedish |
| [`site/de/index.html`](../site/de/index.html) | Same | German |
| `tilari.html` (CI only) | The app, one file, https | Finnish-first UI |
| This `docs/` tree | Developers and agents | English Markdown |

Architecture of the modes (wasm vs locker vs On the server): [WORKING_MODES.md](WORKING_MODES.md).
Keep that file in sync when you change user-visible save/locker behaviour; then
update all four HTML pages (they are not generated).

`https://…/tilari.html` is a **secure context**: OPFS, in-place save (Chromium
desktop), and the Supabase locker work. The same bytes opened as `file://`
do not. Storage CORS for a Supabase locker must allow this origin.

## Publish

Workflow: [`.github/workflows/pages.yml`](../.github/workflows/pages.yml).
It runs the shared [Test](TESTING.md#ci) workflow first, then copies `site/`,
adds `tilari.html`, copies [LICENSE](../LICENSE) and
[THIRD_PARTY.md](../THIRD_PARTY.md), and uploads the artifact. A failing suite
skips deploy.

In the GitHub repo: **Settings → Pages → Build and deployment → Source:
GitHub Actions**. First publish needs that click (or `workflow_dispatch`).

Paths in the HTML are relative (`styles.css`, `en/`, `sv/`, `de/`, `../`, `tilari.html`) so
the site works at `https://<org>.github.io/<repo>/` and on a custom domain.

Do not point Pages at `docs/` — Jekyll would mix ADRs with the user guide.
The user site is static HTML only (`.nojekyll` is present).

## PR previews

Workflow: [`.github/workflows/pr-preview.yml`](../.github/workflows/pr-preview.yml). Each push
to a PR from a branch of this repo builds `tilari.html` from the PR head and uploads it as the
non-zipped artifact `tilari-pr-<N>.html` (`upload-artifact` v7, `archive: false`). The PR's checks
get a **PR preview** status whose **Details** link opens that file in the browser. Closing or
merging the PR deletes its previews; otherwise they expire after 30 days.

- **Nothing is deployed.** The workflow holds no secret, and its token can only set the status
  and delete artifacts. Fork PRs get no preview (the Test workflow still runs for them).
- **Who can open it:** any signed-in GitHub user who finds the link. Artifact links need a
  sign-in and hand out a signed URL valid for a few minutes, so search engines do not index them.
  A reload after that fails; open the link again.
- **Origin:** the file is served from `https://productionresultssa<N>.blob.core.windows.net`, a
  storage host shared by the artifacts of every GitHub repo. Its OPFS, localStorage and IndexedDB
  are shared with any other HTML artifact opened in the same browser, and with earlier previews.
  It is never the `tilari.fi` origin, so a preview cannot touch the live app's working copies,
  file handles or locker credentials. Test with `testdb/` or a copy, preferably in a private
  window, and do not tick "remember" for locker credentials there.
- The footer links to `LICENSE` and `THIRD_PARTY.md` do not resolve in a preview, and a Tilari
  server only answers it if `TILARI_ALLOWED_ORIGINS` lists that origin.

## Custom domain

Yes. GitHub Pages will serve this site on a hostname you own (apex or
subdomain) and issue HTTPS once DNS is verified.

1. Pick a hostname (for example `tilari.fi`). Pages and the Tilari server locker
   tunnel ([DEPLOY.md](DEPLOY.md)) cannot share one name.
2. **Settings → Pages → Custom domain** — type the hostname, save, wait for
   DNS check, enable **Enforce HTTPS**.
3. DNS at your registrar (or Cloudflare DNS, **DNS only** / grey cloud unless
   you know you want a proxy):

   | Kind | Record | Target |
   |------|--------|--------|
   | Subdomain (`app.example.com`) | `CNAME` | `<org>.github.io` |
   | Apex (`example.com`) | `A` ×4 | `185.199.108.153` `185.199.109.153` `185.199.110.153` `185.199.111.153` |
   | Apex IPv6 (optional) | `AAAA` ×4 | `2606:50c0:8000::153` … `8003::153` |

   GitHub’s current IPs: [Managing a custom domain for your GitHub Pages site](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site).

4. Put the same hostname in `site/CNAME` (one line, no `https://`). The
   workflow copies `site/` into the artifact; without that file a later
   deploy can drop the custom domain. Add the file only after the name is
   chosen.

Supabase Storage CORS must list the custom `https://` origin as well as
`https://<org>.github.io` if you keep both.
