import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

export type ClaudeStatus = 'thinking' | 'complete' | 'permission' | 'error' | 'idle';

export interface SessionStatus {
  id: string;
  status: ClaudeStatus;
  dir?: string;
  title?: string;
  shellPid?: number;
  sessionId?: string;
}

const SESSIONS_DIR = path.join(os.homedir(), '.claude-cat-sessions');
const STALE_MS = 30 * 60 * 1000; // 30 minutes

export class ClaudeWatcher extends EventEmitter {
  private dirWatcher: fs.FSWatcher | null = null;
  private fileWatchers: Map<string, fs.FSWatcher> = new Map();
  private staleTimer: ReturnType<typeof setInterval> | null = null;

  start(): void {
    this.ensureDirExists();
    this.watchDirectory();
    this.watchExistingFiles();
    this.emitSessions();
    this.staleTimer = setInterval(() => this.emitSessions(), 2 * 1000);
  }

  stop(): void {
    this.dirWatcher?.close();
    this.dirWatcher = null;
    for (const w of this.fileWatchers.values()) w.close();
    this.fileWatchers.clear();
    if (this.staleTimer) {
      clearInterval(this.staleTimer);
      this.staleTimer = null;
    }
  }

  private ensureDirExists(): void {
    if (!fs.existsSync(SESSIONS_DIR)) {
      fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    }
  }

  private watchDirectory(): void {
    this.dirWatcher = fs.watch(SESSIONS_DIR, (_event, filename) => {
      if (!filename || !filename.endsWith('.json')) return;
      const filePath = path.join(SESSIONS_DIR, filename);
      if (fs.existsSync(filePath)) {
        this.watchFile(filePath);
      } else {
        const w = this.fileWatchers.get(filePath);
        if (w) {
          w.close();
          this.fileWatchers.delete(filePath);
        }
      }
      this.emitSessions();
    });
  }

  private watchExistingFiles(): void {
    const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
    for (const file of files) {
      this.watchFile(path.join(SESSIONS_DIR, file));
    }
  }

  private watchFile(filePath: string): void {
    if (this.fileWatchers.has(filePath)) return;
    try {
      const w = fs.watch(filePath, () => this.emitSessions());
      this.fileWatchers.set(filePath, w);
    } catch {
      // file may not exist yet
    }
  }

  private emitSessions(): void {
    const sessions: SessionStatus[] = [];
    const now = Date.now();
    try {
      const files = fs.readdirSync(SESSIONS_DIR).filter(f => f.endsWith('.json'));
      for (const file of files) {
        const filePath = path.join(SESSIONS_DIR, file);
        try {
          const raw = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(raw) as { status: ClaudeStatus; timestamp: number; session: string; dir?: string; title?: string; shell_pid?: number; session_id?: string };
          const ageMs = now - data.timestamp * 1000;
          const staleLimit = data.status === 'idle' ? 5 * 60 * 1000 : STALE_MS;
          if (ageMs > staleLimit) {
            fs.unlinkSync(filePath);
            continue;
          }
          sessions.push({ id: data.session || file.replace('.json', ''), status: data.status, dir: data.dir, title: data.title, shellPid: data.shell_pid, sessionId: data.session_id });
        } catch {
          // skip malformed files
        }
      }
    } catch {
      // skip if dir unreadable
    }
    this.emit('sessions', sessions);
  }
}
