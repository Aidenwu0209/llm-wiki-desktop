import type { ReactNode } from "react";

export type PageStatusItem = {
  label: string;
  value: string | number;
  tone?: "neutral" | "success" | "warning" | "danger";
};

export type PagePrimaryAction = {
  label: string;
  icon?: ReactNode;
  onClick: () => void;
  disabled?: boolean;
  tone?: "primary" | "neutral";
};

type PageStatusHeaderProps = {
  title: string;
  subtitle: string;
  statusItems: PageStatusItem[];
  primaryActions: PagePrimaryAction[];
};

function classNames(...items: Array<string | false | null | undefined>) {
  return items.filter(Boolean).join(" ");
}

export function PageStatusHeader({
  title,
  subtitle,
  statusItems,
  primaryActions,
}: PageStatusHeaderProps) {
  return (
    <section className="page-status-panel">
      <div className="page-status-copy">
        <h3>{title}</h3>
        <p>{subtitle}</p>
      </div>
      <div className="page-status-items">
        {statusItems.map((item) => (
          <div className={classNames("page-status-item", item.tone)} key={item.label}>
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
      <div className="page-primary-actions">
        {primaryActions.map((action) => (
          <button
            className={classNames("page-action-button", action.tone === "primary" && "primary")}
            disabled={action.disabled}
            key={action.label}
            onClick={action.onClick}
            type="button"
          >
            {action.icon}
            {action.label}
          </button>
        ))}
      </div>
    </section>
  );
}
