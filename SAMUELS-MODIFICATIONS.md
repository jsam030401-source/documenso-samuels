# Samuels Systems modifications

This is a fork of [Documenso](https://github.com/documenso/documenso) (AGPL-3.0), self-hosted by
Samuels Systems. The upstream `LICENSE` (AGPL-3.0) is preserved and continues to apply to this
modified version; the complete corresponding source is published in this repository in accordance
with AGPL-3.0 §13 (network use).

## Changes from upstream
- **Brand colors** — remapped the theme tokens in `packages/ui/styles/theme.css` to the Samuels
  Systems brass/ink/paper palette, for both light and dark mode.
- **Header theme toggle** — added a visible light/dark toggle button to the app header
  (`apps/remix/app/components/general/app-header.tsx`). The underlying theming is upstream.
- **Footer** — added a "Hosted by Samuels Systems" footer on the app and auth layouts
  (`apps/remix/app/components/general/app-footer.tsx`).
- **Spelling** — changed user-facing English "Organisation" → "Organization" in the English
  catalog only (`packages/lib/translations/en/web.po`, `msgstr` values). Other locales and all
  code identifiers, routes, and database fields are unchanged.
- **Build** — raised the in-container Node heap for the production build (`docker/Dockerfile`) and
  switched the app build to compile-only translations (`apps/remix/.bin/build.sh`).

"Documenso" is a trademark of its respective owners; no affiliation or endorsement is implied.
