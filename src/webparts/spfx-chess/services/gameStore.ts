import type { WebPartContext } from '@microsoft/sp-webpart-base';
import { spfi, SPFx as spSPFx, type SPFI } from '@pnp/sp';
import '@pnp/sp/webs';
import '@pnp/sp/lists';
import '@pnp/sp/items';
import '@pnp/sp/fields';

export interface SavedMove {
  san: string;
  uci: string;
}

export interface SavedGame {
  id: number | string;
  title: string;
  pgn: string;
  moves: SavedMove[];
  result: string;
  whiteElo: number;
  blackElo: number;
  whiteName: string;
  blackName: string;
  site: string;
  durationMs: number;
  eval: number;
  created: string;
}

export interface NewGame {
  title: string;
  pgn: string;
  moves: SavedMove[];
  result: string;
  whiteElo: number;
  blackElo: number;
  whiteName: string;
  blackName: string;
  site: string;
  durationMs: number;
  eval: number;
}

export type StoreMode = 'sharepoint' | 'demo';

const SELECT = 'Id,Title,Created,PGN,Moves,Result,WhiteElo,BlackElo,WhiteName,BlackName,Site,DurationMs,EvalCp';

interface DemoItem {
  id: number | string;
  title: string;
  pgn: string;
  moves: SavedMove[];
  result: string;
  whiteElo: number;
  blackElo: number;
  whiteName: string;
  blackName: string;
  site: string;
  durationMs: number;
  eval: number;
  created: string;
}

interface ItemLike {
  Id?: number;
  Title?: string | null;
  Created?: string | null;
  PGN?: string | null;
  Moves?: string | null;
  Result?: string | null;
  WhiteElo?: number | null;
  BlackElo?: number | null;
  WhiteName?: string | null;
  BlackName?: string | null;
  Site?: string | null;
  DurationMs?: number | null;
  EvalCp?: number | null;
}

export class GameStore {
  private sp: SPFI;
  private listName: string;
  private siteUrl: string;
  private demoKey: string;
  private ready: Promise<boolean> | null = null;
  mode: StoreMode;
  private static demoIdSeq = 0;

  private constructor(sp: SPFI, listName: string, siteUrl: string) {
    this.sp = sp;
    this.listName = listName;
    this.siteUrl = siteUrl;
    this.demoKey = `spfx-chess-games-v1-${listName}`;
    this.mode = 'sharepoint';
  }

  static async create(context: WebPartContext, listName: string): Promise<GameStore> {
    if (context?.spHttpClient && context?.pageContext?.web?.absoluteUrl) {
      try {
        const sp = spfi().using(spSPFx(context));
        const store = new GameStore(sp, listName, context.pageContext.web.absoluteUrl);
        const ok = await store.ensureList();
        if (ok) return store;
      } catch (err) {
        console.warn('[chess] vault unavailable, falling back to local mode:', err);
      }
    }
    const store = new GameStore(null as unknown as SPFI, listName, 'local');
    store.mode = 'demo';
    return store;
  }

  async ensureList(): Promise<boolean> {
    if (this.ready) return this.ready;
    this.ready = this.ensureListInternal().then((ok) => {
      if (!ok) this.ready = null;
      return ok;
    });
    return this.ready;
  }

  private async ensureWritable(): Promise<void> {
    try {
      const found = await this.sp.web.lists.filter(`Title eq '${this.listName.replace(/'/g, "''")}'`)();
      if (found.length === 0) {
        this.ready = null;
        await this.ensureList();
      }
    } catch {
      // The filter lookup itself failed — assume the list exists and move on.
    }
  }

  private async ensureListInternal(): Promise<boolean> {
    try {
      const list = await this.sp.web.lists.getByTitle(this.listName)();
      if (!list) throw new Error('missing');
    } catch {
      await this.sp.web.lists.add(this.listName, 'Play Fish games', 100);
    }
    await this.ensureFields();
    return true;
  }

  private async ensureFields(): Promise<void> {
    const fields = this.sp.web.lists.getByTitle(this.listName).fields;
    const defs = [
      { name: 'PGN', add: () => fields.addMultilineText('PGN', { RichText: false, NumberOfLines: 8 }) },
      { name: 'Moves', add: () => fields.addMultilineText('Moves', { RichText: false, NumberOfLines: 8 }) },
      { name: 'Result', add: () => fields.addText('Result', {}) },
      { name: 'WhiteElo', add: () => fields.addNumber('WhiteElo', {}) },
      { name: 'BlackElo', add: () => fields.addNumber('BlackElo', {}) },
      { name: 'WhiteName', add: () => fields.addText('WhiteName', {}) },
      { name: 'BlackName', add: () => fields.addText('BlackName', {}) },
      { name: 'Site', add: () => fields.addText('Site', {}) },
      { name: 'DurationMs', add: () => fields.addNumber('DurationMs', {}) },
      { name: 'EvalCp', add: () => fields.addNumber('EvalCp', {}) },
    ];
    for (const def of defs) {
      try {
        await def.add();
      } catch {
        /* field already exists — idempotent setup */
      }
    }
  }

  async saveGame(game: NewGame): Promise<SavedGame> {
    if (this.mode === 'demo') {
      const item: DemoItem = {
        id: this.newDemoId(),
        title: game.title,
        pgn: game.pgn,
        moves: game.moves,
        result: game.result,
        whiteElo: game.whiteElo,
        blackElo: game.blackElo,
        whiteName: game.whiteName,
        blackName: game.blackName,
        site: game.site,
        durationMs: game.durationMs,
        eval: game.eval,
        created: new Date().toISOString(),
      };
      const all = this.readDemo();
      all.unshift(item);
      this.writeDemo(all);
      return item;
    }

    const payload = {
      Title: game.title,
      PGN: game.pgn,
      Moves: JSON.stringify(game.moves),
      Result: game.result,
      WhiteElo: game.whiteElo,
      BlackElo: game.blackElo,
      WhiteName: game.whiteName,
      BlackName: game.blackName,
      Site: game.site,
      DurationMs: game.durationMs,
      EvalCp: game.eval,
    };
    const add = () =>
      this.sp.web.lists
        .getByTitle(this.listName)
        .items.add(payload)
        .then((added) => {
          const id = (added as { data?: ItemLike }).data?.Id;
          if (id == null) throw new Error('SharePoint did not return an item id');
          return this.toSaved(id, game);
        });

    try {
      return await add();
    } catch {
      // The post may have succeeded even though the response was lost —
      // verify before retrying so a retry never creates a duplicate.
      const landed = await this.findRecentlyCreated(game.title, game.result);
      if (landed) return landed;
      try {
        await this.ensureWritable();
      } catch {
        /* list repair failed — still try once more, then verify */
      }
      try {
        return await add();
      } catch (second) {
        const landedAgain = await this.findRecentlyCreated(game.title, game.result);
        if (landedAgain) return landedAgain;
        const detail = second instanceof Error ? second.message : String(second);
        throw new Error(`Could not archive the game (${detail})`);
      }
    }
  }

  async listGames(): Promise<SavedGame[]> {
    if (this.mode === 'demo') return this.readDemo();
    const query = () =>
      this.sp.web.lists
        .getByTitle(this.listName)
        .items.select(SELECT)
        .orderBy('Created', false)
        .top(50)();
    await this.ensureWritable();
    let items;
    try {
      items = await query();
    } catch (err) {
      await this.ensureWritable();
      items = await query();
    }
    return items.map((it) => this.mapItem(it as ItemLike));
  }

  async deleteGame(id: number | string): Promise<void> {
    if (this.mode === 'demo') {
      this.writeDemo(this.readDemo().filter((g) => g.id !== id));
      return;
    }
    await this.sp.web.lists.getByTitle(this.listName).items.getById(id as number).delete();
  }

  getSiteUrl(): string {
    return this.siteUrl;
  }

  private toSaved(id: number, game: NewGame): SavedGame {
    return {
      id,
      title: game.title,
      pgn: game.pgn,
      moves: game.moves,
      result: game.result,
      whiteElo: game.whiteElo,
      blackElo: game.blackElo,
      whiteName: game.whiteName,
      blackName: game.blackName,
      site: game.site,
      durationMs: game.durationMs,
      eval: game.eval,
      created: new Date().toISOString(),
    };
  }

  private mapItem(it: ItemLike): SavedGame {
    let moves: SavedMove[] = [];
    try {
      moves = JSON.parse(it.Moves ?? '[]');
    } catch {
      moves = [];
    }
    return {
      id: Number(it.Id ?? 0),
      title: it.Title ?? '',
      pgn: it.PGN ?? '',
      moves,
      result: it.Result ?? '',
      whiteElo: Number(it.WhiteElo ?? 0),
      blackElo: Number(it.BlackElo ?? 0),
      whiteName: it.WhiteName ?? '',
      blackName: it.BlackName ?? '',
      site: it.Site ?? '',
      durationMs: Number(it.DurationMs ?? 0),
      eval: Number(it.EvalCp ?? 0),
      created: it.Created ?? '',
    };
  }

  private async findRecentlyCreated(title: string, result?: string): Promise<SavedGame | null> {
    try {
      const conditions = [`Title eq '${title.replace(/'/g, "''")}'`];
      if (result) conditions.push(`Result eq '${result}'`);
      const items = await this.sp.web.lists
        .getByTitle(this.listName)
        .items.select(SELECT)
        .filter(conditions.join(' and '))
        .orderBy('Created', false)
        .top(1)();
      const it = items[0];
      if (!it) return null;
      const createdMs = new Date(it.Created ?? 0).getTime();
      if (!Number.isFinite(createdMs) || Date.now() - createdMs > 30_000) return null;
      return this.mapItem(it as ItemLike);
    } catch {
      return null;
    }
  }

  private newDemoId(): number | string {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
      return crypto.randomUUID();
    }
    return Date.now() + ++GameStore.demoIdSeq;
  }

  private readDemo(): DemoItem[] {
    try {
      return JSON.parse(localStorage.getItem(this.demoKey) ?? '[]') as DemoItem[];
    } catch {
      return [];
    }
  }

  private writeDemo(items: DemoItem[]): void {
    try {
      localStorage.setItem(this.demoKey, JSON.stringify(items));
    } catch {
      /* storage full or unavailable — ignore */
    }
  }
}
