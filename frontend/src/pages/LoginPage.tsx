import React, { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/TextInput";
import { useAuthContext } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { useToast } from "../utils/toast";

interface FieldErrors {
  identifier?: string;
  password?: string;
}

export const LoginPage: React.FC = () => {
  const { login } = useAuthContext();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: { pathname?: string } } };

  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const newErrors: FieldErrors = {};
    if (!identifier.trim()) {
      newErrors.identifier = "Identifier is required.";
    }
    if (!password) {
      newErrors.password = "Password is required.";
    } else if (password.length < 6) {
      newErrors.password = "Password should be at least 6 characters.";
    }

    if (Object.keys(newErrors).length > 0) {
      setFieldErrors(newErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await login(identifier.trim(), password);
      showSuccess("Login successful!");
      const from = location.state?.from?.pathname || "/dashboard";
      navigate(from, { replace: true });
    } catch (err) {
      const message = err instanceof ApiError ? err.message : "Login failed. Please try again.";
      showError(message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h1>Login</h1>
      <p>Sign in using your username, email, phone, or national ID and password.</p>
      <form onSubmit={handleSubmit} style={{ marginTop: "1rem", display: "grid", gap: "0.75rem", maxWidth: 420 }}>
        <TextInput
          name="identifier"
          label="Identifier"
          placeholder="Username / Email / Phone / National ID"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          error={fieldErrors.identifier}
        />
        <TextInput
          name="password"
          label="Password"
          type="password"
          placeholder="Enter password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={fieldErrors.password}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Signing in..." : "Login"}
        </Button>
      </form>
    </div>
  );
};

