import * as vscode from 'vscode';
import { CatViewProvider } from './CatViewProvider';
import { ClaudeWatcher } from './ClaudeWatcher';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const TYPING_COOLDOWN_MS = 2000;

export function activate(context: vscode.ExtensionContext): void {
  const provider = new CatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CatViewProvider.viewType, provider)
  );

  let typingTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let errorCount = 0;
  let claudeActive = false;

  function resetIdleTimer(): void {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!claudeActive) {
        provider.setState('sleeping');
      }
    }, IDLE_TIMEOUT_MS);
  }

  function onActivity(): void {
    resetIdleTimer();
  }

  // Typing
  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      if (claudeActive) {
        return;
      }
      provider.setState('typing');
      onActivity();
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (!claudeActive) {
          provider.setState('idle');
        }
      }, TYPING_COOLDOWN_MS);
    })
  );

  // Save
  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      if (claudeActive) {
        return;
      }
      provider.setState('saved');
      onActivity();
      setTimeout(() => {
        if (!claudeActive) {
          provider.setState('idle');
        }
      }, 1500);
    })
  );

  // Diagnostics (errors)
  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      if (claudeActive) {
        return;
      }
      let newErrorCount = 0;
      for (const uri of e.uris) {
        const diags = vscode.languages.getDiagnostics(uri);
        newErrorCount += diags.filter((d) => d.severity === vscode.DiagnosticSeverity.Error).length;
      }
      if (newErrorCount > errorCount) {
        provider.setState('error');
        setTimeout(() => {
          if (!claudeActive) {
            provider.setState('idle');
          }
        }, 3000);
      }
      errorCount = newErrorCount;
    })
  );

  // Claude Code watcher
  const claudeWatcher = new ClaudeWatcher();
  claudeWatcher.on('status', (status: string) => {
    if (status === 'thinking') {
      claudeActive = true;
      provider.setState('claude_thinking');
      onActivity();
    } else if (status === 'complete') {
      claudeActive = false;
      provider.setState('claude_complete');
      onActivity();
      setTimeout(() => provider.setState('idle'), 2000);
    } else if (status === 'permission') {
      claudeActive = true;
      provider.setState('claude_permission');
      onActivity();
    } else {
      claudeActive = false;
      provider.setState('idle');
    }
  });
  claudeWatcher.start();
  context.subscriptions.push({ dispose: () => claudeWatcher.stop() });

  resetIdleTimer();
}

export function deactivate(): void {}
