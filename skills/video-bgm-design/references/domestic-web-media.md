# Domestic Public-Web Audio Discovery

This is a discovery route for background music and sound effects. It is not a
license grant and it is not permission to scrape arbitrary platforms.

## Capability contract

The runtime may expose a provider-neutral capability with these atomic actions:

- `search`: search Chinese-language public pages using mood, instrument,
  duration, effect category, and rights keywords.
- `fetch_page`: read the public source page and its visible reuse/license text.
- `license`: normalize the rights evidence and intended-use restrictions.
- `download`: materialize the selected file into the task workspace only when
  the capability has verified download permission.

Every response records `provider`, `capability`, execution identity, source URL,
site name, accessed time, license-page URL or quoted source location, download
permission, file path, and SHA-256 when a file is downloaded.

## Hard boundaries

- Search results are candidates until rights evidence is verified.
- Do not bypass login, CAPTCHA, paywalls, hotlink restrictions, robots, or site
  terms; do not use arbitrary `curl`, `wget`, scraper scripts, or runtime URLs.
- A source that merely plays audio, embeds a preview, or says “free download”
  without reusable-rights terms is not verified authorization.
- `domestic_web_verified` is allowed in the final manifest only when the source
  page, license terms, download permission, access time, and file hash are all
  present.
- If the capability is unavailable or rights remain unclear, keep the
  candidate evidence and stop the audio stage with a recoverable failure.
