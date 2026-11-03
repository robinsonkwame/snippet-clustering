"""Cross-level co-word analysis of the Stage 3 coding (descriptive starter script).

Builds a paper-by-item matrix where an item is a stakeholder side plus a code (for example
'buyer:G1' or 'seller:G3'). For every left-side item x right-side item pair it reports the
papers coding each item, the papers coding both (co-occurrence), the co-occurrence expected
from the two codes' frequencies alone, and the association ratio (observed / expected).
A ratio of 1 means the pair shares as many papers as their frequencies predict; 2 means twice
as many. The ratio is proportional to van Eck and Waltman's (2009) association strength.
By default (--baseline engaged) the expectation is computed only among papers that code both
sides at all. Papers with seller-side codes tend to be heavily coded papers, so against all
papers nearly every buyer-seller pair looks above 1; the engaged baseline removes that effect.

No statistical test is applied by default: the figure is descriptive. --test adds a
curveball permutation screen (p and Benjamini-Hochberg q columns) to the CSV only, for later use.

Outputs (in --out): census_papers_by_code_and_side.csv, coword_cells.csv (with paper lists),
coword_figure.png and coword_figure.pdf.

Examples
  python3 coword_crosslevel.py --review "stage 3 review sheet.xlsx"
  python3 coword_crosslevel.py --review "stage 3 review sheet.xlsx" --multi-mode exclude --out out_no_multi
  python3 coword_crosslevel.py --review "stage 3 review sheet.xlsx" --multi-mode pairs \
      --multi-file "Stage 3 multi party marking - Malak.xlsx" --left seller --right platform
  python3 coword_crosslevel.py --review "stage 3 review sheet.xlsx" --mapping coword_mapping_template.csv

Mapping file (optional): CSV with columns 'code' and 'category'. Every code token is replaced
by its category before analysis, so the same script runs on categories once they exist.
Leave category blank to drop a code. Unmapped codebook codes are kept as they are; unmapped
proposed new codes ('NEW: ...') are dropped unless --keep-new is given.
"""
import argparse, os, re, sys
import numpy as np, pandas as pd

NAMES = {"A1": "efficiency", "A2": "excellence", "A3": "status", "A4": "esteem", "A5": "play", "A6": "aesthetics",
         "B1": "functional value", "B2": "social value", "B3": "emotional value", "B4": "epistemic value",
         "B5": "conditional value", "C1": "extended self", "C2": "identity expression", "D1": "co-creation",
         "D2": "service ecosystem", "E1": "community membership", "E2": "shared rituals", "F1": "status signaling",
         "G1": "scarcity perception", "G2": "provenance", "G3": "royalty", "G4": "utility", "G5": "speculation"}
SIDES = {"buyer": "buyer", "brand_seller": "seller", "seller": "seller", "platform": "platform", "community": "community"}
PAIR_COLS = {"buyer_seller": ("buyer", "seller"), "seller_platform": ("seller", "platform"),
             "buyer_platform": ("buyer", "platform"), "buyer_community": ("buyer", "community"),
             "seller_community": ("seller", "community"), "platform_community": ("platform", "community")}
SIDE_TITLE = {"buyer": "BUYER", "seller": "BRAND-SELLER", "platform": "PLATFORM", "community": "COMMUNITY"}


def parse_args():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--review", required=True, help="stage 3 review sheet (.xlsx, sheet 'Review')")
    ap.add_argument("--multi-mode", choices=["both", "exclude", "pairs"], default="exclude",
                    help="multi rows: drop them (exclude, default), count as buyer and seller (both), or use Malak's pair marking (pairs)")
    ap.add_argument("--multi-file", help="Malak's marked workbook (needed for --multi-mode pairs)")
    ap.add_argument("--mapping", help="CSV with columns code,category")
    ap.add_argument("--keep-new", action="store_true", help="keep unmapped proposed new codes as their own items")
    ap.add_argument("--left", default="buyer", choices=["buyer", "seller", "platform", "community"])
    ap.add_argument("--right", default="seller", choices=["buyer", "seller", "platform", "community"])
    ap.add_argument("--min-papers", type=int, default=5, help="an item needs at least this many papers to be shown")
    ap.add_argument("--min-cooc", type=int, default=5, help="a pair needs at least this many shared papers to be shown")
    ap.add_argument("--baseline", choices=["engaged", "all"], default="engaged",
                    help="expected co-occurrence computed among papers that code both sides at all (engaged, default) "
                         "or among all papers (all)")
    ap.add_argument("--min-ratio", type=float, default=1.5, help="pairs at or above this ratio get an edge and a label")
    ap.add_argument("--include-same-code", action="store_true",
                    help="also show pairs with the same code on both sides (off by default; multi rows create them mechanically)")
    ap.add_argument("--test", action="store_true", help="add a curveball permutation screen to the CSV (not the figure)")
    ap.add_argument("--perms", type=int, default=5000)
    ap.add_argument("--seed", type=int, default=20261026)
    ap.add_argument("--out", default="coword_out")
    return ap.parse_args()


def load_mapping(path):
    if not path:
        return {}
    m = pd.read_csv(path, dtype=str).fillna("")
    return {r["code"].strip(): r["category"].strip() for _, r in m.iterrows()}


def tokens(cell):
    if pd.isna(cell):
        return []
    out = []
    for t in str(cell).split(","):
        t = t.strip()
        if t and t != "(no codes)":
            out.append(t)
    return out


def map_token(t, mapping, keep_new):
    if t in mapping:
        return mapping[t] or None
    if t.startswith("NEW:"):
        return t if keep_new else None
    return t


def label(item_code):
    return f"{item_code} {NAMES[item_code]}" if item_code in NAMES else item_code


def load_rows(a, mapping):
    df = pd.read_excel(a.review, "Review")
    use_ai = df["choice"].astype(str).str.strip().str.lower().eq("ai")
    df["codes_final"] = np.where(use_ai, df["ai"], df["human"])
    df["side_final"] = np.where(use_ai, df["ai_stakeholder_side"], df["human_stakeholder_side"])
    df = df[df["codes_final"].notna()].copy()
    df["key"] = df["paper"].astype(str) + "|" + df["highlight_id"].astype(str)

    pairs = {}
    if a.multi_mode == "pairs":
        if not a.multi_file:
            sys.exit("--multi-mode pairs needs --multi-file")
        mk = pd.read_excel(a.multi_file, "Multi_rows").fillna("")
        for _, r in mk.iterrows():
            ps = [PAIR_COLS[c] for c in PAIR_COLS if str(r.get(c, "")).strip().lower() == "discussed"]
            pairs[f"{r['paper']}|{r['highlight_id']}"] = ps

    recs, unmarked = [], 0
    for _, r in df.iterrows():
        side = str(r["side_final"]).strip()
        if side == "multi":
            if a.multi_mode == "exclude":
                continue
            if a.multi_mode == "both":
                sides = ["buyer", "seller"]
            else:
                ps = pairs.get(r["key"])
                if ps is None:
                    unmarked += 1
                    continue
                sides = sorted({s for p in ps for s in p})
        elif side in SIDES:
            sides = [SIDES[side]]
        else:
            continue
        for t in tokens(r["codes_final"]):
            c = map_token(t, mapping, a.keep_new)
            if c:
                for s in sides:
                    recs.append((r["paper"], f"{s}:{c}", r["key"]))
    if unmarked:
        print(f"note: {unmarked} multi rows had no pair marking and were left out")
    return pd.DataFrame(recs, columns=["paper", "item", "key"]).drop_duplicates()


def curveball(rows, rng, swaps):
    n = len(rows)
    for _ in range(swaps):
        i, j = rng.choice(n, 2, replace=False)
        A, B = rows[i], rows[j]
        ua, ub = list(A - B), list(B - A)
        if not ua or not ub:
            continue
        pool = ua + ub
        rng.shuffle(pool)
        k = len(ua)
        common = A & B
        rows[i] = common | set(pool[:k])
        rows[j] = common | set(pool[k:])


def bh(p):
    p = np.asarray(p, float)
    q = np.full(p.shape, np.nan)
    ok = ~np.isnan(p)
    if ok.sum() == 0:
        return q
    pv = p[ok]
    o = np.argsort(pv)
    m = len(pv)
    adj = np.minimum.accumulate((pv[o] * m / np.arange(1, m + 1))[::-1])[::-1]
    res = np.empty(m)
    res[o] = np.minimum(adj, 1)
    q[ok] = res
    return q


def build(rec, a):
    papers = sorted(rec["paper"].unique())
    items = sorted(rec["item"].unique())
    pi = {p: i for i, p in enumerate(papers)}
    ii = {t: j for j, t in enumerate(items)}
    M = np.zeros((len(papers), len(items)), dtype=np.int8)
    for p, t in rec[["paper", "item"]].itertuples(index=False):
        M[pi[p], ii[t]] = 1
    N = len(papers)
    n = M.sum(0)
    L = [t for t in items if t.startswith(a.left + ":") and n[ii[t]] >= a.min_papers]
    R = [t for t in items if t.startswith(a.right + ":") and n[ii[t]] >= a.min_papers]
    if not L or not R:
        sys.exit(f"no {a.left} or {a.right} items with at least {a.min_papers} papers; lower --min-papers")
    li, ri = [ii[t] for t in L], [ii[t] for t in R]
    C = M[:, li].T.astype(np.int32) @ M[:, ri].astype(np.int32)
    if a.baseline == "engaged":
        side_l = np.array([t.startswith(a.left + ":") for t in items])
        side_r = np.array([t.startswith(a.right + ":") for t in items])
        eng = (M[:, side_l].sum(1) > 0) & (M[:, side_r].sum(1) > 0)
        Ne = int(eng.sum())
        E = np.outer(M[eng][:, li].sum(0), M[eng][:, ri].sum(0)) / Ne
    else:
        Ne = N
        E = np.outer(n[li], n[ri]) / N
    a._ne = Ne
    same = np.array([[lt.split(":", 1)[1] == rt.split(":", 1)[1] for rt in R] for lt in L])
    shown = (C >= a.min_cooc) & (~same | a.include_same_code)

    pcols = {}
    if a.test:
        rng = np.random.default_rng(a.seed)
        rows = [set(np.flatnonzero(r)) for r in M]
        curveball(rows, rng, N * 10)
        ge = np.zeros(C.shape)
        for k in range(a.perms):
            curveball(rows, rng, N * 3)
            X = np.zeros_like(M)
            for r_, s_ in enumerate(rows):
                X[r_, list(s_)] = 1
            ge += (X[:, li].T.astype(np.int32) @ X[:, ri].astype(np.int32)) >= C
        p = (ge + 1) / (a.perms + 1)
        pcols = {"p_curveball": p, "q_curveball": bh(np.where(shown, p, np.nan).ravel()).reshape(C.shape)}

    support = rec.groupby(["paper", "item"])["key"].apply(set).to_dict()
    out = []
    for x, lt in enumerate(L):
        for y, rt in enumerate(R):
            both = [papers[i] for i in np.flatnonzero(M[:, ii[lt]] & M[:, ii[rt]])]
            within = [q for q in both if support[(q, lt)] & support[(q, rt)]]
            row = dict(left=lt, right=rt, n_left=int(n[ii[lt]]), n_right=int(n[ii[rt]]), cooc=int(C[x, y]),
                       expected=round(E[x, y], 2), assoc_ratio=round(C[x, y] / E[x, y], 3) if E[x, y] else np.nan,
                       same_code=bool(same[x, y]), shown=bool(shown[x, y]),
                       papers_within_one_excerpt=len(within), papers="; ".join(both))
            for k, v in pcols.items():
                row[k] = v[x, y]
            out.append(row)
    cells = pd.DataFrame(out)
    census = pd.Series(n, index=items).rename("papers").reset_index().rename(columns={"index": "item"})
    census[["side", "code"]] = census["item"].str.split(":", n=1, expand=True)
    census = census.pivot_table(index="code", columns="side", values="papers", fill_value=0).astype(int)
    return cells, census, L, R, n, ii, N


def draw(cells, L, R, n, ii, N, a, path):
    import matplotlib
    matplotlib.use("Agg")
    import matplotlib.pyplot as plt
    from matplotlib.colors import TwoSlopeNorm, LinearSegmentedColormap
    from matplotlib.lines import Line2D

    INK, INK2, MUTED, BLUE, SURF = "#0b0b0b", "#52514e", "#8a8984", "#2a78d6", "#ffffff"
    plt.rcParams.update({"font.family": "DejaVu Sans", "font.size": 9, "text.color": INK})
    nl, nr = len(L), len(R)
    h = max(7.5, 0.34 * max(nl, nr) + 3)
    fig = plt.figure(figsize=(17, h), facecolor=SURF)
    axA = fig.add_axes([0.14, 0.17, 0.27, 0.71])
    axB = fig.add_axes([0.70, 0.27, 0.25, 0.61])
    lab = lambda t: label(t.split(":", 1)[1])
    cv = cells.set_index(["left", "right"])

    yl = np.linspace(1, 0, nl) if nl > 1 else np.array([0.5])
    yr = np.linspace(1, 0, nr) if nr > 1 else np.array([0.5])
    axA.set_xlim(-0.1, 1.1); axA.set_ylim(-0.06, 1.08); axA.axis("off")
    for x, lt in enumerate(L):
        for y, rt in enumerate(R):
            c = cv.loc[(lt, rt)]
            if c.shown and c.assoc_ratio >= a.min_ratio:
                axA.plot([0, 1], [yl[x], yr[y]], color=BLUE, lw=min(0.5 + 1.5 * (c.assoc_ratio - 1), 6), alpha=.8,
                         solid_capstyle="round", zorder=2)
    for x, lt in enumerate(L):
        axA.scatter(0, yl[x], s=30 + n[ii[lt]] * 1.5, color=SURF, edgecolor=INK, lw=1.2, zorder=3)
        axA.text(-0.06, yl[x], f"{lab(lt)}  ({n[ii[lt]]})", ha="right", va="center")
    for y, rt in enumerate(R):
        axA.scatter(1, yr[y], s=30 + n[ii[rt]] * 1.5, color=INK, edgecolor=INK, lw=1.2, zorder=3)
        axA.text(1.06, yr[y], f"({n[ii[rt]]})  {lab(rt)}", ha="left", va="center")
    axA.text(0, 1.07, f"{SIDE_TITLE[a.left]}-SIDE CODES", ha="center", fontweight="bold", color=INK2)
    axA.text(1, 1.07, f"{SIDE_TITLE[a.right]}-SIDE CODES", ha="center", fontweight="bold", color=INK2)
    axA.legend(handles=[Line2D([], [], color=BLUE, lw=1.3, label=f"Association ratio {a.min_ratio:g}"),
                        Line2D([], [], color=BLUE, lw=4.3, label=f"Association ratio {a.min_ratio + 2:g}"),
                        Line2D([], [], marker="o", ls="", mfc=SURF, mec=INK, label="Node size = papers coded (n)")],
               loc="upper center", bbox_to_anchor=(0.5, -0.02), frameon=False, fontsize=8.5)

    Rm = cells.pivot(index="left", columns="right", values="assoc_ratio").reindex(index=L, columns=R).values.astype(float)
    SH = cells.pivot(index="left", columns="right", values="shown").reindex(index=L, columns=R).values.astype(bool)
    SC = cells.pivot(index="left", columns="right", values="same_code").reindex(index=L, columns=R).values.astype(bool)
    Lg = np.where(SH, np.log2(np.clip(Rm, 0.25, 4)), np.nan)
    cmap = LinearSegmentedColormap.from_list("div", ["#e34948", "#f2b6b4", "#f0efec", "#9ec5f4", "#2a78d6", "#184f95"])
    cmap.set_bad("#f7f7f5")
    im = axB.imshow(np.ma.masked_invalid(Lg), cmap=cmap, norm=TwoSlopeNorm(vcenter=0, vmin=-2, vmax=2), aspect="auto")
    axB.set_xticks(range(nr))
    axB.set_xticklabels([lab(t) for t in R], rotation=40 if nr <= 12 else 60, ha="right",
                        fontsize=9 if nr <= 12 else 7.5, rotation_mode="anchor")
    axB.set_yticks(range(nl)); axB.set_yticklabels([lab(t) for t in L], fontsize=9 if nl <= 12 else 8)
    axB.set_xticks(np.arange(-.5, nr), minor=True); axB.set_yticks(np.arange(-.5, nl), minor=True)
    axB.grid(which="minor", color=SURF, lw=2); axB.tick_params(which="both", length=0)
    for s_ in axB.spines.values():
        s_.set_visible(False)
    for i in range(nl):
        for j in range(nr):
            if SC[i, j] and not SH[i, j]:
                axB.add_patch(plt.Rectangle((j - .5, i - .5), 1, 1, fill=False, hatch="///", ec=MUTED, lw=0))
            if SH[i, j] and Rm[i, j] >= a.min_ratio:
                axB.text(j, i, f"{Rm[i, j]:.1f}", ha="center", va="center", fontsize=8 if nr <= 12 else 6.5,
                         fontweight="bold", color="white" if Lg[i, j] > 0.9 else INK)
    axB.set_xlabel(f"{SIDE_TITLE[a.right].lower()}-side code (columns); {SIDE_TITLE[a.left].lower()}-side code (rows)",
                   color=INK2, labelpad=8)
    cb = fig.colorbar(im, ax=axB, fraction=0.04, pad=0.02, ticks=[-2, -1, 0, 1, 2])
    cb.ax.set_yticklabels(["¼×", "½×", "1×", "2×", "4×"]); cb.outline.set_visible(False)
    cb.ax.tick_params(length=0, colors=INK2)

    fig.text(0.02, 0.95, "A. Cross-level co-word map", fontsize=12, fontweight="bold")
    fig.text(0.02, 0.915, f"Edges: pairs with association ratio of at least {a.min_ratio:g}; width = ratio", color=INK2)
    fig.text(0.56, 0.95, f"B. {SIDE_TITLE[a.left].title()} × {SIDE_TITLE[a.right].lower()} association matrix",
             fontsize=12, fontweight="bold")
    fig.text(0.56, 0.915, f"Cell colour = association ratio; labelled cells at least {a.min_ratio:g}", color=INK2)
    fig.text(0.02, 0.01, f"{N} papers. Unit of analysis = paper. Association ratio = observed ÷ expected paper-level "
             f"co-occurrence. " + (f"Expected is computed among the {a._ne} papers that code both sides: (papers with left code × "
             f"papers with right code) ÷ {a._ne}." if a.baseline == "engaged" else f"Expected = (papers with left code × "
             f"papers with right code) ÷ {N}.") + f" Descriptive; no statistical test.\nMulti rows: {a.multi_mode}. Codes shown: at least {a.min_papers} papers. Pairs shown: at "
             f"least {a.min_cooc} shared papers (blank cells have fewer)."
             + ("" if a.include_same_code else " Hatched cells: same code on both sides, not shown."),
             fontsize=8, color=MUTED)
    fig.savefig(path + ".png", dpi=300, facecolor=SURF)
    fig.savefig(path + ".pdf", facecolor=SURF)
    plt.close(fig)


def main():
    a = parse_args()
    if a.left == a.right:
        sys.exit("--left and --right must differ")
    os.makedirs(a.out, exist_ok=True)
    rec = load_rows(a, load_mapping(a.mapping))
    print(f"{rec['paper'].nunique()} papers, {rec['item'].nunique()} side:code items")
    cells, census, L, R, n, ii, N = build(rec, a)
    census.to_csv(os.path.join(a.out, "census_papers_by_code_and_side.csv"))
    cells.to_csv(os.path.join(a.out, "coword_cells.csv"), index=False)
    draw(cells, L, R, n, ii, N, a, os.path.join(a.out, "coword_figure"))
    k = int((cells.shown & (cells.assoc_ratio >= a.min_ratio)).sum())
    print(f"{int(cells.shown.sum())} pairs shown, {k} at ratio >= {a.min_ratio:g}. Outputs in {a.out}/")


if __name__ == "__main__":
    main()
