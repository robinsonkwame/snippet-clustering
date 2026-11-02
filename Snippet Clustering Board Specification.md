# Value Matrix Board: Specification

Nov 2, 2026 · @Kwame

## Purpose and scope

The board is a shared, infinite-canvas tool that lays the Stage 3 snippets out as a matrix, one column per value code and one row per stakeholder side, so the team can derive categories inside each cell. The sensitizing codebook frames the analysis and the categories refine it, which is the logic of directed content analysis (Hsieh & Shannon 2005). No LLM sorting pass is used.

The board produces categories inside each cell (code × side) with names, definitions and exemplars; shared category labels that show where a category recurs across sides or codes; a note per cell; relations between categories; and a complete log of who moved, recoded or wrote what, and when. The cells and their categories are Figure 5, the multilevel typology, and Table 2. The relations feed the Discussion. The log extends the correction record into axial coding for Appendix D.

Scale, from the current review sheet (before Ahmed's adjudication): 2,619 retained snippets, 1,421 of them with more than one code. One card per snippet per code gives 4,972 cards in 116 non-empty cells. The largest cells are buyer G5 (470 cards), buyer G1 (311), multi G5 (290) and multi G1 (205); 24 cells hold fewer than five.

Out of scope for this tool:

- Coding relations inside the paper text itself.
- Statistics and charts; the co-word and matrix scripts read the board's exports.
- Editing snippet text, page or stance. Codes and sides can be changed on the board, as logged recodes (Section 5).

## Users, roles and workflow

Three named people use the board; nobody else can open it. Every action is attributed to a logged-in person.

| Person | Role | Can do |
| --- | --- | --- |
| Kwame | Admin | Everything editors can, plus import data, lock and unlock the board, restore snapshots, export final files |
| Malak | Editor, developer, backup runner | Move and copy cards; create, merge, split and define clusters; write notes and comments; take snapshots and run the off-site backup |
| Ahmed | Editor | Move and copy cards; create, merge, split and define clusters; write notes and comments |

A board session runs in this order:

1. Prepare the snippet file from the adjudicated review sheet and Malak's multi marking (script, Section 3 format).
2. Admin imports it. The board lays every card out in its code column and side row (Section 4). The import is the logged starting state.
3. Work cell by cell, together on a call or separately: read the cards, form category piles inside the cell, name and define them, star exemplars. Recode a card when it belongs in another column or row.
4. Give categories that recur in other cells the same shared label, and write a note for each cell.
5. Admin freezes the categories (e.g. "categories v1"). Relations between categories are then drawn in Relate mode.
6. Admin locks the board, takes a named snapshot, and exports the CSV files.
7. The exports feed Figure 5, Table 2, the co-word script and the Discussion. Changes after a lock start a new board version.

## Input data: the snippet file

The board imports one JSON file, `snippets.json`, with one record per snippet. A build script creates it from the adjudicated review sheet (`choice` column applied) and Malak's multi party marking. The board never edits these fields; they are read-only on every card.

| Field | Type | Required | Rule or example |
| --- | --- | --- | --- |
| `snippet_id` | string | yes | Unique. `paper_id` + `\|` + `highlight_id`, e.g. `xie_2025_it_s_a_comparison_game\|E019` (highlight IDs repeat across papers) |
| `paper_id` | string | yes | Folder name of the paper, as in the review sheet |
| `highlight_id` | string | yes | `E019` |
| `cite` | string | yes | Short citation shown on the card, e.g. `Xie 2025` |
| `text` | string | yes | Full verbatim quotation; 1 to 2,000 characters. Cards show the quotation itself; nothing is summarized |
| `codes` | array of strings | yes | Final codes after adjudication, e.g. `["G1","F1"]`. Codebook IDs or `NEW: <label>`. Each code places a card in that code's column (Section 4) |
| `side` | string | yes | One of `buyer`, `brand_seller`, `platform`, `community`, `multi` |
| `multi_pairs` | array of strings | if `side` is `multi` | Pair columns marked `discussed`, e.g. `["buyer_seller","seller_platform"]`, or `["unattributed"]` |
| `stance` | string | yes | One of `documents`, `proposes`, `critiques`, `measures` |
| `page` | integer | no | Page number in the paper |
| `memo` | string | no | The AI memo, shown in the expanded card |
| `reviewer` | string | yes | Stage 3 reviewer: `Kwame` or `Malak` |
| `source_version` | string | yes | Name of the review sheet export, e.g. `review_sheet_adjudicated_2026-11-20` |

The file also carries a header object with `dataset_version`, `created_at` (ISO 8601, UTC) and `created_by`. A second small file, `codebook.json`, lists each code's `id`, `name` and first-sentence `definition` for hover text on code chips.

Import validation rejects the whole file, with a report, when any `snippet_id` repeats, a required field is empty, `side` or `stance` is outside its list, or a code is neither a codebook ID nor a `NEW:` label.

Example record:

```json
{
  "snippet_id": "xie_2025_it_s_a_comparison_game|E019",
  "paper_id": "xie_2025_it_s_a_comparison_game",
  "highlight_id": "E019",
  "cite": "Xie 2025",
  "text": "<verbatim quotation from the paper>",
  "codes": ["G1"],
  "side": "brand_seller",
  "multi_pairs": [],
  "stance": "documents",
  "page": 9,
  "memo": "<AI memo>",
  "reviewer": "Kwame",
  "source_version": "review_sheet_adjudicated_2026-11-20"
}
```

The page number in this example is illustrative, not taken from the paper.

## Matrix layout

Import lays every card out on a grid from its codes and side. There is no pre-placement file and no LLM sorting pass.

- **Columns:** one per codebook code, in codebook order (A1 to G5), with a header band naming each source tradition (Holbrook; Sheth, Newman and Gross; Belk; Vargo and Lusch; Muñiz and O'Guinn; Han, Nunes and Drèze; NFT-specific). After G5 come one column per committed new code (hedging) and an "Other new codes" column for uncommitted `NEW:` labels.
- **Rows:** buyer, brand seller, platform, community, then the multi rows (next table).
- **Cards:** one per snippet per code. A snippet coded G1 and F1 gets a card in each column. These are linked copies (Section 5), and each counts fully in its cell.
- **Cells:** each column-row crossing. A cell grows to fit its cards and category piles; a collapsed cell shows its card count and category names. An empty cell stays visible, greyed, so gaps show.

Multi cards follow a board-wide toggle. It changes the view, not the data, and is not logged as an edit.

| Toggle setting | Where a multi card appears | Used for |
| --- | --- | --- |
| Pairs as rows (default; the sorting view) | In one row per multi pair present (B+S, S+P, B+P, B+C, S+C, P+C), plus a "multi, unattributed" row | Forming categories: every card sits in exactly one cell, so it is sorted once |
| Split into sides (reading view) | Copied into each side row of its pair, e.g. a B+S card shows in the buyer row and the brand seller row, with a pair badge and its category label | Reading each side's full evidence, and the side counts for Figure 5 |

Categories are formed in the pairs-as-rows view. In the split view, multi cards carry their category labels into each side row, so nothing has to be sorted twice.

## Canvas and interaction

The canvas is infinite in both directions, with pan (drag on empty space or trackpad), zoom (wheel or pinch, 5% to 400%), a minimap, a "fit all" button, and a "go to cell" box (type `G1 buyer`). Column and row headers stay pinned to the screen edges while panning. Four kinds of object live on it.

| Object | What it is | What people do with it |
| --- | --- | --- |
| Card | One snippet under one code | Drag within its cell, recode by dragging to another cell, copy, open to read in full, star as exemplar, comment on |
| Cell | One code × side crossing, holding cards and category piles | Open in focus mode, write the cell note, collapse |
| Category pile | A category inside a cell: a titled container of cards | Create, name, define, label, merge, split, archive |
| Note | A free sticky note, not tied to any card | Write, move, colour, delete (soft delete, logged) |

**Cards.** A collapsed card is 280 px wide and shows the first five lines of the verbatim quotation (cut at a word, with a fade; never summarized), the short citation, and the side. Side is shown twice so colour is never the only signal: a coloured left stripe and a letter badge (B buyer, S brand seller, P platform, C community, M multi; a multi card shows its pair badge, e.g. B+S). A recoded card also shows a small "recoded from G1" badge. Clicking a card opens a side panel with the full quotation, page, stance, memo, all of the snippet's codes, Stage 3 reviewer, the comment thread, and its history (Section 7).

**Recoding.** Dragging a card into another column changes its code; dragging it into another row changes its side. Either asks for a one-line reason and is logged as a recode, not an ordinary move, and feeds the correction log for Appendix D. The card's side panel lists every recode with person, time and reason, and a **Revert** button undoes the latest one: the card returns to its previous cell, and to its previous category pile if that pile still exists (otherwise to the cell's uncategorized area). A revert is itself logged. Adding a code to a snippet is a copy followed by a recode of the copy.

**Copies.** Import makes one linked copy per code, so a multi-coded snippet already sits in each of its columns. A + icon on a card makes a further copy, for a snippet that belongs in two category piles of the same cell. Copies share the snippet's ID and carry a copy number; each shows a "1 of 3"-style badge, and clicking the badge highlights the other copies. A copy's × icon removes it (logged); the last copy cannot be removed. Comments belong to the snippet and show on every copy; stars belong to the copy, since an exemplar is chosen for a category. Every copy counts fully in its cell and category.

**Categories inside a cell.** A new cell holds its cards in an uncategorized area. People form category piles inside the cell; a pile cannot hold cards from another cell. A pile shows its name, the number of cards and papers, and its starred exemplars. Its side panel holds the fields that become the category definition: `name`, `definition`, `inclusion note` (what belongs and what does not), and the exemplars.

**Shared category labels.** A category that recurs in other cells (the same idea in buyer G1 and brand seller G1, or in G1 and F1) gets the same label from a board-wide label list, while each cell keeps its own pile and definition. Clicking a label highlights every pile that carries it. This shows, column by column, where a category appears at several levels, and lets a category that cuts across codes be read as one. Pile operations:

- Create: select cards in a cell and press "New category".
- Label: pick a shared label from the list, or make a new one.
- Merge: drag one pile's title onto another in the same cell; the panel asks which name and definition to keep and stores the other in the log.
- Split: select cards inside a pile and press "Split out".
- Archive: removes an empty or rejected pile from the cell; it stays in the category list and the log.
- Layout inside a pile: grid or stack, sorted by paper, by stance, or by date added.
- Focus mode: double-clicking a cell opens it full screen, with the uncategorized cards on the left and the piles on the right. Large cells (buyer G5 holds 470 cards) are sorted here.

**Looking inside a pile before adding to it.** Anyone must be able to read what a pile holds before deciding whether a card belongs there, without moving anything:

- **Open in place.** Double-clicking a pile expands it on the canvas into a readable grid of its cards, at full card size, whatever the current zoom. Pressing Esc or clicking outside collapses it again. Expanding and collapsing are not logged.
- **Pile panel.** Clicking a pile's title opens its side panel: name, definition, inclusion note, starred exemplars at the top, then a scrollable list of every card's opening lines, citation and side badge. Clicking an entry opens that card's full quotation.
- **Compare while holding a card.** With one card selected, opening a pile's panel shows the selected card pinned at the top of the panel, so it can be read against the pile's definition and exemplars. A "Move here" button in the panel files it.
- **Peek on hover.** Hovering over a collapsed pile for half a second, or holding a dragged card over it, shows a preview: the definition's first line, the three exemplars (or the first three cards), and the count by side. Releasing the card files it; moving away cancels.
- **Two piles side by side.** The side panel can hold two piles at once in columns, for deciding between two candidate piles or before a merge.

**Selection and moves.** Shift-click and lasso select several cards. Dragging a selection moves all of it. Every move, merge or split is one undoable step for the person who made it (undo and redo with Ctrl/Cmd+Z and Shift+Ctrl/Cmd+Z).

**Find and filter.** A search box matches quotation text, citation and memo, and highlights matching cards (others dim). Filters: code, side, multi pair, stance, paper, Stage 3 reviewer, starred, copied, recoded, uncategorized, shared label, has comments, and "moved by" a person.

**Overview zoom.** Below 25% zoom, cards disappear and each cell becomes a tile shaded by card count, showing its count, the share of cards already categorized, and its category names. The board then reads as a heatmap of the matrix, a working draft of Figure 5. Between 25% and 50%, cards render as small dots coloured by side; above 50%, cards show their text.

## Cell notes and relations

Cell notes and relations are made on the same board, so each stays tied to categories and snippets. The toolbar switches between two modes, **Sort** and **Relate**. Before relations are drawn, the admin freezes the categories (e.g. "categories v1"), so relations point at stable category IDs.

**Cell notes.** Each cell has a note for the conditions under which that value form is documented at that level, and for how its categories differ. Read across a column, the notes and categories give Figure 5, the multilevel typology: the same value form answered at each level and side.

- Dragging a card onto a cell note cites it as evidence (stored as its `snippet_id`).
- An LLM may draft a cell note from the cell's cards and category definitions. The draft is labelled as such until a person edits and accepts it.
- In the split-into-sides view, a cell note can also be read per side for the multi cards it contains.

**Relate two categories.** Relations between categories feed the Discussion (manuscript Section 6), where integration across value forms is addressed; Relate mode records them as they come up. Dragging from one category pile to another, in the same column or across columns and rows, draws an arrow. Opening the arrow shows the two categories side by side with their definitions and cards, plus a relation form:

| Field | Values | Notes |
| --- | --- | --- |
| From, To | Two category piles; each carries its cell (code and side) | e.g. engineered scarcity (G1, brand seller) to status display (F1, buyer) |
| Relation | leads to, enables, constrains, moderates, mediates, amplifies, dampens | A draft set, to be confirmed when Discussion work begins |
| Direction | one way, both ways | "Or vice versa" is both ways; two arrows if the conditions differ by direction |
| Condition or context | Free text | e.g. "when the collection is tied to a luxury brand" |
| Third category | Optional | The moderator or mediator, for those relation types |
| Mechanism note | Free text | The reasoning, in SDL terms where they apply (actor, resource, institution) |
| Evidence | Cards dragged onto the arrow | Each card keeps its stance, so the arrow shows how many documents, measures or proposes |
| Basis | asserted in the literature, inferred by the team | A relation with no evidence cards must be "inferred by the team"; inferred relations are proposition candidates |
| Status | proposed, agreed, rejected | Set after discussion |
| Author, date | Automatic |  |

Arrow width grows with the number of evidence papers; inferred relations are dashed. Filters show only asserted or only inferred relations, or only cross-level ones (lanes on different sides).

**Proposition list.** Any agreed relation can be marked as a proposition candidate with draft wording. The list exports as `propositions.csv`, each row linked to its relation and evidence, for manuscript Sections 5.4 and 6.

**Rules in Sort mode that keep this work cheap later:**

- Category IDs are never reused. A merge keeps one ID and retires the other.
- Splitting, merging or relabelling a frozen category that has relations flags them for review instead of deleting them.
- Evidence points at the snippet, not the card's position. If an evidence card is later moved or recoded, the note or relation shows a warning.

## Multi-user collaboration

Up to five people can work on one board at the same time, live, without overwriting each other's work.

- **Presence.** An avatar row shows who is signed in to the board, refreshed on every poll. Clicking an avatar jumps to that person's current view, which helps on a call. Live cursors are not included (Section 11).
- **Live updates.** A move, rename or note made by one person appears for everyone else within about two seconds, through polling of the event log.
- **Soft locks.** While someone drags a card or edits a pile's definition, that object shows their colour and name, and others cannot grab it. Locks are stored in the database, so every browser sees them on its next poll. A lock releases on drop, on closing the panel, or after 30 seconds of inactivity.
- **Conflicts.** If two changes to the same object arrive together, the Function applies them in order of arrival. Both are kept in the log, the later one is flagged as a conflict, and the person whose change was overtaken sees a notice.
- **Comments.** Cards and piles each carry a comment thread with author and time. A comment can be marked resolved. Comments are separate from pile definitions, so discussion does not clutter the category text.
- **Follow mode.** On a call, the admin can turn on "follow me" so everyone's view tracks the admin's canvas position.
- **Lost connection.** If polling fails, the board shows a banner and blocks edits until it reconnects, so no one works on a stale copy. Offline editing is not required.

## Audit log

Every change is written to an append-only event log before it shows on screen. Events are never edited or deleted, including by the admin, and the current board state can be rebuilt by replaying the log from event zero (the import).

| Event field | Type | Example |
| --- | --- | --- |
| `event_id` | integer, increasing | `1843` |
| `board_version` | string | `v1-pilot` |
| `at` | ISO 8601, UTC | `2026-11-24T19:42:07Z` |
| `user` | string | `malak` |
| `session_id` | string | one per sign-in |
| `action` | enum (list below) | `card_move` |
| `target_type` | `card`, `pile`, `note`, `board` | `card` |
| `target_id` | string | `xie_2025_it_s_a_comparison_game\|E019` |
| `before` | object | `{"pile":"P07","x":120,"y":40}` |
| `after` | object | `{"pile":"P12","x":64,"y":300}` |
| `conflict` | boolean | `false` |

Logged actions: `import`, `card_move` (within a cell, into or out of a category), `card_reposition` (inside a pile; stored but filtered out of history views by default), `card_recode` (to another column or row, with reason), `card_recode_revert`, `card_copy`, `card_copy_remove`, `card_star`, `category_create`, `category_rename`, `category_define`, `category_label`, `category_merge`, `category_split`, `category_archive`, `label_create`, `label_rename`, `cell_note_edit`, `cell_note_accept`, `note_create`, `note_edit`, `note_delete`, `comment_add`, `comment_resolve`, `categories_freeze`, `relation_create`, `relation_edit`, `relation_status`, `relation_remove`, `evidence_add`, `evidence_remove`, `proposition_edit`, `board_lock`, `board_unlock`, `snapshot_create`, `snapshot_restore`, `backup_download`, `export`, `sign_in`. The multi view toggle is not logged, since it changes no data. A card's `target_id` is the snippet ID plus its copy number, e.g. `xie_2025_it_s_a_comparison_game|E019#2`.

The log is visible in three places:

- **Card history**, in the card's side panel: every pile the card has been in, who moved it, when, and any comment made at the time. This answers "where did this go and who put it there".
- **Pile history**, in the pile's panel: renames, definition edits (with the old text), merges and splits.
- **Board activity feed**, a filterable list of all events by person, action and date, with a "jump to" link for each.

The log exports as `events.json` and as `events.csv` (one row per event, `before` and `after` flattened to text). For Appendix D, a summary export counts events by person and action, and lists every recode and revert, and every category merge and split.

## Backups and recovery

No action on the board, by anyone, can lose work that is more than 15 minutes old. Backups exist in two places so that a hosting failure does not take them with it.

| Backup | When | Kept | Where | Run by |
| --- | --- | --- | --- | --- |
| App snapshot | Every 15 minutes while edits are happening, written by a scheduled Function | 30 days | CSV files in Netlify Blobs | Automatic |
| Named snapshot | When someone takes one (e.g. "before merge session 3"), and automatically on every lock | Forever | CSV files in Netlify Blobs | Malak, or Kwame |
| Netlify backup | Once a day, plus one on each production deploy | 3 days on Free, 7 on Personal, 30 on Pro | Netlify; restored only by the Team Owner, and a restore replaces the whole database | Automatic |
| Off-site copy | Each working day, plus after every lock | Forever | The project folder on Kwame's computer, as a ZIP of the snapshot's CSV files | Malak takes and checks the snapshot; the ZIP is downloaded to Kwame's computer |

Netlify's own backups have no point-in-time restore, and restoring one loses every change made after it, so they are a last resort. Day-to-day restores use the app's snapshots.

A snapshot is the full set of CSV files in Section 9, stored together in Netlify Blobs under one timestamped name and downloadable as one ZIP. CSV keeps every backup readable in a spreadsheet without the app.

Restoring never overwrites history. The admin picks a snapshot, sees a preview of the board as it was, and confirms. The restore becomes a new `snapshot_restore` event, and the board state after it is a copy of the snapshot; every event in between stays in the log.

As a last resort, the board can be rebuilt from the files on Kwame's computer alone: import `snippets.json`, then load the latest snapshot's CSV files. Malak should test this rebuild once on the mock data before real data goes on the board.

## Outputs

The admin's "Export" button writes nine CSV files, named with the board version and date, e.g. `v1-pilot_2026-11-24_assignments.csv`.

| File | One row per | Columns |
| --- | --- | --- |
| `assignments.csv` | card (one per snippet per code, plus extra copies) | `snippet_id, copy, paper_id, highlight_id, cite, original_code, code, original_side, side, multi_pairs, stance, recoded, category_id, category_name, shared_label, exemplar, last_moved_by, last_moved_at` |
| `categories.csv` | category pile | `category_id, cell_code, cell_side, name, definition, inclusion_note, shared_label, n_cards, n_snippets, n_papers, exemplar_ids, created_by, last_edited_by, last_edited_at, status (active, archived or retired)` |
| `cell_notes.csv` | cell | `code, side, note, evidence_snippet_ids, n_cards, n_papers, n_categories, llm_draft, accepted_by, accepted_at` |
| `recodes.csv` | recode or revert | `event_id, snippet_id, copy, from_code, to_code, from_side, to_side, reason, by, at, reverted` |
| `notes.csv` | note or comment | `id, type, attached_to, author, at, text, resolved` |
| `events.csv` | event | The fields in Section 7, `before` and `after` as text |
| `positions.csv` | card, pile or note | `id, type, x, y` |
| `relations.csv` | relation | `relation_id, from_category, to_category, relation, direction, condition, third_category, mechanism_note, basis, status, evidence_snippet_ids, n_evidence_papers, n_documents, n_measures, n_proposes, n_critiques, author, created_at` |
| `propositions.csv` | proposition candidate | `proposition_id, relation_id, wording, author, edited_at` |

How the outputs are used downstream:

- **Figure 5 and Table 2.** A script reads `categories.csv`, `cell_notes.csv` and `assignments.csv` and writes one cell per code × side: category names, card, snippet and paper counts, exemplar citations, and the cell note. Side counts use the split-into-sides view, so a multi card counts under each side of its pair. Every copy counts fully in its cell and category; paper counts use distinct papers.
- **Co-word script.** `coword_crosslevel.py` needs one change: a new `--assignments` option that reads `assignments.csv` and uses side plus category (or side plus shared label) as its items, so co-occurrence can be read at category level.
- **Discussion.** `relations.csv` and `propositions.csv` feed manuscript Section 6, where integration across value forms is taken up.
- **Appendix D.** `recodes.csv`, `events.csv` and the move summary from Section 7.

## Usability and readability

Someone who has never seen the board should be able to move a card, make a pile and leave a note within five minutes, without instructions from another person.

| Requirement | Target |
| --- | --- |
| Card text size | 14 px quotation text, 15 px full quotation in the side panel, line height 1.45 |
| Card width | 280 px collapsed; the side panel is 420 px |
| Contrast | Text at WCAG AA (4.5:1) on cards, panels and notes, in light and dark mode |
| Side colours | Distinguishable for common colour blindness, always paired with the letter badge |
| Core actions | Move a card, create a pile, add a note, open a card: one gesture or one click each |
| Labels | Plain words on every button ("New pile", "Split out", "Export"); icons only beside words |
| Help | A help panel listing every gesture and shortcut; a one-screen tour on first sign-in |
| Keyboard | Arrow keys move a selected card between piles in the pile list; Enter opens a card; Esc closes panels |
| Performance | 6,000 cards pan and zoom smoothly (30 frames per second or better) on a recent laptop; the board loads in under 5 seconds |
| Browsers | Current Chrome, Safari, Edge and Firefox on desktop; a tablet can view and comment |

The interface should stay quiet: white or near-white canvas, thin borders, one accent colour for selection, no shadows or gradients. Colour is reserved for side and for a person's presence, so it always means something.

## Architecture and hosting

The board runs entirely on Netlify: the web app on Netlify hosting, the API on Netlify Functions, and the data in Netlify Database, a managed Postgres database generally available on credit-based plans since 28 April 2026. Browsers never connect to the database directly; every read and write goes through a Function that first checks the person's sign-in.

&#91;embedded content: board architecture · app host, shared database, imports and exports\]

Netlify Database documents no live subscriptions, and Functions answer one request at a time, so live updates work by polling. Each browser asks a Function every one to two seconds for events newer than the last one it has. The append-only event log makes this one cheap query, and with three to five people boards stay in step within about two seconds. Live cursors are dropped; presence is a list of who is online and who holds each soft lock.

| Layer | Choice | Notes |
| --- | --- | --- |
| Web app | React single-page app on Netlify hosting | Private repository; no real data in the repository or the build |
| Canvas | React Flow (`@xyflow/react`), MIT licence | Built-in pan, zoom, minimap, drag and multi-select, and an option to render only visible cards. Konva (MIT) is the fallback if the 6,000-card test lags |
| API | Netlify Functions, one endpoint per action: sign-in, import, move, copy, pile edit, note, comment, relation, events-since, snapshot, export | Each call checks the session, then writes the change and its event in one transaction |
| Data | Netlify Database (Postgres) | Credit-based plans only. Default sleep setting: the database pauses after 5 idle minutes and the first request after that waits for it to resume, which is acceptable |
| Snapshots | Netlify Blobs, as CSV files | Downloadable as a ZIP for the off-site copy |
| Sign-in | Each person signs in with their Wayne State access ID, checked by a Function against a hash stored in the `users` table | Access IDs are used across university systems and are not secret, so anyone who knows one could sign in as that person. A board passcode entered alongside the access ID would close this (open decisions). Sessions: random tokens in an HTTP-only, secure cookie, stored in `sessions`, 12-hour expiry; five failed attempts lock sign-in for 15 minutes. The IDs themselves are not written in this document or the repository |
| Live updates | Polling the event log every 1 to 2 seconds | If this feels slow on a call, a hosted realtime service can be added later for presence only |
| Environments | Two separate Netlify projects, mock and real | Deploy previews copy the production database, so a preview of the real project would carry real data; mock work stays in its own project |

Database tables: `snippets` (read-only after import), `cards` (one row per copy: snippet, copy number, original and current code and side, current category and position), `categories`, `category_labels`, `cell_notes`, `notes`, `comments`, `locks` (with expiry times), `relations`, `relation_evidence`, `propositions`, `events`, `users` (the three people, their roles and sign-in hashes), `sessions`. The `events` table accepts inserts only: the database role the Functions use is granted INSERT and SELECT on it, with UPDATE and DELETE revoked, so no code path can rewrite history. Snapshots live in Netlify Blobs, not in the database.

Access and data handling: the snippets are verbatim quotations from copyrighted papers and the coding is unpublished, so the site is never public. Every page and every Function requires sign-in, search engines are blocked, and the admin can revoke a person's access at once. Netlify team members with the Owner or Developer role can also view the production database in the Netlify dashboard (Developers read-only), so the Netlify team should include only Kwame and Malak.

Sources, checked 2 November 2026: [Netlify Database GA](https://www.netlify.com/changelog/2026-04-28-netlify-database/), [overview](https://docs.netlify.com/build/data-and-storage/netlify-database/), [API reference](https://docs.netlify.com/build/data-and-storage/netlify-database/api/), [backup and recovery](https://docs.netlify.com/build/data-and-storage/netlify-database/backup-and-recovery/), [access control](https://docs.netlify.com/build/data-and-storage/netlify-database/access-control/), [sleep on inactivity](https://docs.netlify.com/build/data-and-storage/netlify-database/configure-sleep-on-inactivity/), [Netlify Identity deprecation](https://netlify.com/changelog/deprecation-netlify-identity).

## Mock data and staged rollout

The board goes live on mock data first. No real quotation is uploaded until the acceptance tests below pass and access control is confirmed.

**Mock dataset.** A script generates `mock_snippets.json` with 300 invented snippets: invented sentences about NFT value (no text copied from any paper), invented paper IDs such as `mock_paper_017`, real codebook IDs at the real rate of about 1.9 codes per snippet (about 570 cards), and the real proportions of sides (about 51% buyer, 32% multi, 11% brand seller, 4% platform, 2% community), with multi pairs assigned at random.

| Phase | Data | Goal | Who |
| --- | --- | --- | --- |
| 0. Mock | 300 mock snippets | Build and pass the acceptance tests | Malak builds; Kwame tests |
| 1. Pilot | 300 real snippets, a sample stratified by side and code, from the adjudicated sheet | Check that pile-level sorting works and that cards are readable | Kwame and Malak, one or two sessions |
| 2. Full | All adjudicated snippets (about 2,600) | Produce the categories for Section 4.1 | Whole team |

Acceptance tests for phase 0:

- [ ] Import of the mock file succeeds; an import with a duplicate `snippet_id` is rejected with a readable report
- [ ] Every card lands in its code column and side row; a snippet with three codes appears as three linked copies
- [ ] The multi toggle switches between pairs as rows and split into sides without changing any data
- [ ] Three people signed in at once see who is online and each other's moves within two seconds
- [ ] Two people dragging the same card: one gets the lock, the other sees whose it is
- [ ] Create, name, define, label, merge, split and archive a category; each appears in the category history. A pile's contents can be read (in place, in the panel, side by side, and by hover peek) before a card is dropped into it
- [ ] Recode a card to another column and to another row, each with a reason; Revert returns it to its previous cell and pile; all three appear in `recodes.csv`
- [ ] Clicking a shared label highlights every pile that carries it
- [ ] Card history shows every cell and pile a card has been in, with person and time
- [ ] A note, a comment and a cell note are created, edited and resolved or accepted
- [ ] Undo and redo work for one's own last ten actions. A card copied with + appears in both piles, and removing one copy leaves the other
- [ ] Search and every filter in Section 5 return the right cards
- [ ] Export produces the nine CSV files in Section 9 with the documented columns
- [ ] A named snapshot is taken and restored; the log still contains the events between them
- [ ] The board is rebuilt from the files on Kwame's computer alone and matches the live state
- [ ] A signed-out browser and a wrong access ID cannot see any data
- [ ] 6,000 mock cards (the mock set loaded ten times) pan and zoom without visible lag, and the overview zoom shows the heatmap

## Open decisions

Settled on 2 November 2026:

- **Matrix design.** Cards are laid out by code (columns) and side (rows), and categories are derived inside each cell. No LLM sorting pass.
- **Recoding allowed.** A card can be dragged to another column or row; each recode is logged with a reason and can be reverted from the card.
- **Copies.** Import makes one copy per code; a + icon adds more. Every copy counts fully in its cell and category, in the matrix and in the co-word script.
- **Ahmed** is an editor.
- **No LLM-written gists.** Cards show the quotation itself.
- **Stack.** React Flow (MIT) for the canvas, Netlify Database for data, CSV snapshots in Netlify Blobs.
- **Database sleep.** No always-on database; a few seconds' wait after idle is fine.
- **Sign-in** with each person's Wayne State access ID, checked in a Function, with users and sessions stored in the database.
- **Figure 5** is a multilevel typology: each value form read across levels and sides. How value forms integrate with one another is addressed in the Discussion.
- **Off-site copies** go to Kwame's computer; Malak runs the backups.

Still open:

- **Board passcode:** whether to add one shared passcode, entered with the access ID, so that knowing someone's access ID is not enough to sign in as them.
- **Sorting view for multi cards:** pairs as rows (as specified, each card sorted once) or split into sides (each multi card sorted once per side, so a B+S card can join different categories on the buyer and seller sides).
- **Relation vocabulary:** the seven relation types stand as a draft until Discussion work begins.
