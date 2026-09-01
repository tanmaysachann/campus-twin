# Third-party notices

CampusTwin vendors the following browser runtime so the deployed application
does not depend on a public CDN during a demonstration.

## xeokit-bim-viewer and xeokit SDK

- Viewer version: 2.7.1
- Upstream commit: `a86a91a399d4725d77df34ad715f986534d08952`
- License: GNU Affero General Public License v3
- Project: https://github.com/xeokit/xeokit-bim-viewer
- Local license: `app/campus_twin/static/xeokit/LICENSE`
- Source record: `app/campus_twin/static/xeokit/SOURCE_INFO.md`

CampusTwin embeds the official xeokit BIM Viewer application, its xeokit SDK
runtime, and the official Archicad demonstration XKT assets. The viewer entry
page adds a same-origin state bridge for CampusTwin scenario styling and loads
the bundled demonstration project automatically.
