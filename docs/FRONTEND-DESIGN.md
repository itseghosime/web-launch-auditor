# Launch Auditor frontend

## Design contract

The first screen is a working audit form, not a separate marketing page. The primary action is “Audit my site.” A warm paper palette, orange actions, and humanist Lato typography make the interface approachable. Monospace is reserved mainly for URLs, code, and technical values. The illustrative social card is labeled as an example; its score is not a real scan result.

Desktop target: 1440 × 900. Mobile target: 390 × 844. The form, crawl limits, feedback style, history, and report actions must remain usable without horizontal overflow. The live network remains visible during scanning and after completion. Users can choose pages through graph nodes or a labeled select. Reduced-motion mode retains a static graph.

Reference: https://www.opengraph.to/ — its immediate URL input and social-preview emphasis informed the direct workflow. This project’s added value is its existing crawl, localhost relay, launch checks, fix prompts, and saved reports. No claim of benchmark superiority is made.

## Implemented feature inventory

| Existing capability | Frontend surface |
| --- | --- |
| Public URL audit; persistent queue and progress | Main form, compact scan toolbar, running inspector |
| Page limit 1–20; depth 0–3 | Labeled controls, including previously omitted depth zero |
| Bounded same-origin crawl and page errors | Animated network, page selector, individual error notices |
| Titles, descriptions, canonical metadata | Findings with category and severity filters |
| Main headings, document language, image alt attributes | Structure and accessibility findings |
| Open Graph title, description, image, URL | Four-platform social simulator |
| X, WhatsApp, LinkedIn, iMessage previews | Platform buttons and missing-image states |
| Localhost browser relay | Automatic local-URL handling and setup dialog |
| Tunnel and CORS fallback | Copyable setup instructions and tunnel-URL field |
| Placeholder text, local references, source-map hints, empty anchors | Launch-leak and link findings |
| Framework detection | Stack label and framework context in prompts |
| Score and prior-scan comparison | Score banner, delta and rule comparison, history compare control |
| AI fix prompt | Copy to Cursor / Claude action |
| Markdown fix list and JSON export | Report action group |
| Shareable snapshot and README badge | Share dialog and redesigned `/r/[id]` page |
| Saved scans, search, retry, deletion | History drawer, rerun and delete actions |
| Feedback personas | Gentle Peer, Strict QA, Roast Mode; browser preference persistence |
| Keyboard shortcuts | `/` to focus, modifier + Enter to scan, Escape to dismiss/reset |
| Check-group controls | Actual report filters; all backend checks still run |

Not implemented by this design work: browser extension, companion CLI, scheduled scans, public gallery, universal link-target validation, performance scoring, or accessibility/security certification. Local relay currently discovers links from the initial page rather than recursively following all selected depth levels. These are existing product boundaries, not hidden frontend features.

## Content states

- Loading: scan status and network remain visible while results arrive; public reports have a loading message.
- Empty: the working audit form and an empty-history message provide a next action.
- Error: backend outage has retry; failed pages remain visible alongside available findings; expired public reports link back to a new audit.
- Partial: available findings are retained when another page cannot be fetched.
- Success: results expose fixes, export, rerun, and share actions.
- Browser access restriction: localhost CORS setup supplies alternatives; modal focus is contained and Escape returns to the prior control.

## Verification

Browser tests use controlled API responses and capture artifacts in `frontend/design-evidence/`. They cover the scan lifecycle, filtering, export, retry/deletion, backend recovery, localhost help, social tabs, prompt copying, report sharing, public reports, mobile layout, keyboard interaction, network animation after completion, and reduced motion. Screenshots are local review artifacts and ignored by git.

Production build and TypeScript checks are required. Backend fixture tests guard the preserved scanner behavior. Live external crawling and production deployment are separate from these controlled browser checks.
