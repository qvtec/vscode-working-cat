import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { SessionStatus } from './ClaudeWatcher';

function getBgFile(): string {
  const bg = vscode.workspace.getConfiguration('workingCat').get<string>('background', 'bg_park');
  return `${bg}.webp`;
}

export type CatState =
  | 'idle'
  | 'typing'
  | 'saved'
  | 'sleeping'
  | 'error'
  | 'claude_thinking'
  | 'claude_complete'
  | 'claude_permission';

const NAMES_KEY = 'workingCat.sessionNames';
const LOCAL_ID = '__local__';
// セッションが連続でこの回数だけ消えていたら名前を破棄する（一時的な読み取り失敗で消さないため）
const PRUNE_AFTER_MISSES = 5;

export class CatViewProvider extends EventEmitter implements vscode.WebviewViewProvider {
  public static readonly viewType = 'workingCat.catView';

  private view?: vscode.WebviewView;
  private lastSessions: SessionStatus[] = [];
  private missCounts = new Map<string, number>();

  constructor(
    private readonly extensionUri: vscode.Uri,
    private readonly memento: vscode.Memento
  ) {
    super();
  }

  resolveWebviewView(webviewView: vscode.WebviewView): void {
    this.view = webviewView;
    webviewView.webview.options = {
      enableScripts: true,
      localResourceRoots: [
        vscode.Uri.joinPath(this.extensionUri, 'assets'),
        vscode.Uri.joinPath(this.extensionUri, 'media'),
      ],
    };
    webviewView.webview.html = this.buildHtml(webviewView.webview);
    webviewView.webview.onDidReceiveMessage(msg => {
      if (msg?.type === 'renameSession' && typeof msg.id === 'string') {
        this.renameSession(msg.id, typeof msg.name === 'string' ? msg.name : '');
      }
    });
    // webview が開かれたとき最新のセッション状態を再送
    setTimeout(() => this.setSessions(this.lastSessions), 100);
  }

  private getNames(): Record<string, string> {
    return this.memento.get<Record<string, string>>(NAMES_KEY, {});
  }

  /** ユーザーが付けたセッション名を保存する（空文字なら削除して元のタイトルに戻す） */
  private renameSession(id: string, name: string): void {
    const names = { ...this.getNames() };
    const trimmed = name.trim().slice(0, 60);
    if (trimmed) {
      names[id] = trimmed;
    } else {
      delete names[id];
    }
    this.memento.update(NAMES_KEY, names);
  }

  /** 終了したセッションの名前は破棄する（ローカル猫の名前は残す） */
  private pruneNames(sessions: SessionStatus[]): void {
    const alive = new Set(sessions.map(s => s.id));
    const names = this.getNames();
    const next: Record<string, string> = {};
    let changed = false;

    for (const [id, name] of Object.entries(names)) {
      if (id === LOCAL_ID || alive.has(id)) {
        this.missCounts.delete(id);
        next[id] = name;
        continue;
      }
      const misses = (this.missCounts.get(id) ?? 0) + 1;
      if (misses < PRUNE_AFTER_MISSES) {
        this.missCounts.set(id, misses);
        next[id] = name;
      } else {
        this.missCounts.delete(id);
        changed = true;
      }
    }

    if (changed) this.memento.update(NAMES_KEY, next);
  }

  setSessions(sessions: SessionStatus[]): void {
    this.lastSessions = sessions;
    this.pruneNames(sessions);
    this.view?.webview.postMessage({ type: 'setSessions', sessions });
  }

  setLocalState(state: CatState): void {
    this.view?.webview.postMessage({ type: 'setLocalState', state });
  }

  setSoundEnabled(enabled: boolean): void {
    this.view?.webview.postMessage({ type: 'setSoundEnabled', enabled });
  }

  setSoundVolume(volume: number): void {
    this.view?.webview.postMessage({ type: 'setSoundVolume', volume });
  }

  setSnoozeConfig(enabled: boolean, interval: number, count: number): void {
    this.view?.webview.postMessage({ type: 'setSnoozeConfig', enabled, interval, count });
  }

  refreshBackground(): void {
    if (!this.view) return;
    const uri = this.view.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'assets', getBgFile())
    ).toString();
    this.view.webview.postMessage({ type: 'setBackground', uri });
  }

  private buildHtml(webview: vscode.Webview): string {
    const assetUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', file));
    const mediaUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));
    const soundUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', 'sounds', file));
    const nonce = getNonce();
    const soundEnabled = vscode.workspace.getConfiguration('workingCat').get<boolean>('sound', true);
    const soundVolume = vscode.workspace.getConfiguration('workingCat').get<number>('volume', 0.5);
    const snoozeEnabled = vscode.workspace.getConfiguration('workingCat').get<boolean>('snooze', false);
    const snoozeInterval = vscode.workspace.getConfiguration('workingCat').get<number>('snoozeInterval', 30);
    const snoozeCount = vscode.workspace.getConfiguration('workingCat').get<number>('snoozeCount', 3);

    // Each state has one or more patterns (arrays of frames).
    // cat.js picks one pattern at random when entering the state.
    const images: Record<string, string[][]> = {
      idle:             [['cat6_1.png']],
      typing:           [['cat9_1.png', 'cat9_2.png']],
      saved:            [['cat3_1.png']],
      sleeping:         [['cat6_1.png']],
      error:            [['cat8_1.png']],
      claude_idle:      [['cat6_1.png', 'cat6_2.png']],
      claude_thinking:  [['cat2_1.png', 'cat2_2.png', 'cat2_3.png'], ['cat4_1.png', 'cat4_2.png'], ['cat1_1.png', 'cat1_2.png']],
      claude_complete:  [['cat3_1.png']],
      claude_permission:[['cat5_1.png']],
    };

    const imageUriMap: Record<string, string[][]> = {};
    for (const [state, patterns] of Object.entries(images)) {
      imageUriMap[state] = patterns.map(frames => frames.map(f => assetUri(f).toString()));
    }

    const decoMap: Record<string, string> = {
      glasses:   assetUri('decorations/deco_glasses.png').toString(),
      ribbon:    assetUri('decorations/deco_ribbon.png').toString(),
      crown:     assetUri('decorations/deco_crown.png').toString(),
      flower:    assetUri('decorations/deco_flower.png').toString(),
      strawhat:  assetUri('decorations/deco_strawhat.png').toString(),
    };

    // Sprite sheet definitions: state -> { cols, rows, totalFrames, interval(ms) }
    const spriteMap: Record<string, { cols: number; rows: number; totalFrames: number; interval: number }> = {};

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource}; media-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src 'unsafe-inline';">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { margin: 0; padding: 0; overflow: hidden; background: #000; }
    #bg { width: 100%; height: auto; display: block; }
    #cats-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; z-index: 1; }
    .cat-item { position: absolute; display: flex; flex-direction: column; align-items: center; width: 100px; transform: translateX(-50%); }
    .cat-img-wrap { position: relative; width: 100px; height: 100px; isolation: isolate; }
    #cats-container.workflow .cat-img-wrap::before { content: ''; position: absolute; inset: -12px; border-radius: 50%; background: radial-gradient(circle, rgba(150, 80, 255, 0.55) 0%, transparent 70%); pointer-events: none; z-index: -1; animation: workflow-glow 2.5s ease-in-out infinite; }
    #cats-container.workflow .cat-item.workflow-done .cat-img-wrap::before { animation: none; opacity: 0.2; }
    @keyframes workflow-glow { 0%,100% { opacity: 0.4; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.15); } }
    .cat-item.snooze-ring-2 .cat-img-wrap::after,
    .cat-item.snooze-ring-3 .cat-img-wrap::after { content: ''; position: absolute; border-radius: 50%; pointer-events: none; z-index: -1; animation: snooze-pulse 1.8s ease-in-out infinite; }
    .cat-item.snooze-ring-1 .cat-img-wrap::after { content: ''; position: absolute; border-radius: 50%; pointer-events: none; z-index: -1; inset: -8px; background: radial-gradient(circle, rgba(255,160,0,0.3) 0%, transparent 70%); filter: blur(5px); }
    .cat-item.snooze-ring-2 .cat-img-wrap::after { inset: -14px; background: radial-gradient(circle, rgba(255,110,0,0.45) 0%, transparent 70%); filter: blur(6px); }
    .cat-item.snooze-ring-3 .cat-img-wrap::after { inset: -22px; background: radial-gradient(circle, rgba(255,50,0,0.6) 0%, transparent 70%); filter: blur(9px); }
    @keyframes snooze-pulse { 0%,100% { opacity: 0.55; transform: scale(0.9); } 50% { opacity: 1; transform: scale(1.12); } }
    .cat-img { width: 100px; height: 100px; background-repeat: no-repeat; background-position: center; background-size: contain; image-rendering: auto; transition: opacity 0.1s ease; }
    .cat-decoration { position: absolute; top: 0; left: 0; width: 100px; height: 100px; pointer-events: none; z-index: 1; display: none; }
    @keyframes slide-in-from-left {
      from { transform: translateX(calc(-50% - 120vw)); }
      to   { transform: translateX(-50%); }
    }
    @keyframes slide-in-from-right {
      from { transform: translateX(calc(-50% + 120vw)); }
      to   { transform: translateX(-50%); }
    }
    .cat-item.cat-entering-left  { animation: slide-in-from-left  2s ease-out; }
    .cat-item.cat-entering-right { animation: slide-in-from-right 2s ease-out; }
    .cat-img.cat-flip { transform: scaleX(-1); }
    .cat-label-wrap { position: absolute; bottom: 100%; left: 50%; transform: translateX(-50%); background: url('${assetUri('label.png')}') no-repeat center / 100% 100%; padding: 4px 10px 6px; text-align: center; min-width: 80px; white-space: nowrap; }
    .cat-status { font-size: 11px; color: #555; text-align: center; letter-spacing: 0.05em; }
    .cat-name { position: absolute; top: 100%; left: 50%; transform: translateX(-50%); max-width: 130px; padding: 1px 5px; border-radius: 4px; font-size: 10px; line-height: 1.4; color: #fff; text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; text-shadow: 0 1px 2px rgba(0,0,0,0.95), 0 0 4px rgba(0,0,0,0.8); cursor: text; z-index: 20; }
    .cat-name:hover { background: rgba(0,0,0,0.55); }
    .cat-name:empty::before { content: '＋'; opacity: 0.55; }
    .cat-name[data-editing="1"] { max-width: none; padding: 0; overflow: visible; background: none; }
    .cat-name-input { width: 120px; padding: 1px 3px; border: 1px solid rgba(255,255,255,0.7); border-radius: 4px; background: rgba(0,0,0,0.8); color: #fff; font: inherit; font-size: 10px; text-align: center; outline: none; }
    .cat-notif-type { font-size: 10px; color: #000; text-align: center; white-space: nowrap; margin-top: 2px; min-height: 13px; }
    #sound-unlock-btn { position: fixed; top: 8px; right: 8px; width: 28px; height: 28px; border-radius: 50%; background: rgba(0,0,0,0.45); border: none; cursor: pointer; font-size: 15px; display: flex; align-items: center; justify-content: center; z-index: 100; animation: sound-pulse 1.5s ease-in-out infinite; }
    @keyframes sound-pulse { 0%,100% { opacity: 0.5; transform: scale(1); } 50% { opacity: 1; transform: scale(1.15); } }
  </style>
</head>
<body>
  <audio id="snd-calm"      src="${soundUri('cat1.mp3')}" preload="auto"></audio>
  <audio id="snd-energetic" src="${soundUri('cat2.mp3')}" preload="auto"></audio>
  <audio id="snd-hesitant"  src="${soundUri('cat3.mp3')}" preload="auto"></audio>
  <button id="sound-unlock-btn" title="Click to enable sound" style="${soundEnabled ? '' : 'display:none'}">🔊</button>
  <img id="bg" src="${assetUri(getBgFile())}" alt="" />
  <div id="cats-container"></div>
  <script nonce="${nonce}">
    const IMAGE_MAP = ${JSON.stringify(imageUriMap)};
    const DECO_MAP = ${JSON.stringify(decoMap)};
    const SPRITE_MAP = ${JSON.stringify(spriteMap)};
    let SOUND_ENABLED = ${soundEnabled};
    let SOUND_VOLUME = ${soundVolume};
    let SNOOZE_ENABLED = ${snoozeEnabled};
    let SNOOZE_INTERVAL = ${snoozeInterval};
    let SNOOZE_COUNT = ${snoozeCount};
    const NAME_OVERRIDES = ${JSON.stringify(this.getNames())};
    const vscode = acquireVsCodeApi();
  </script>
  <script nonce="${nonce}" src="${mediaUri('cat.js')}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}
