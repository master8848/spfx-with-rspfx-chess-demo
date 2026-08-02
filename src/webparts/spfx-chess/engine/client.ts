import type { SearchRequest, EngineResponse } from './engineWorker';
import { Chess } from 'chess.js';

export interface SearchResult {
  move: string | null;
  depth: number;
  nodes: number;
  score: number;
}

type Resolver = (result: SearchResult) => void;
type Rejecter = (err: unknown) => void;

const NULL_RESULT: SearchResult = { move: null, depth: 0, nodes: 0, score: 0 };

function randomLegalMove(fen: string): SearchResult {
  const legal = new Chess(fen).moves({ verbose: false });
  if (legal.length === 0) return { ...NULL_RESULT };
  return { move: legal[Math.floor(Math.random() * legal.length)], depth: 0, nodes: 0, score: 0 };
}

export class EngineClient {
  private worker: Worker | null = null;
  private syncMode = false;
  private nextId = 1;
  private handlers = new Map<number, { resolve: Resolver; reject: Rejecter }>();
  private onError: (message: string) => void = () => {};

  setOnError(fn: (message: string) => void): void {
    this.onError = fn;
  }

  start(): void {
    try {
      const worker = new Worker(new URL('./engineWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (event: MessageEvent) => {
        const msg = event.data as EngineResponse;
        if (msg.type === 'bestmove') {
          const handler = this.handlers.get(msg.id);
          if (handler) {
            this.handlers.delete(msg.id);
            handler.resolve({ move: msg.move, depth: msg.depth, nodes: msg.nodes, score: msg.score });
          }
        } else if (msg.type === 'error') {
          this.settleAll(NULL_RESULT);
          this.onError(msg.message);
        }
      };
      worker.onerror = (event) => {
        this.rejectAll(event.error ?? new Error(`Worker error: ${event.message}`));
        this.onError(`Worker error: ${event.message}`);
        this.worker = null;
        this.syncMode = true;
      };
      this.worker = worker;
    } catch {
      this.syncMode = true;
    }
  }

  async search(fen: string, eloKey: string): Promise<SearchResult> {
    if (this.syncMode) {
      return randomLegalMove(fen);
    }
    const id = this.nextId++;
    const request: SearchRequest = { id, type: 'search', fen, eloKey };
    return new Promise<SearchResult>((resolve, reject) => {
      this.handlers.set(id, { resolve, reject });
      try {
        this.worker?.postMessage(request);
      } catch (err) {
        this.handlers.delete(id);
        reject(err);
      }
    });
  }

  dispose(): void {
    this.worker?.terminate();
    this.worker = null;
    this.settleAll(NULL_RESULT);
  }

  private settleAll(result: SearchResult): void {
    for (const handler of this.handlers.values()) {
      handler.resolve(result);
    }
    this.handlers.clear();
  }

  private rejectAll(err: unknown): void {
    for (const handler of this.handlers.values()) {
      handler.reject(err);
    }
    this.handlers.clear();
  }
}
