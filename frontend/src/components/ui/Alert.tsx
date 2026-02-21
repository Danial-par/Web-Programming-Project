import React from "react";

type AlertVariant = "info" | "error" | "success" | "warning";

export interface AlertProps {
  variant?: AlertVariant;
  title?: string;
  children: React.ReactNode;
  actions?: React.ReactNode;
}

export const Alert: React.FC<AlertProps> = ({
  variant = "info",
  title,
  children,
  actions
}) => {
  return (
    <div className={`ui-alert ui-alert--${variant}`.trim()} role={variant === "error" ? "alert" : "status"}>
      <div className="ui-alert__content">
        {title && <div className="ui-alert__title">{title}</div>}
        <div className="ui-alert__message">{children}</div>
      </div>
      {actions && <div className="ui-alert__actions">{actions}</div>}
    </div>
  );
};