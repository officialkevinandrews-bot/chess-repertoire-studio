import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { Chess } from "chess.js";
import {
  BookOpen,
  ChevronFirst,
  ChevronLast,
  ChevronLeft,
  ChevronRight,
  Cpu,
  Flame,
  Puzzle,
  Star,
  Upload,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChessBoard } from "@/components/chess/ChessBoard";
import { EvaluationBar, PageHeader, Panel, TrainingLayout } from "@/components/chess/ui";
import { cn } from "@/lib/utils";
import { stockfishEngine } from "@/engine/stockfishClient";
import { identifyOpening } from "@/utils/openingNames";
import {
  detectSwings,
  endgameGoal,
  findEndgameStart,
  parsePgnFile,
  sansToPgn,
  toWhitePawns,
  type ParsedGame,
} from "@/utils/pgnStudio";
import {
  TACTICAL_TIERS,
  addVariationToSystem,
  getAllVariations,
  getRepertoireSystems,
  saveLineToVariation,
  saveTacticsPuzzles,
  saveVariationRecord,
  type PracticalEndgameTarget,
  type RepertoireSystem,
  type SavedVariation,
  type ScrapedGame,
  type TacticsPuzzleItem,
} from "@/services/repertoireStorage";

export const Route = createFileRoute("/pgn-studio")({
  head: () => ({
    meta: [
      { title: "PGN Studio — Chess Buddy" },
      {
        name: "description",
        content: "Upload your PGN games, analyse them with Stockfish and turn them into openings, tactics and endgames.",
      },
      { property: "og:title", content: "PGN Studio — Chess Buddy" },
      {
        property: "og:description",
        content: "Turn your own games into opening lines, tactics puzzles and practical endgames.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: PgnStudioPage,
});

/** Library record that stores PGN Studio model games + endgames so other pages pick them up. */
const LIBRARY_ID = "pgn-studio-library";

async function updateLibrary(mut: (v: SavedVariation) => void) {
  const all = await getAllVariations();
  const existing = all.find((v) => v.id === LIBRARY_ID);
  const lib: SavedVariation = existing ?? {
    id: LIBRARY_ID,
    name: "PGN Studio Imports",
    eco: "",
    openingName: "My Imported Games",
    finalFen: new Chess().fen(),
    moves: [],
    pgn: "",
    color: "white",
    createdAt: new Date().toISOString(),
    gameCount: 0,
    games: [],
    endgames: [],
  };
  mut(lib);
  lib.gameCount = lib.games.length;
  await saveVariationRecord(lib);
}

function toScrapedGame(g: ParsedGame): ScrapedGame {
  const r = g.result;
  const op = identifyOpening(g.sans);
  return {
    id: g.id,
    white: { name: g.white, rating: Number(g.headers.WhiteElo) || 0 },
    black: { name: g.black, rating: Number(g.headers.BlackElo) || 0 },
    winner: r === "1-0" ? "white" : r === "0-1" ? "black" : "draw",
    year: Number((g.headers.Date || "").slice(0, 4)) || new Date().getFullYear(),
    opening: g.headers.Opening || op?.name,
    eco: g.headers.ECO || op?.eco,
    plyCount: g.sans.length,
    movesSan: g.sans,
    pgn: g.pgn,
    fenAtVariation: g.fens[0],
    plyAtVariation: 0,
  };
}

function PgnStudioPage() {
  const [games, setGames] = useState<ParsedGame[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const [ply, setPly] = useState(0);
  const [pasted, setPasted] = useState("");
  const [evals, setEvals] = useState<(number | null)[]>([]);
  const [bestMoves, setBestMoves] = useState<({ pv: string[]; lan: string[] } | null)[]>([]);
  const [analysing, setAnalysing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [depth, setDepth] = useState(12);
  const [orientation, setOrientation] = useState<"white" | "black">("white");
  const cancelRef = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const game = games[activeIdx] ?? null;
  const fen = game ? game.fens[ply] : new Chess().fen();
  const lastMove = game && ply > 0 ? game.moves[ply - 1] : null;

  const loadText = (text: string) => {
    const parsed = parsePgnFile(text);
    if (parsed.length === 0) {
      toast.error("No valid games found in that PGN.");
      return;
    }
    setGames(parsed);
    setActiveIdx(0);
    toast.success(`Loaded ${parsed.length} game${parsed.length > 1 ? "s" : ""}.`);
  };

  // Reset navigation/analysis when switching games
  useEffect(() => {
    cancelRef.current = true;
    setPly(0);
    setEvals([]);
    setBestMoves([]);
    setAnalysing(false);
  }, [activeIdx, games]);

  // Keyboard navigation
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!game || (e.target as HTMLElement)?.tagName === "TEXTAREA" || (e.target as HTMLElement)?.tagName === "INPUT") return;
      if (e.key === "ArrowLeft") setPly((p) => Math.max(0, p - 1));
      if (e.key === "ArrowRight") setPly((p) => Math.min(game.sans.length, p + 1));
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [game]);

  const analyse = async () => {
    if (!game) return;
    cancelRef.current = false;
    setAnalysing(true);
    setProgress(0);
    await stockfishEngine.init();
    const ev: (number | null)[] = new Array(game.fens.length).fill(null);
    const bm: ({ pv: string[]; lan: string[] } | null)[] = new Array(game.fens.length).fill(null);
    for (let i = 0; i < game.fens.length; i++) {
      if (cancelRef.current) break;
      const f = game.fens[i];
      const c = new Chess(f);
      if (c.isCheckmate()) {
        ev[i] = c.turn() === "w" ? -10 : 10;
      } else if (c.isDraw() || c.isStalemate()) {
        ev[i] = 0;
      } else {
        try {
          const r = await stockfishEngine.evaluate(f, { depth, multiPv: 1 });
          const top = r.lines[0];
          if (top) {
            ev[i] = toWhitePawns(top.score.scoreCp, f);
            bm[i] = { pv: top.sanPv ?? [], lan: top.pv ?? [] };
          }
        } catch {
          ev[i] = null;
        }
      }
      setEvals([...ev]);
      setBestMoves([...bm]);
      setProgress(Math.round(((i + 1) / game.fens.length) * 100));
    }
    setAnalysing(false);
    if (!cancelRef.current) toast.success("Analysis complete.");
  };

  const swings = useMemo(() => (evals.length ? detectSwings(evals) : []), [evals]);
  const endgamePly = useMemo(() => (game ? findEndgameStart(game.fens) : null), [game]);

  const best = bestMoves[ply];
  const arrows =
    best && best.lan[0]
      ? [{ startSquare: best.lan[0].slice(0, 2), endSquare: best.lan[0].slice(2, 4), color: "var(--primary)" }]
      : [];

  return (
    <div>
      <PageHeader
        eyebrow="Game Import"
        title="PGN Studio"
        description="Upload your games, analyse them with Stockfish, then turn them into model games, opening lines, tactics and practical endgames."
        right={
          <div className="flex gap-2">
            <input
              ref={fileRef}
              type="file"
              accept=".pgn,text/plain"
              className="hidden"
              onChange={async (e) => {
                const f = e.target.files?.[0];
                if (f) loadText(await f.text());
                e.target.value = "";
              }}
            />
            <Button onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" /> Upload PGN
            </Button>
          </div>
        }
      />

      {!game ? (
        <Panel title="Import a game" icon={<Upload className="h-4 w-4" />}>
          <div
            className="mb-4 grid place-items-center rounded-lg border-2 border-dashed border-border p-10 text-center text-muted-foreground"
            onDragOver={(e) => e.preventDefault()}
            onDrop={async (e) => {
              e.preventDefault();
              const f = e.dataTransfer.files?.[0];
              if (f) loadText(await f.text());
            }}
          >
            <Upload className="mb-2 h-8 w-8" />
            <p>Drag & drop a .pgn file here (single or multi-game)</p>
          </div>
          <Textarea
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="…or paste PGN text here"
            className="min-h-40 font-mono text-xs"
          />
          <Button className="mt-3" disabled={!pasted.trim()} onClick={() => loadText(pasted)}>
            Load pasted PGN
          </Button>
        </Panel>
      ) : (
        <TrainingLayout
          board={
            <div className="flex gap-3">
              <EvaluationBar evaluation={evals[ply] ?? 0} />
              <div className="flex-1 space-y-3">
                <ChessBoard fen={fen} orientation={orientation} lastMoveHighlight={lastMove} arrows={arrows} />
                <div className="flex items-center justify-center gap-2">
                  <Button size="icon" variant="outline" onClick={() => setPly(0)} aria-label="First move">
                    <ChevronFirst className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => setPly((p) => Math.max(0, p - 1))} aria-label="Previous move">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="w-24 text-center font-mono text-sm">
                    {ply === 0 ? "Start" : `${Math.ceil(ply / 2)}${ply % 2 ? "." : "..."} ${game.sans[ply - 1]}`}
                  </span>
                  <Button size="icon" variant="outline" onClick={() => setPly((p) => Math.min(game.sans.length, p + 1))} aria-label="Next move">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button size="icon" variant="outline" onClick={() => setPly(game.sans.length)} aria-label="Last move">
                    <ChevronLast className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => setOrientation((o) => (o === "white" ? "black" : "white"))}>
                    Flip
                  </Button>
                </div>
                <EvalGraph evals={evals} ply={ply} onSelect={setPly} swings={swings.map((s) => s.ply)} />
              </div>
            </div>
          }
        >
          {games.length > 1 && (
            <Panel title={`Games (${games.length})`}>
              <div className="max-h-40 space-y-1 overflow-y-auto">
                {games.map((g, i) => (
                  <button
                    key={g.id}
                    onClick={() => setActiveIdx(i)}
                    className={cn(
                      "w-full rounded-md px-2 py-1 text-left text-sm hover:bg-muted",
                      i === activeIdx && "bg-muted font-semibold",
                    )}
                  >
                    {g.white} – {g.black} <span className="text-muted-foreground">{g.result}</span>
                  </button>
                ))}
              </div>
            </Panel>
          )}

          <Panel title={`${game.white} vs ${game.black}`} icon={<Cpu className="h-4 w-4" />}>
            <p className="mb-3 text-xs text-muted-foreground">
              {[game.headers.Event, game.headers.Date, game.result].filter(Boolean).join(" · ")}
            </p>
            <div className="mb-3 flex items-center gap-3 text-sm">
              <span className="text-muted-foreground">Depth</span>
              <Slider className="flex-1" min={8} max={22} step={1} value={[depth]} onValueChange={([d]) => setDepth(d)} disabled={analysing} />
              <span className="w-6 font-mono">{depth}</span>
            </div>
            {analysing ? (
              <div className="flex items-center gap-2">
                <div className="h-2 flex-1 overflow-hidden rounded bg-muted">
                  <div className="h-full bg-primary transition-all" style={{ width: `${progress}%` }} />
                </div>
                <Button size="sm" variant="outline" onClick={() => (cancelRef.current = true)}>
                  Stop
                </Button>
              </div>
            ) : (
              <Button className="w-full" onClick={analyse}>
                <Cpu className="mr-2 h-4 w-4" /> {evals.length ? "Re-analyse game" : "Analyse with Stockfish"}
              </Button>
            )}
            {best && best.pv.length > 0 && (
              <p className="mt-3 text-sm">
                <span className="text-muted-foreground">Engine: </span>
                <span className="font-mono">{best.pv.slice(0, 6).join(" ")}</span>
              </p>
            )}
            <div className="mt-3 max-h-52 overflow-y-auto font-mono text-sm leading-7">
              {game.sans.map((s, i) => {
                const isSwing = swings.some((w) => w.ply === i + 1);
                return (
                  <span key={i}>
                    {i % 2 === 0 && <span className="mr-1 text-muted-foreground">{i / 2 + 1}.</span>}
                    <button
                      onClick={() => setPly(i + 1)}
                      className={cn(
                        "mr-2 rounded px-1 hover:bg-muted",
                        ply === i + 1 && "bg-primary text-primary-foreground",
                        isSwing && ply !== i + 1 && "text-destructive",
                      )}
                    >
                      {s}
                      {isSwing && "?"}
                    </button>
                  </span>
                );
              })}
            </div>
          </Panel>

          <Tabs defaultValue="opening">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="opening"><BookOpen className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="tactics"><Puzzle className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="endgame"><Flame className="h-4 w-4" /></TabsTrigger>
              <TabsTrigger value="model"><Star className="h-4 w-4" /></TabsTrigger>
            </TabsList>
            <TabsContent value="opening">
              <OpeningExtractor game={game} ply={ply} setPly={setPly} />
            </TabsContent>
            <TabsContent value="tactics">
              <TacticsExtractor game={game} ply={ply} setPly={setPly} swings={swings} bestMoves={bestMoves} evals={evals} />
            </TabsContent>
            <TabsContent value="endgame">
              <EndgameExtractor game={game} ply={ply} setPly={setPly} endgamePly={endgamePly} evals={evals} />
            </TabsContent>
            <TabsContent value="model">
              <ModelGameSaver game={game} />
            </TabsContent>
          </Tabs>
        </TrainingLayout>
      )}
    </div>
  );
}

function EvalGraph({
  evals,
  ply,
  onSelect,
  swings,
}: {
  evals: (number | null)[];
  ply: number;
  onSelect: (p: number) => void;
  swings: number[];
}) {
  if (!evals.length) return null;
  const n = Math.max(1, evals.length - 1);
  const pts = evals.map((e, i) => `${(i / n) * 100},${50 - ((e ?? 0) / 10) * 50}`).join(" ");
  return (
    <svg
      viewBox="0 0 100 100"
      preserveAspectRatio="none"
      className="h-20 w-full cursor-pointer rounded-md bg-muted"
      onClick={(e) => {
        const r = e.currentTarget.getBoundingClientRect();
        onSelect(Math.round(((e.clientX - r.left) / r.width) * n));
      }}
    >
      <line x1="0" y1="50" x2="100" y2="50" stroke="var(--border)" strokeWidth="0.5" />
      <polyline points={pts} fill="none" stroke="var(--primary)" strokeWidth="1.2" vectorEffect="non-scaling-stroke" />
      {swings.map((s) => (
        <circle key={s} cx={(s / n) * 100} cy={50 - ((evals[s] ?? 0) / 10) * 50} r="1.5" fill="var(--destructive)" />
      ))}
      <line x1={(ply / n) * 100} y1="0" x2={(ply / n) * 100} y2="100" stroke="var(--foreground)" strokeWidth="0.4" />
    </svg>
  );
}

type NavProps = { game: ParsedGame; ply: number; setPly: (p: number) => void };

function OpeningExtractor({ game, ply, setPly }: NavProps) {
  const [systems, setSystems] = useState<RepertoireSystem[]>([]);
  const [color, setColor] = useState<"white" | "black">("white");
  const [systemId, setSystemId] = useState("");
  const [variationId, setVariationId] = useState("");
  const [newVar, setNewVar] = useState("");
  const [name, setName] = useState("");
  const cutoff = Math.max(1, ply);
  const sans = game.sans.slice(0, cutoff);
  const op = identifyOpening(sans);

  useEffect(() => {
    getRepertoireSystems().then(setSystems);
  }, []);
  const filtered = systems.filter((s) => s.color === color);
  const sys = filtered.find((s) => s.id === systemId) ?? filtered[0];
  const variation = sys?.variations.find((v) => v.id === variationId);

  const save = async () => {
    if (!sys) return toast.error("Create a repertoire system in Opening Creator first.");
    try {
      let vId = variation?.id;
      if (!vId) {
        const v = await addVariationToSystem(sys.id, newVar.trim() || op?.name || "Imported line", op?.eco || "");
        vId = v.id;
      }
      await saveLineToVariation(sys.id, vId, {
        name: name.trim() || `${game.white} – ${game.black}, move ${Math.ceil(cutoff / 2)}`,
        moves: sans,
        finalFen: game.fens[cutoff],
        pgn: sansToPgn(sans),
      });
      toast.success("Line added to your repertoire.");
      getRepertoireSystems().then(setSystems);
    } catch (e) {
      toast.error(String(e));
    }
  };

  return (
    <Panel title="Create opening line" icon={<BookOpen className="h-4 w-4" />}>
      <p className="mb-2 text-sm text-muted-foreground">Stop the line at move:</p>
      <Slider min={1} max={Math.min(game.sans.length, 60)} step={1} value={[cutoff]} onValueChange={([v]) => setPly(v)} />
      <p className="mt-2 font-mono text-xs">{sansToPgn(sans)}</p>
      {op?.name && <p className="mt-1 text-xs text-primary">{op.name}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["white", "black"] as const).map((c) => (
          <Button key={c} variant={color === c ? "default" : "outline"} size="sm" onClick={() => { setColor(c); setSystemId(""); setVariationId(""); }}>
            {c === "white" ? "White repertoire" : "Black repertoire"}
          </Button>
        ))}
      </div>
      <select className="mt-3 w-full rounded-md border border-border bg-background p-2 text-sm" value={sys?.id ?? ""} onChange={(e) => { setSystemId(e.target.value); setVariationId(""); }}>
        {filtered.length === 0 && <option value="">No systems for this colour</option>}
        {filtered.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <select className="mt-2 w-full rounded-md border border-border bg-background p-2 text-sm" value={variationId} onChange={(e) => setVariationId(e.target.value)}>
        <option value="">+ New variation</option>
        {sys?.variations.map((v) => (
          <option key={v.id} value={v.id}>{v.name}</option>
        ))}
      </select>
      {!variation && <Input className="mt-2" placeholder={op?.name || "New variation name"} value={newVar} onChange={(e) => setNewVar(e.target.value)} />}
      <Input className="mt-2" placeholder="Line name (optional)" value={name} onChange={(e) => setName(e.target.value)} />
      <Button className="mt-3 w-full" onClick={save}>Save to repertoire</Button>
    </Panel>
  );
}

function TacticsExtractor({
  game,
  ply,
  setPly,
  swings,
  bestMoves,
  evals,
}: NavProps & {
  swings: ReturnType<typeof detectSwings>;
  bestMoves: ({ pv: string[]; lan: string[] } | null)[];
  evals: (number | null)[];
}) {
  const makePuzzle = (p: number): TacticsPuzzleItem | null => {
    const bm = bestMoves[p];
    if (!bm || bm.pv.length === 0) return null;
    const fen = game.fens[p];
    const turn = fen.split(" ")[1] === "b" ? "black" : "white";
    const len = Math.min(bm.pv.length, 5) | 1; // odd length: ends on solver's move
    const tier = TACTICAL_TIERS[3];
    const swing = swings.find((s) => s.ply === p)?.swing;
    return {
      id: `pgn-tactic-${game.id}-${p}`,
      fen,
      initialTurn: turn,
      solutionPv: bm.pv.slice(0, len),
      solutionLanPv: bm.lan.slice(0, len),
      primaryMotif: "Fork / Double Attack",
      secondaryMotifs: [],
      tierLevel: 3,
      tierName: tier?.name ?? "Pattern Scout",
      rating: 1500,
      moveLength: Math.ceil(len / 2),
      sourceGameId: game.id,
      players: `${game.white} vs ${game.black}`,
      explanation: swing
        ? `From your game: the previous move dropped ${swing.toFixed(1)} pawns. Find the punishment.`
        : `From your game ${game.white} vs ${game.black}. Find the best continuation.`,
      isCheckmate: false,
    };
  };

  const save = async (plies: number[]) => {
    const items = plies.map(makePuzzle).filter((x): x is TacticsPuzzleItem => x !== null);
    if (!items.length) return toast.error("Analyse the game first so Stockfish can supply the solution.");
    await saveTacticsPuzzles(items);
    toast.success(`Saved ${items.length} puzzle${items.length > 1 ? "s" : ""} to Tactics Training.`);
  };

  return (
    <Panel title="Create tactics puzzles" icon={<Puzzle className="h-4 w-4" />}>
      {!evals.length ? (
        <p className="text-sm text-muted-foreground">Run the Stockfish analysis to auto-detect tactical moments.</p>
      ) : swings.length === 0 ? (
        <p className="text-sm text-muted-foreground">No big swings (1.5+ pawns) found in this game.</p>
      ) : (
        <div className="space-y-1">
          {swings.map((s) => (
            <button key={s.ply} onClick={() => setPly(s.ply)} className={cn("flex w-full justify-between rounded-md px-2 py-1 text-sm hover:bg-muted", ply === s.ply && "bg-muted")}>
              <span>After {Math.ceil(s.ply / 2)}{s.ply % 2 ? "." : "..."} {game.sans[s.ply - 1]} — {s.side} to punish</span>
              <span className="font-mono text-destructive">−{s.swing.toFixed(1)}</span>
            </button>
          ))}
          <Button className="mt-2 w-full" onClick={() => save(swings.map((s) => s.ply))}>Save all {swings.length} as puzzles</Button>
        </div>
      )}
      <Button variant="outline" className="mt-3 w-full" onClick={() => save([ply])}>
        Turn current position into a puzzle
      </Button>
    </Panel>
  );
}

function EndgameExtractor({
  game,
  ply,
  setPly,
  endgamePly,
  evals,
}: NavProps & { endgamePly: number | null; evals: (number | null)[] }) {
  const [side, setSide] = useState<"white" | "black">("white");
  const target = endgamePly ?? ply;
  const ev = evals[target];
  const goal = endgameGoal(ev ?? (game.result === "1-0" ? 2 : game.result === "0-1" ? -2 : 0), side);

  const save = async () => {
    // Endgame Lab plays the side to move, so make sure the start position has the trainee to move.
    let p = target;
    const turnAt = (i: number) => (game.fens[i].split(" ")[1] === "b" ? "black" : "white");
    if (turnAt(p) !== side && p + 1 < game.fens.length) p += 1;
    const eg: PracticalEndgameTarget = {
      id: `pgn-eg-${game.id}-${p}-${side}`,
      gameId: game.id,
      players: `${game.white} vs ${game.black}`,
      fen: game.fens[p],
      target: goal,
      moveNumber: Math.ceil(p / 2) || 1,
      sourceGameResult: game.result,
    };
    await updateLibrary((lib) => {
      lib.endgames = [...lib.endgames.filter((e) => e.id !== eg.id), eg];
    });
    toast.success("Endgame saved — find it in the Endgame Laboratory.");
  };

  return (
    <Panel title="Practical endgame" icon={<Flame className="h-4 w-4" />}>
      {endgamePly != null ? (
        <p className="text-sm">
          The game reached an endgame at move {Math.ceil(endgamePly / 2)}.{" "}
          <button className="text-primary underline" onClick={() => setPly(endgamePly)}>Show position</button>
        </p>
      ) : (
        <p className="text-sm text-muted-foreground">No technical endgame was reached. The current position will be used instead.</p>
      )}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["white", "black"] as const).map((c) => (
          <Button key={c} size="sm" variant={side === c ? "default" : "outline"} onClick={() => setSide(c)}>
            Play as {c}
          </Button>
        ))}
      </div>
      <p className="mt-3 text-sm">
        Goal: <span className="font-semibold text-primary">{goal}</span>
        {ev != null && <span className="ml-2 font-mono text-muted-foreground">({ev > 0 ? "+" : ""}{ev.toFixed(1)})</span>}
      </p>
      <Button className="mt-3 w-full" onClick={save}>Save as practical endgame</Button>
    </Panel>
  );
}

function ModelGameSaver({ game }: { game: ParsedGame }) {
  const save = async () => {
    await updateLibrary((lib) => {
      lib.games = [...lib.games.filter((g) => g.id !== game.id), toScrapedGame(game)];
    });
    toast.success("Saved as a model game — use it in Guess the Move.");
  };
  return (
    <Panel title="Model game" icon={<Star className="h-4 w-4" />}>
      <p className="mb-3 text-sm text-muted-foreground">
        Save the whole game to your library so you can replay it in Guess the Move.
      </p>
      <Button className="w-full" onClick={save}>Save as model game</Button>
    </Panel>
  );
}
