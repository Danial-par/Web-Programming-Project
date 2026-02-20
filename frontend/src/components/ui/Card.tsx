import React from "react";

export interface CardProps {
  title?: string;
  children: React.ReactNode;
}

export const Card: React.FC<CardProps> = ({ title, children }) => {
  return (
    <div className="ui-card">
      {title && <div className="ui-card__header">{title}</div>}
      <div className="ui-card__body">{children}</div>
    </div>
  );
};

