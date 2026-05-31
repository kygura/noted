# Atlas — an organic "map of the mind" view

- **Date:** 2026-05-31
- **Status:** Approved (brainstormed, design approved by user)
- **Topic:** A new map view that visualizes the embedding space as an organic cartographic "atlas of the mind", breaking from hierarchical folders.

## Context

`map.md` (the original brief) no longer exists in the repo or git history; this design was reconstructed from `moat.md` ("the grid IS the graph, invisible edges, query-driven, keyboard-first"), the project memory ("organic D3 atlas of the mind, pure logic in `src/lib/atlas/`, tested with vitest"), and the current code.

The existing `MapView.tsx` (React Flow: rectangular draggable cards + dashed-rectangle region boxes + cosine-similarity opacity dimming) is the "office-like" aesthetic we are moving away from. It **stays as-is**; the Atlas is a **parallel view**.

The app's "Parchment" theme (warm cream/vellum, Cormorant Garamond serif, gold ink, paper grain) is the aesthetic anchor: an antique-cartography / illuminated-atlas metaphor.

## Locked decisions

1. **Parallel view** — Atlas is a sibling of the React Flow map; the old map is untouched.
2. **PCA + d3-force layout** — deterministic geography, ambient motion for free; no UMAP, no heavy deps.
3. **Stable map + highlight, reflow on demand** — geography is a learnable place; query highlights in place; an explicit action gathers notes around the query.
4. **Edges hidden, revealed on focus** — proximity encodes relatedness; selecting a note surfaces its typed edges as faint threads.
5. **"Bordered Atlas" visual** — named territories read first (soft ink borders + low-alpha tint), light topographic relief inside; relief intensifies as you zoom into a territory.

## 1 · Integration

- `Shell.tsx`: add `'atlas'` to the `View` union; render `<AtlasView onOpenNote={handleMapOpenNote} />`.
- `Sidebar.tsx` + mobile nav: add an **"Atlas"** entry.
- Reuse the data/engine layer unchanged: `agent.ts`, `search.ts` (`embedText`), Dexie live queries, `MapContextMenu`, `regionColor` logic.
- **No DB schema change.** Positions are computed in-memory (see §2); DB caching is a noted future optimization, not built now.

### Shared extractions (targeted refactor)

Lift two pieces out of `MapView` into hooks consumed by both views (avoids duplication):

- `useEnsureEmbeddings()` — on-mount batch embed + cluster bootstrap (currently inline in `MapView`), exposing `batchState`.
- `useConceptQuery()` — debounced query → `embedText` → per-note cosine score map.

## 2 · Layout pipeline ("a visual domain for embeddings")

Replaces the weak `project2D` seeded-random projection.

```
embeddings[1536d] --PCA--> 2D coords --d3-force settle--> stable positions
                  (global)            (declump + spacing + ambient drift)
```

- **PCA**: top-2 principal components via power iteration (pure function). Deterministic: same notes → same map.
- **d3-force**: `forceCollide` + mild `forceManyBody`, seeded deterministically, to relax overlaps and open organic spacing. The same simulation ticked slowly afterward provides ambient drift (§6).
- Computed on mount and on notes/embeddings change. Fast for hundreds of notes.
- `project.ts` is written behind a stable interface so UMAP can drop in later if clusters feel muddy.

## 3 · Unified field model

Territories, relief, and borders all derive from **one scalar field** so they cannot disagree:

- Each region `r`: density `D_r(x,y) = Σ gaussian(dist to each of r's notes)`.
- **Territory of r** = where `D_r` is the arg-max over regions → space-filling, organically curved borders (the ridge where two fields cross), not angular Voronoi edges.
- **Relief contours** = iso-lines of total density `Σ D_r` via `d3-contour` (marching squares); peaks sit where notes cluster.
- **Borders** = arg-max boundaries, stroked as soft ink; **tint** = region hue at low alpha.

Computed on a grid; recomputed only when positions change, never per frame.

## 4 · Rendering & level-of-detail

One DPR-aware `<canvas>` draws field → relief → edges → motes; an HTML overlay holds the focus card, query bar, legend. Hand-rolled pan/zoom (wheel + drag → transform; avoids the d3-zoom/d3-selection dependency chain).

| Zoom | What you see |
|------|-------------|
| Far | Tinted territories, relief contours, italic serif region labels; notes are faint motes. |
| Mid | Motes grow; titles fade in on nearest/densest notes; relief present. |
| Near | Soft paper note-cards (title + preview, rounded, no hard border); relief recedes for calm reading. |

## 5 · Interaction

- **Hover** mote → gentle lift + title tooltip.
- **Click** → focus: note's edges surface as faint typed threads (`--color-supports` etc.); rest dims; focus card shows actions (open, regenerate embedding, re-run agent, archive — reusing `MapView`'s menu actions).
- **Enter / double-click** → open in editor (`onOpenNote`).
- **Query bar** (`/`): highlight-in-place (matching terrain brightens/rises, rest dims; camera optionally eases to strongest match). **"Gather around query"** action = on-demand reflow (notes animate toward a query-similarity attractor; clearable).
- **Keyboard**: arrows move focus to nearest note in direction; `Tab` cycles territories (centering each); `Esc` clears focus/query.
- **Right-click** → existing `MapContextMenu` (note/region/canvas actions).

## 6 · Animation ("slightly")

- **Ambient drift**: each mote carries a tiny seeded sinusoidal offset (≈2–4px, 6–12s period); the field layer stays put, only the motes layer redraws per frame.
- **Transitions**: query/focus easing on `--duration-normal`; camera eases on `--ease-out`.
- **Entrance**: territories fade/scale in; motes stagger.
- **`prefers-reduced-motion`**: drift + entrance disabled.
- One throttled `requestAnimationFrame` loop; field cached between data changes.

## 7 · Module layout & testing

Pure logic in `src/lib/atlas/`, one job per file, vitest-tested:

- `types.ts` — `Vec2`, `AtlasNode`, `FieldGrid`, `Territory`, etc.
- `project.ts` — `projectEmbeddings(notes) → Map<id, Vec2>` (PCA).
- `simulate.ts` — `settle(points, opts)` + drift tick (d3-force wrappers).
- `field.ts` — `computeField`, `contours`, `territoryBorders`.
- `colors.ts` — deterministic region → parchment hue.
- `index.ts` — barrel.

Components under `src/components/atlas/`: `AtlasView.tsx` (orchestration), `AtlasCanvas.tsx` (render loop), `QueryBar.tsx`, `FocusCard.tsx`, `Legend.tsx`.

**Deps** (bun): `d3-force`, `d3-contour`, `d3-quadtree` (+ `@types/*`); `vitest` (dev) with a `test` script.

**Tests**: projection determinism + variance ordering; territory arg-max assignment on toy clusters; contour ring counts; settle reduces overlap; color stability per regionId.

## 8 · Non-goals (YAGNI)

No manual note-dragging (the layout *is* the meaning). No DB schema change. No replacing/removing React Flow. No UMAP. No edge editing from the Atlas (that's the Review flow).
