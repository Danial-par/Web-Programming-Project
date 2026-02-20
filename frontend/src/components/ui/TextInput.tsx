import React from "react";

export interface TextInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const TextInput: React.FC<TextInputProps> = ({ label, error, id, className = "", ...rest }) => {
  const inputId = id ?? rest.name ?? undefined;
  return (
    <div className="ui-field">
      {label && (
        <label className="ui-field__label" htmlFor={inputId}>
          {label}
        </label>
      )}
      <input id={inputId} className={`ui-input ${className}`.trim()} {...rest} />
      {error && <div className="ui-field__error">{error}</div>}
    </div>
  );
};

