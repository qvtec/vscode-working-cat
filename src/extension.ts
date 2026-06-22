import * as vscode from 'vscode';
import { CatViewProvider } from './CatViewProvider';
import { ClaudeWatcher, SessionStatus } from './ClaudeWatcher';
import { registerHooks, unregisterHooks } from './hookRegistrar';

const IDLE_TIMEOUT_MS = 5 * 60 * 1000;
const TYPING_COOLDOWN_MS = 2000;

export function activate(context: vscode.ExtensionContext): void {
  // Register Claude Code hooks pointing to this extension's hook script
  try {
    const changed = registerHooks(context.extensionUri.fsPath);
    if (changed) {
      vscode.window.showInformationMessage('Working Cat: Claude Code hooks registered.');
    }
  } catch (e) {
    vscode.window.showWarningMessage(`Working Cat: Failed to register hooks: ${e}`);
  }

  context.subscriptions.push(
    vscode.commands.registerCommand('workingCat.unregisterHooks', () => {
      try {
        const changed = unregisterHooks();
        vscode.window.showInformationMessage(
          changed ? 'Working Cat: hooks removed from ~/.claude/settings.json.' : 'Working Cat: no hooks to remove.'
        );
      } catch (e) {
        vscode.window.showWarningMessage(`Working Cat: Failed to unregister hooks: ${e}`);
      }
    })
  );

  const provider = new CatViewProvider(context.extensionUri);
  context.subscriptions.push(
    vscode.window.registerWebviewViewProvider(CatViewProvider.viewType, provider)
  );

  let typingTimer: ReturnType<typeof setTimeout> | undefined;
  let idleTimer: ReturnType<typeof setTimeout> | undefined;
  let errorCount = 0;
  let claudeSessions: SessionStatus[] = [];

  function hasClaude(): boolean {
    return claudeSessions.length > 0;
  }

  function resetIdleTimer(): void {
    clearTimeout(idleTimer);
    idleTimer = setTimeout(() => {
      if (!hasClaude()) provider.setLocalState('sleeping');
    }, IDLE_TIMEOUT_MS);
  }

  context.subscriptions.push(
    vscode.workspace.onDidChangeTextDocument(() => {
      if (hasClaude()) return;
      provider.setLocalState('typing');
      resetIdleTimer();
      clearTimeout(typingTimer);
      typingTimer = setTimeout(() => {
        if (!hasClaude()) provider.setLocalState('idle');
      }, TYPING_COOLDOWN_MS);
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidSaveTextDocument(() => {
      if (hasClaude()) return;
      provider.setLocalState('saved');
      resetIdleTimer();
      setTimeout(() => {
        if (!hasClaude()) provider.setLocalState('idle');
      }, 1500);
    })
  );

  context.subscriptions.push(
    vscode.languages.onDidChangeDiagnostics((e) => {
      if (hasClaude()) return;
      let newErrorCount = 0;
      for (const uri of e.uris) {
        const diags = vscode.languages.getDiagnostics(uri);
        newErrorCount += diags.filter(d => d.severity === vscode.DiagnosticSeverity.Error).length;
      }
      if (newErrorCount > errorCount) {
        provider.setLocalState('error');
        setTimeout(() => {
          if (!hasClaude()) provider.setLocalState('idle');
        }, 3000);
      }
      errorCount = newErrorCount;
    })
  );

  context.subscriptions.push(
    vscode.workspace.onDidChangeConfiguration(e => {
      if (e.affectsConfiguration('workingCat.background')) {
        provider.refreshBackground();
      }
      if (e.affectsConfiguration('workingCat.sound')) {
        const enabled = vscode.workspace.getConfiguration('workingCat').get<boolean>('sound', true);
        provider.setSoundEnabled(enabled);
      }
      if (e.affectsConfiguration('workingCat.volume')) {
        const volume = vscode.workspace.getConfiguration('workingCat').get<number>('volume', 0.5);
        provider.setSoundVolume(volume);
      }
    })
  );

  const claudeWatcher = new ClaudeWatcher();
  claudeWatcher.on('sessions', (sessions: SessionStatus[]) => {
    claudeSessions = sessions;
    provider.setSessions(sessions);
    resetIdleTimer();
  });
  claudeWatcher.start();
  context.subscriptions.push({ dispose: () => claudeWatcher.stop() });


  resetIdleTimer();
}

export function deactivate(): void {}
