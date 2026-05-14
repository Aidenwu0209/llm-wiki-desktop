import type { Dispatch, SetStateAction } from "react";
import { Check, Settings, ShieldCheck, SquareStack, TerminalSquare } from "lucide-react";
import type { DesktopSettings } from "../../types";

type RuntimeSettingsPanelProps = {
  settings: DesktopSettings;
  setSettings: Dispatch<SetStateAction<DesktopSettings>>;
  vaultPath: string;
  busy: string | null;
  onChooseRuntime: () => void;
  onSaveSettings: () => void;
};

function visiblePath(path: string) {
  return path.replace(/ +(?=\/|$)/g, (match) => "[space]".repeat(match.length));
}

export function RuntimeSettingsPanel({
  settings,
  setSettings,
  vaultPath,
  busy,
  onChooseRuntime,
  onSaveSettings,
}: RuntimeSettingsPanelProps) {
  const cloudParserSelected = settings.defaultPdfParser === "layout-api";
  const cloudParserBlocked = cloudParserSelected && !settings.cloudParsingAllowed;

  return (
    <section className="panel settings-panel">
      <div className="section-head compact">
        <h2>Runtime settings</h2>
        <Settings size={18} />
      </div>

      <div className="settings-block">
        <div className="settings-block-title">
          <TerminalSquare size={15} />
          <span>Runtime</span>
        </div>
        <label className="field-label">
          Runtime path
          <div className="path-field" title={settings.runtimePath || "Prefer vault-local .open-llm-wiki/scripts"}>
            {settings.runtimePath ? visiblePath(settings.runtimePath) : "Prefer vault-local runtime"}
          </div>
        </label>
        <button className="wide" onClick={onChooseRuntime}>
          <Settings size={16} />
          Choose runtime path
        </button>
        <div className="settings-grid">
          <label>
            Python
            <input
              value={settings.pythonPath}
              onChange={(event) => setSettings((current) => ({ ...current, pythonPath: event.target.value }))}
              placeholder="python3"
            />
          </label>
          <label>
            uv
            <input
              value={settings.uvPath}
              onChange={(event) => setSettings((current) => ({ ...current, uvPath: event.target.value }))}
              placeholder="uv"
            />
          </label>
        </div>
      </div>

      <div className="settings-block">
        <div className="settings-block-title">
          <ShieldCheck size={15} />
          <span>Parsing</span>
        </div>
        <label className="field-label">
          Default PDF parser
          <select
            value={settings.defaultPdfParser}
            onChange={(event) => setSettings((current) => ({ ...current, defaultPdfParser: event.target.value }))}
          >
            <option value="auto">auto / local-first</option>
            <option value="local-text">local-text</option>
            <option value="layout-api">layout-api</option>
          </select>
        </label>
        <label className="field-label">
          Layout parser API
          <input
            value={settings.layoutParsingApiUrl}
            onChange={(event) => setSettings((current) => ({ ...current, layoutParsingApiUrl: event.target.value }))}
            placeholder="https://parser.example/api"
          />
        </label>
        <div className={cloudParserBlocked ? "settings-notice danger" : "settings-notice"}>
          Token: {settings.layoutParsingTokenPresent ? "configured" : "not detected"} · Cloud parser:
          {settings.cloudParsingAllowed ? " allowed" : " blocked"}
        </div>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.cloudParsingAllowed}
            onChange={(event) => setSettings((current) => ({ ...current, cloudParsingAllowed: event.target.checked }))}
          />
          <span>Allow cloud parser for layout-api</span>
        </label>
      </div>

      <div className="settings-block">
        <div className="settings-block-title">
          <SquareStack size={15} />
          <span>Obsidian and recovery</span>
        </div>
        <label className="field-label">
          Obsidian profile
          <select
            value={settings.defaultObsidianProfile}
            onChange={(event) => setSettings((current) => ({ ...current, defaultObsidianProfile: event.target.value }))}
          >
            <option value="minimal">minimal</option>
            <option value="research">research</option>
            <option value="full">full</option>
          </select>
        </label>
        <label className="field-label">
          Import behavior
          <select
            value={settings.defaultIngestMode}
            onChange={(event) => setSettings((current) => ({ ...current, defaultIngestMode: event.target.value }))}
          >
            <option value="inbox_only">Inbox only</option>
            <option value="enqueue_after_import">Queue after import</option>
          </select>
        </label>
        <div className="settings-grid">
          <label>
            Retry
            <input
              type="number"
              min={1}
              value={settings.retryCount}
              onChange={(event) => setSettings((current) => ({ ...current, retryCount: Number(event.target.value) || 1 }))}
            />
          </label>
          <label>
            Timeout seconds
            <input
              type="number"
              min={60}
              value={settings.timeoutSeconds}
              onChange={(event) => setSettings((current) => ({ ...current, timeoutSeconds: Number(event.target.value) || 60 }))}
            />
          </label>
        </div>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.skipObsidianPluginDownloads}
            onChange={(event) => setSettings((current) => ({ ...current, skipObsidianPluginDownloads: event.target.checked }))}
          />
          <span>Skip Obsidian plugin downloads during setup</span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.autoRunLintAfterWrites}
            onChange={(event) => setSettings((current) => ({ ...current, autoRunLintAfterWrites: event.target.checked }))}
          />
          <span>Run lint after approved writeback apply</span>
        </label>
        <label className="switch-row">
          <input
            type="checkbox"
            checked={settings.autoOpenReportsAfterFailures}
            onChange={(event) => setSettings((current) => ({ ...current, autoOpenReportsAfterFailures: event.target.checked }))}
          />
          <span>Open reports after runtime failures</span>
        </label>
      </div>

      <button className="wide" onClick={onSaveSettings} disabled={!vaultPath || busy === "save_settings"}>
        <Check size={16} />
        Save settings
      </button>
    </section>
  );
}
