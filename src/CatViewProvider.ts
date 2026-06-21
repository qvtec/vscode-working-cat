import * as vscode from 'vscode';
import { EventEmitter } from 'events';
import type { SessionStatus } from './ClaudeWatcher';

function getBgFile(): string {
  const bg = vscode.workspace.getConfiguration('workingCat').get<string>('background', 'bg2');
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

export class CatViewProvider extends EventEmitter implements vscode.WebviewViewProvider {
  public static readonly viewType = 'workingCat.catView';

  private view?: vscode.WebviewView;
  private lastSessions: SessionStatus[] = [];

  constructor(private readonly extensionUri: vscode.Uri) {
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
      if (msg.type === 'catClicked') {
        this.emit('catClicked', msg);
      }
    });
    // webview が開かれたとき最新のセッション状態を再送
    setTimeout(() => this.setSessions(this.lastSessions), 100);
  }

  setSessions(sessions: SessionStatus[]): void {
    this.lastSessions = sessions;
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
    #cats-container { position: absolute; top: 0; left: 0; width: 100%; height: 100%; }
    .cat-item { position: absolute; display: flex; flex-direction: column; align-items: center; width: 100px; transform: translateX(-50%); }
    .cat-img-wrap { position: relative; width: 100px; height: 100px; }
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
    .cat-title { font-size: 10px; color: #333; text-align: center; max-width: 100px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
    .cat-status { font-size: 11px; color: #555; text-align: center; letter-spacing: 0.05em; }
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
