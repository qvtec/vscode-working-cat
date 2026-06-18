import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { EventEmitter } from 'events';

export type ClaudeStatus = 'thinking' | 'complete' | 'permission' | 'idle';

const STATUS_FILE = path.join(os.homedir(), '.claude-cat-status.json');
const STALE_THRESHOLD_MS = 5000;

export class ClaudeWatcher extends EventEmitter {
  private watcher: fs.FSWatcher | null = null;

  start(): void {
    this.ensureFileExists();
    this.watcher = fs.watch(STATUS_FILE, () => this.onFileChange());
  }

  stop(): void {
    this.watcher?.close();
    this.watcher = null;
  }

  private ensureFileExists(): void {
    if (!fs.existsSync(STATUS_FILE)) {
      fs.writeFileSync(STATUS_FILE, JSON.stringify({ status: 'idle', timestamp: 0 }));
    }
  }

  private onFileChange(): void {
    try {
      const raw = fs.readFileSync(STATUS_FILE, 'utf-8');
      const data = JSON.parse(raw) as { status: ClaudeStatus; timestamp: number };
      const age = Date.now() / 1000 - data.timestamp;
      if (age > STALE_THRESHOLD_MS / 1000) {
        return;
      }
      this.emit('status', data.status);
    } catch {
      // ignore parse errors
    }
  }
}
