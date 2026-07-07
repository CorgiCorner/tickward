# Contributing

Thanks for helping improve tickward.

## Contribution Workflow

Public issues and pull requests are welcome. The maintainer reviews accepted
changes for inclusion in a future release.

Accepted pull requests are integrated by the maintainer rather than merged
directly. When the shipped change materially includes your commits, your Git
author metadata is preserved wherever practical, often together with follow-up
fixes in separate maintainer commits. If an accepted change must be
substantially rewritten, the maintainer credits the contribution explicitly and
explains the authorship handling in the PR reply. The result ships with the
next release, and your PR is then closed with a comment linking to the release
that contains your change.

## Translations

Translations live in `lib/i18n/locales/`. `en.ts` is the reference catalog.

- A locale catalog must cover the exact key set of `en.ts` — no missing and no
  extra keys. `scripts/i18n-catalog.test.ts` enforces this, and the
  `Record<Locale, …>` type in `lib/i18n/messages.ts` makes an incomplete
  catalog a compile error.
- Never translate `{placeholder}` tokens (`{project}`, `{seconds}`, …), `%s`
  templates, or the product name. Mirror the English casing of the product
  name per key.
- Keep placeholder domains and emails on the IANA-reserved `example.com`
  (e.g. `https://example.com`, `you@example.com` and its localized mailbox
  name). Do not substitute a localized domain — those are real, registrable
  domains.
- Plural families provide `.one`, `.few`, and `.many` variants for every
  locale. At runtime the CLDR plural category is looked up and anything
  without a dedicated key falls back to `.many`, so put your language's
  general plural there and mirror it into variants your language does not
  distinguish.
- To register a new locale, add it to `SUPPORTED_LOCALES` and `OG_LOCALES` in
  `lib/i18n/config.ts` and to `MESSAGES` in `lib/i18n/messages.ts`, then fix
  every `Record<Locale, …>` map the compiler flags.
- Run `npm run lint`, `npm run test`, and `npm run build` before opening the
  PR. Partial translations are still welcome — mark the PR as a draft and the
  remaining keys can be completed during review.

## Before Opening a PR

- Keep changes focused and related to tickward.
- Do not include secrets, production infrastructure details, or account
  credentials.
- Run `npm run lint`, `npm run test`, and `npm run build` with Node 22.
- For Docker changes, run `cp .env.example .env` and `docker compose up --build`.

## License

By contributing, you agree that your contribution is licensed under `AGPL-3.0-only`.
