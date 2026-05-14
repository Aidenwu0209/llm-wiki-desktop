import { Archive, Database, FolderOpen, History, Plus } from "lucide-react";
import type { DesktopAppState, VaultSuggestion } from "../../types";

type WelcomePanelProps = {
  appState: DesktopAppState | null;
  suggestions: VaultSuggestion[];
  newVaultPath: string;
  busy: string | null;
  onChooseVault: () => void;
  onSelectVault: (path: string) => void;
  onCreateVault: () => void;
  setNewVaultPath: (path: string) => void;
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

function lastPathSegment(path: string) {
  return visiblePath(path).split("/").filter(Boolean).pop() || visiblePath(path);
}

export function WelcomePanel({
  appState,
  suggestions,
  newVaultPath,
  busy,
  onChooseVault,
  onSelectVault,
  onCreateVault,
  setNewVaultPath,
}: WelcomePanelProps) {
  const recentVaults = Array.from(new Set(appState?.recentVaults ?? []));
  const suggestionByPath = new Map(suggestions.map((item) => [item.path, item]));
  const deepseekVaults = suggestions.filter((item) => item.kind === "deepseek");
  const lastVault = appState?.lastSelectedVault || recentVaults[0] || "";

  return (
    <section className="welcome-panel">
      <div className="welcome-header">
        <div>
          <span className="eyebrow">LLM Wiki Desktop</span>
          <h2>Start with a vault</h2>
          <p>
            Restore a recent vault, open a generated vault, create a clean local vault, or inspect the DeepSeek demo corpus.
          </p>
        </div>
        <div className="welcome-restore">
          <span>Auto restore</span>
          <strong>{lastVault ? lastPathSegment(lastVault) : "No saved vault"}</strong>
          <em>{lastVault ? visiblePath(lastVault) : "Open or create one below"}</em>
          <button onClick={() => lastVault && onSelectVault(lastVault)} disabled={!lastVault}>
            <History size={16} />
            Restore
          </button>
        </div>
      </div>

      <div className="welcome-actions">
        <button className="welcome-action-card" onClick={onChooseVault}>
          <FolderOpen size={20} />
          <span>Open vault</span>
          <em>Select an existing generated LLM Wiki vault.</em>
        </button>
        <button className="welcome-action-card" onClick={onCreateVault} disabled={busy === "create" || !newVaultPath.trim()}>
          <Plus size={20} />
          <span>Create vault</span>
          <em>Uses the absolute path entered below.</em>
        </button>
        <button
          className="welcome-action-card"
          onClick={() => deepseekVaults[0] && onSelectVault(deepseekVaults[0].path)}
          disabled={!deepseekVaults[0]?.exists}
        >
          <Database size={20} />
          <span>Open DeepSeek demo</span>
          <em>{deepseekVaults[0] ? lastPathSegment(deepseekVaults[0].path) : "No generated demo vault found"}</em>
        </button>
      </div>

      <div className="create-inline mature">
        <input
          value={newVaultPath}
          onChange={(event) => setNewVaultPath(event.target.value)}
          placeholder="/absolute/path/to/new-vault"
        />
        <button onClick={onCreateVault} disabled={busy === "create" || !newVaultPath.trim()}>
          <Archive size={16} />
          Create
        </button>
      </div>

      <div className="welcome-grid">
        <section className="welcome-list">
          <div className="section-head compact">
            <h3>Recent vaults</h3>
            <span>{recentVaults.length}</span>
          </div>
          {recentVaults.length === 0 && <p className="empty">No recent vaults recorded.</p>}
          {recentVaults.map((path) => {
            const suggestion = suggestionByPath.get(path);
            const exists = suggestion?.exists ?? true;
            return (
              <button key={path} onClick={() => onSelectVault(path)} disabled={!exists}>
                <span className={classNames("inline-state", exists ? "ok" : "danger")}>{exists ? "ready" : "missing"}</span>
                <strong>{lastPathSegment(path)}</strong>
                <code>{visiblePath(path)}</code>
              </button>
            );
          })}
        </section>

        <section className="welcome-list">
          <div className="section-head compact">
            <h3>Detected vaults</h3>
            <span>{suggestions.length}</span>
          </div>
          {suggestions.length === 0 && <p className="empty">No generated vault suggestions found yet.</p>}
          {suggestions.map((item) => (
            <button key={`${item.kind}-${item.path}`} onClick={() => onSelectVault(item.path)} disabled={!item.exists}>
              <span className={classNames("inline-state", item.exists ? "ok" : "danger")}>{item.kind}</span>
              <strong>{item.label}</strong>
              <code>{visiblePath(item.path)}</code>
            </button>
          ))}
        </section>
      </div>
    </section>
  );
}
