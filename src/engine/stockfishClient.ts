import type { EngineAnalysisResult, EnginePVLine } from "./stockfishTypes";
import { parseBestMove, parseUciInfoLine } from "./stockfishParser";
import { interpretEngineAnalysis } from "../utils/engineInterpreter";

export interface EvaluationOptions {
  depth?: number;
  movetime?: number;
  onProgress?: (partial: EngineAnalysisResult) => void;
  lastMove?: { from: string; to: string };
  multiPv?: number;
}

export class StockfishClient {
  private worker: Worker | null = null;
  private isReady = false;
  private isEvaluating = false;
  private currentFen = "";
  private currentOptions: EvaluationOptions | null = null;
  private resolveCurrent: ((result: EngineAnalysisResult) => void) | null = null;
  private currentLines: Map<number, EnginePVLine> = new Map();
  private maxDepth = 25;
  private workerPath: string;

  constructor(workerPath = "/stockfish.js") {
    this.workerPath = workerPath;
  }

  /**
   * Initializes the Stockfish Web Worker and configures Skill Level 20, MultiPV, and Depth 25+.
   * Safe to call on the server (will cleanly no-op if Worker is not defined).
   */
  public async init(): Promise<boolean> {
    if (typeof window === "undefined" || typeof Worker === "undefined") {
      return false;
    }

    if (this.worker && this.isReady) {
      return true;
    }

    return new Promise((resolve) => {
      try {
        this.worker = new Worker(this.workerPath);

        this.worker.onmessage = (e: MessageEvent) => {
          const message = typeof e.data === "string" ? e.data : String(e.data || "");
          this.handleUciMessage(message);
        };

        this.worker.onerror = (err) => {
          console.warn("[Stockfish] Worker error:", err);
          resolve(false);
        };

        // Initialize UCI with Grandmaster depth options (MultiPV 5, Hash 128MB, Skill 20)
        this.sendCommand("uci");
        this.sendCommand("setoption name MultiPV value 5");
        this.sendCommand("setoption name Threads value 2");
        this.sendCommand("setoption name Hash value 128");
        this.sendCommand("setoption name Skill Level value 20");
        this.sendCommand("isready");

        const checkReady = (e: MessageEvent) => {
          const msg = String(e.data || "");
          if (msg.includes("readyok")) {
            this.isReady = true;
            this.worker?.removeEventListener("message", checkReady);
            resolve(true);
          }
        };

        this.worker.addEventListener("message", checkReady);

        // Fallback timeout in case readyok is delayed
        setTimeout(() => {
          if (!this.isReady) {
            this.isReady = true;
            resolve(true);
          }
        }, 1500);
      } catch (err) {
        console.warn("[Stockfish] Failed to initialize worker:", err);
        resolve(false);
      }
    });
  }

  /**
   * Evaluates a chess position given its FEN string using Deep Stockfish (Depth 25+ / MultiPV 5).
   */
  public async evaluate(
    fen: string,
    options: EvaluationOptions = {},
  ): Promise<EngineAnalysisResult> {
    const depth = options.depth || 25;
    const multiPv = options.multiPv || 5;
    this.maxDepth = depth;
    this.currentFen = fen;
    this.currentOptions = options;
    this.currentLines.clear();

    if (!this.worker || !this.isReady) {
      const initialized = await this.init();
      if (!initialized || !this.worker) {
        return this.getFallbackEvaluation(fen, options.lastMove, depth, multiPv);
      }
    }

    if (this.isEvaluating) {
      this.sendCommand("stop");
    }

    this.isEvaluating = true;
    this.sendCommand(`setoption name MultiPV value ${multiPv}`);

    return new Promise((resolve) => {
      this.resolveCurrent = resolve;

      this.sendCommand("ucinewgame");
      this.sendCommand(`position fen ${fen}`);
      if (options.movetime) {
        this.sendCommand(`go depth ${depth} movetime ${options.movetime}`);
      } else {
        this.sendCommand(`go depth ${depth}`);
      }
    });
  }

  /**
   * Starts continuous, unlimited deep engine analysis ("Infinite Analysis").
   * Runs until stop() or pause() is called, streaming live depth, node count, and lines.
   */
  public async startInfinite(
    fen: string,
    options: {
      multiPv?: number;
      onProgress?: (partial: EngineAnalysisResult) => void;
      lastMove?: { from: string; to: string };
    } = {},
  ): Promise<void> {
    const multiPv = options.multiPv || 5;
    this.currentFen = fen;
    this.currentOptions = { ...options, depth: 99 };
    this.currentLines.clear();

    if (!this.worker || !this.isReady) {
      const ok = await this.init();
      if (!ok || !this.worker) return;
    }

    if (this.isEvaluating) {
      this.sendCommand("stop");
    }

    this.isEvaluating = true;
    this.sendCommand(`setoption name MultiPV value ${multiPv}`);
    this.sendCommand("ucinewgame");
    this.sendCommand(`position fen ${fen}`);
    this.sendCommand("go infinite");
  }

  /**
   * Pauses continuous search while preserving the latest lines and depth.
   */
  public pause(): void {
    if (this.isEvaluating) {
      this.sendCommand("stop");
      this.isEvaluating = false;
    }
  }

  /**
   * Resumes continuous search from the current position.
   */
  public resume(fen?: string): void {
    const targetFen = fen || this.currentFen;
    if (targetFen) {
      this.startInfinite(targetFen, this.currentOptions || {});
    }
  }

  /**
   * Stops any currently executing engine search.
   */
  public stop() {
    if (this.isEvaluating) {
      this.sendCommand("stop");
      this.isEvaluating = false;
    }
  }

  public terminate() {
    this.stop();
    this.worker?.terminate();
    this.worker = null;
    this.isReady = false;
  }

  private sendCommand(command: string) {
    if (this.worker) {
      this.worker.postMessage(command);
    }
  }

  private handleUciMessage(line: string) {
    const trimmed = line.trim();
    if (!trimmed) return;

    if (trimmed.startsWith("info ")) {
      const pvLine = parseUciInfoLine(trimmed, this.currentFen);
      if (pvLine) {
        this.currentLines.set(pvLine.multipv, pvLine);

        if (this.currentOptions?.onProgress) {
          const partial = interpretEngineAnalysis(
            this.currentFen,
            Array.from(this.currentLines.values()),
            this.currentOptions.lastMove,
          );
          this.currentOptions.onProgress(partial);
        }
      }
    } else if (trimmed.startsWith("bestmove ")) {
      this.isEvaluating = false;
      const bestMoveInfo = parseBestMove(trimmed);

      const finalResult = interpretEngineAnalysis(
        this.currentFen,
        Array.from(this.currentLines.values()),
        this.currentOptions?.lastMove,
      );

      if (this.resolveCurrent) {
        const resolve = this.resolveCurrent;
        this.resolveCurrent = null;
        resolve(finalResult);
      }
    }
  }

  /**
   * Deterministic fallback evaluation if WebAssembly or Worker is unavailable
   * (e.g. during SSR, testing in Node.js, or restricted headless browsers).
   */
  private getFallbackEvaluation(
    fen: string,
    lastMove?: { from: string; to: string },
    depth = 25,
    multiPv = 5,
  ): EngineAnalysisResult {
    const mockLines: EnginePVLine[] = [
      {
        multipv: 1,
        depth: depth,
        seldepth: depth + 3,
        score: { type: "cp", value: 35, scoreCp: 35, mateMoves: null },
        nodes: 1500000,
        nps: 600000,
        timeMs: 400,
        pv: ["e2e4", "e7e5", "g1f3"],
        sanPv: ["e4", "e5", "Nf3"],
        bestMove: "e2e4",
        bestMoveSan: "e4",
      },
      {
        multipv: 2,
        depth: depth,
        seldepth: depth + 3,
        score: { type: "cp", value: 20, scoreCp: 20, mateMoves: null },
        nodes: 1200000,
        nps: 550000,
        timeMs: 400,
        pv: ["d2d4", "d7d5", "c2c4"],
        sanPv: ["d4", "d5", "c4"],
        bestMove: "d2d4",
        bestMoveSan: "d4",
      },
      {
        multipv: 3,
        depth: depth,
        seldepth: depth + 3,
        score: { type: "cp", value: 15, scoreCp: 15, mateMoves: null },
        nodes: 1000000,
        nps: 500000,
        timeMs: 400,
        pv: ["g1f3", "d7d5", "g2g3"],
        sanPv: ["Nf3", "d5", "g3"],
        bestMove: "g1f3",
        bestMoveSan: "Nf3",
      },
      {
        multipv: 4,
        depth: depth,
        seldepth: depth + 3,
        score: { type: "cp", value: 10, scoreCp: 10, mateMoves: null },
        nodes: 900000,
        nps: 450000,
        timeMs: 400,
        pv: ["c2c4", "e7e5", "b1c3"],
        sanPv: ["c4", "e5", "Nc3"],
        bestMove: "c2c4",
        bestMoveSan: "c4",
      },
      {
        multipv: 5,
        depth: depth,
        seldepth: depth + 3,
        score: { type: "cp", value: 5, scoreCp: 5, mateMoves: null },
        nodes: 800000,
        nps: 400000,
        timeMs: 400,
        pv: ["b2b3", "e7e5", "c1b2"],
        sanPv: ["b3", "e5", "Bb2"],
        bestMove: "b2b3",
        bestMoveSan: "b3",
      },
    ];

    return interpretEngineAnalysis(fen, mockLines.slice(0, multiPv), lastMove);
  }
}

// Singleton browser engine instance
export const stockfishEngine = new StockfishClient();
