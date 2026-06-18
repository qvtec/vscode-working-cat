import * as vscode from 'vscode';
import * as path from 'path';

export type CatState =
  | 'idle'
  | 'typing'
  | 'saved'
  | 'sleeping'
  | 'error'
  | 'claude_thinking'
  | 'claude_complete'
  | 'claude_permission';

export class CatViewProvider implements vscode.WebviewViewProvider {
  public static readonly viewType = 'workingCat.catView';

  private view?: vscode.WebviewView;
  private readonly extensionUri: vscode.Uri;

  constructor(extensionUri: vscode.Uri) {
    this.extensionUri = extensionUri;
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
  }

  setState(state: CatState): void {
    this.view?.webview.postMessage({ type: 'setState', state });
  }

  private buildHtml(webview: vscode.Webview): string {
    const assetUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'assets', file));

    const mediaUri = (file: string) =>
      webview.asWebviewUri(vscode.Uri.joinPath(this.extensionUri, 'media', file));

    const nonce = getNonce();

    const images: Record<string, string[]> = {
      idle: ['cat1_1.png', 'cat1_2.png'],
      typing: ['cat4_1.png', 'cat4_2.png'],
      saved: ['cat3_1.png'],
      sleeping: ['cat6_1.png', 'cat6_2.png'],
      error: ['cat8_1.png'],
      claude_thinking: ['cat2_1.png', 'cat2_2.png', 'cat2_3.png'],
      claude_complete: ['cat3_1.png'],
      claude_permission: ['cat5_1.png'],
    };

    const imageUriMap: Record<string, string[]> = {};
    for (const [state, files] of Object.entries(images)) {
      imageUriMap[state] = files.map((f) => assetUri(f).toString());
    }

    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="Content-Security-Policy"
    content="default-src 'none'; img-src ${webview.cspSource}; script-src 'nonce-${nonce}'; style-src '${webview.cspSource}' 'unsafe-inline';">
  <link rel="stylesheet" href="${mediaUri('cat.css')}">
</head>
<body>
  <div id="cat-container">
    <img id="cat-img" src="${assetUri('cat1_1.png')}" alt="cat">
    <div id="state-label">idle</div>
  </div>
  <script nonce="${nonce}">
    const IMAGE_MAP = ${JSON.stringify(imageUriMap)};
  </script>
  <script nonce="${nonce}" src="${mediaUri('cat.js')}"></script>
</body>
</html>`;
  }
}

function getNonce(): string {
  let text = '';
  const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  for (let i = 0; i < 32; i++) {
    text += possible.charAt(Math.floor(Math.random() * possible.length));
  }
  return text;
}
