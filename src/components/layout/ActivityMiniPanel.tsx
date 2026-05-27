import { RotateCcw, TerminalSquare, XCircle } from "lucide-react";
import { runtimeLabel, runtimeText, type UiLanguage } from "../../i18n";
import type { RuntimeJobEvent } from "../../types";

type ActivityMiniPanelProps = {
  activeJob: RuntimeJobEvent | null;
  history: RuntimeJobEvent[];
  language?: UiLanguage;
  runtimeRunning: boolean;
  getDurationSeconds: (job: RuntimeJobEvent) => number;
  getLogPath: (job: RuntimeJobEvent) => string;
  isRetryable: (status?: string | null) => boolean;
  isTerminal: (status?: string | null) => boolean;
  statusTone: (status: string) => string;
  onOpenLog: (path: string) => void;
  onRetry: (job: RuntimeJobEvent) => void;
  onCancel: () => void;
  onOpenActivity: () => void;
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function ActivityMiniPanel({
  activeJob,
  history,
  language = "en",
  runtimeRunning,
  getDurationSeconds,
  getLogPath,
  isRetryable,
  isTerminal,
  statusTone,
  onOpenLog,
  onRetry,
  onCancel,
  onOpenActivity,
}: ActivityMiniPanelProps) {
  const latest = activeJob || history[0] || null;
  const isZh = language === "zh";
  const text = isZh
    ? {
      title: "活动",
      open: "打开",
      empty: "暂无运行活动。",
      log: "日志",
      retry: "重试",
      cancel: "取消",
      attempt: "尝试",
    }
    : {
      title: "Activity",
      open: "open",
      empty: "No runtime activity yet.",
      log: "log",
      retry: "retry",
      cancel: "cancel",
      attempt: "attempt",
    };

  return (
    <section className="panel activity-mini-panel">
      <div className="section-head">
        <h2>{text.title}</h2>
        <button type="button" onClick={onOpenActivity}>
          <TerminalSquare size={14} />{text.open}
        </button>
      </div>
      {!latest && <p className="empty">{text.empty}</p>}
      {latest && (
        <div className="mini-job">
          <span className={classNames("status-chip", statusTone(latest.status))}>{runtimeLabel(latest.status, language)}</span>
          <strong>{runtimeLabel(latest.kind, language)}</strong>
          <em>{runtimeLabel(latest.stage || "runtime", language)} · {getDurationSeconds(latest)}s · {text.attempt} {latest.attempt}/{latest.maxAttempts}</em>
          <code>{runtimeText(latest.message, language) || getLogPath(latest) || latest.jobId}</code>
          <div className="inline-actions">
            <button onClick={() => getLogPath(latest) && onOpenLog(getLogPath(latest))} disabled={!getLogPath(latest)} type="button">
              <TerminalSquare size={13} />{text.log}
            </button>
            <button onClick={() => onRetry(latest)} disabled={runtimeRunning || !isRetryable(latest.status)} type="button">
              <RotateCcw size={13} />{text.retry}
            </button>
            <button onClick={onCancel} disabled={!activeJob || isTerminal(activeJob.status)} type="button">
              <XCircle size={13} />{text.cancel}
            </button>
          </div>
        </div>
      )}
      {history.length > 1 && (
        <div className="mini-history">
          {history.slice(0, 3).map((job) => (
            <button key={job.jobId} onClick={() => onOpenActivity()} type="button">
              <span className={classNames("mini-dot", statusTone(job.status))} />
              <strong>{runtimeLabel(job.kind, language)}</strong>
              <em>{runtimeLabel(job.status, language)}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
