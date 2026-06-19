import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

const SETTINGS_PATH = path.join(os.homedir(), '.claude', 'settings.json');
const HOOK_SCRIPT_NAME = 'notify-vscode.sh';

const HOOK_EVENTS: [string, string][] = [
  ['SessionStart', 'start'],
  ['UserPromptSubmit', 'thinking'],
  ['PreToolUse', 'thinking'],
  ['PostToolUseFailure', 'error'],
  ['Stop', 'complete'],
  ['Notification', 'complete'],
  ['PermissionRequest', 'permission'],
  ['SessionEnd', 'idle'],
];

export function registerHooks(extensionPath: string): boolean {
  const hookScript = path.join(extensionPath, 'hooks', HOOK_SCRIPT_NAME);

  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    // file doesn't exist or invalid JSON
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') {
    settings.hooks = {};
  }
  const hooks = settings.hooks as Record<string, unknown[]>;

  let changed = false;

  for (const [event, status] of HOOK_EVENTS) {
    const command = `bash "${hookScript}" ${status}`;

    if (!hooks[event]) hooks[event] = [];
    const groups = hooks[event] as Array<{ matcher?: string; hooks?: Array<{ type: string; command: string; timeout?: number }> }>;

    let found = false;
    for (const group of groups) {
      for (const h of group.hooks ?? []) {
        if (typeof h.command === 'string' && h.command.includes(HOOK_SCRIPT_NAME)) {
          if (h.command !== command) {
            h.command = command;
            changed = true;
          }
          found = true;
          break;
        }
      }
      if (found) break;
    }

    if (!found) {
      groups.push({ matcher: '', hooks: [{ type: 'command', command, timeout: 5 }] });
      changed = true;
    }
  }

  if (changed) {
    const dir = path.dirname(SETTINGS_PATH);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  }

  return changed;
}

export function unregisterHooks(): boolean {
  let settings: Record<string, unknown> = {};
  try {
    settings = JSON.parse(fs.readFileSync(SETTINGS_PATH, 'utf-8'));
  } catch {
    return false;
  }

  if (!settings.hooks || typeof settings.hooks !== 'object') return false;
  const hooks = settings.hooks as Record<string, unknown[]>;

  let changed = false;
  for (const [event] of HOOK_EVENTS) {
    if (!hooks[event]) continue;
    const groups = hooks[event] as Array<{ hooks?: Array<{ command: string }> }>;
    const filtered = groups
      .map(group => ({
        ...group,
        hooks: (group.hooks ?? []).filter(h => !h.command.includes(HOOK_SCRIPT_NAME)),
      }))
      .filter(group => (group.hooks?.length ?? 0) > 0);

    if (filtered.length !== groups.length) {
      hooks[event] = filtered;
      changed = true;
    }
    if (hooks[event].length === 0) delete hooks[event];
  }

  if (changed) {
    fs.writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), 'utf-8');
  }
  return changed;
}
