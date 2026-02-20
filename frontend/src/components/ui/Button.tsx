import React from "react";

type Variant = "primary" | "secondary" | "ghost";

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
}

export const Button: React.FC<ButtonProps> = ({ variant = "primary", className = "", children, ...rest }) => {
  return (
    <button className={`ui-button ui-button--${variant} ${className}`.trim()} {...rest}>
      {children}
    </button>
  );
};

