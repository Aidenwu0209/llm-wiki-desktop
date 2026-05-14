import { RotateCcw, TerminalSquare, XCircle } from "lucide-react";
import type { RuntimeJobEvent } from "../../types";

type ActivityMiniPanelProps = {
  activeJob: RuntimeJobEvent | null;
  history: RuntimeJobEvent[];
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

  return (
    <section className="panel activity-mini-panel">
      <div className="section-head">
        <h2>Activity</h2>
        <button type="button" onClick={onOpenActivity}>
          <TerminalSquare size={14} />open
        </button>
      </div>
      {!latest && <p className="empty">No runtime activity yet.</p>}
      {latest && (
        <div className="mini-job">
          <span className={classNames("status-chip", statusTone(latest.status))}>{latest.status}</span>
          <strong>{latest.kind}</strong>
          <em>{latest.stage || "runtime"} · {getDurationSeconds(latest)}s · attempt {latest.attempt}/{latest.maxAttempts}</em>
          <code>{latest.message || getLogPath(latest) || latest.jobId}</code>
          <div className="inline-actions">
            <button onClick={() => getLogPath(latest) && onOpenLog(getLogPath(latest))} disabled={!getLogPath(latest)} type="button">
              <TerminalSquare size={13} />log
            </button>
            <button onClick={() => onRetry(latest)} disabled={runtimeRunning || !isRetryable(latest.status)} type="button">
              <RotateCcw size={13} />retry
            </button>
            <button onClick={onCancel} disabled={!activeJob || isTerminal(activeJob.status)} type="button">
              <XCircle size={13} />cancel
            </button>
          </div>
        </div>
      )}
      {history.length > 1 && (
        <div className="mini-history">
          {history.slice(0, 3).map((job) => (
            <button key={job.jobId} onClick={() => onOpenActivity()} type="button">
              <span className={classNames("mini-dot", statusTone(job.status))} />
              <strong>{job.kind}</strong>
              <em>{job.status}</em>
            </button>
          ))}
        </div>
      )}
    </section>
  );
}
