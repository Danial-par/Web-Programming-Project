import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "../components/ui/Button";
import { TextInput } from "../components/ui/TextInput";
import { useAuthContext, RegisterPayload } from "../auth/AuthContext";
import { ApiError } from "../api/client";
import { useToast } from "../utils/toast";

interface FieldErrors {
  username?: string;
  email?: string;
  phone?: string;
  national_id?: string;
  password?: string;
  first_name?: string;
  last_name?: string;
}

export const RegisterPage: React.FC = () => {
  const { register } = useAuthContext();
  const { showError, showSuccess } = useToast();
  const navigate = useNavigate();

  const [form, setForm] = useState<RegisterPayload>({
    username: "",
    email: "",
    phone: "",
    national_id: "",
    first_name: "",
    last_name: "",
    password: ""
  });
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleChange =
    (field: keyof RegisterPayload) =>
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setForm((prev) => ({ ...prev, [field]: e.target.value }));
    };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldErrors({});

    const errors: FieldErrors = {};
    if (!form.username.trim()) errors.username = "Username is required.";
    if (!form.email.trim()) errors.email = "Email is required.";
    if (form.email && !/\S+@\S+\.\S+/.test(form.email)) errors.email = "Email is invalid.";
    if (!form.phone.trim()) errors.phone = "Phone is required.";
    if (!form.national_id.trim()) errors.national_id = "National ID is required.";
    if (!form.first_name.trim()) errors.first_name = "First name is required.";
    if (!form.last_name.trim()) errors.last_name = "Last name is required.";
    if (!form.password) {
      errors.password = "Password is required.";
    } else if (form.password.length < 6) {
      errors.password = "Password should be at least 6 characters.";
    }

    if (Object.keys(errors).length > 0) {
      setFieldErrors(errors);
      return;
    }

    setIsSubmitting(true);
    try {
      await register({
        ...form,
        username: form.username.trim(),
        email: form.email.trim(),
        phone: form.phone.trim(),
        national_id: form.national_id.trim(),
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim()
      });
      showSuccess("Registration successful! Welcome!");
      navigate("/dashboard", { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        const fields = (err.fields ?? {}) as Record<string, string[] | string>;
        const newFieldErrors: FieldErrors = { ...errors };
        Object.entries(fields).forEach(([key, value]) => {
          if (key in newFieldErrors) {
            (newFieldErrors as any)[key] = Array.isArray(value) ? value.join(" ") : String(value);
          }
        });
        if (Object.keys(newFieldErrors).length > 0) {
          setFieldErrors(newFieldErrors);
        }
        showError(err.message || "Registration failed. Please check the form.");
      } else {
        showError("Registration failed. Please try again.");
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div>
      <h1>Register</h1>
      <p>Create a new account. Your role(s) will be assigned by an administrator.</p>
      <form
        onSubmit={handleSubmit}
        style={{ marginTop: "1rem", display: "grid", gap: "0.75rem", maxWidth: 480 }}
      >
        <TextInput
          name="username"
          label="Username"
          placeholder="Enter username"
          value={form.username}
          onChange={handleChange("username")}
          error={fieldErrors.username}
        />
        <TextInput
          name="email"
          label="Email"
          type="email"
          placeholder="Enter email"
          value={form.email}
          onChange={handleChange("email")}
          error={fieldErrors.email}
        />
        <TextInput
          name="phone"
          label="Phone"
          placeholder="Enter phone"
          value={form.phone}
          onChange={handleChange("phone")}
          error={fieldErrors.phone}
        />
        <TextInput
          name="national_id"
          label="National ID"
          placeholder="Enter national ID"
          value={form.national_id}
          onChange={handleChange("national_id")}
          error={fieldErrors.national_id}
        />
        <TextInput
          name="first_name"
          label="First name"
          placeholder="Enter first name"
          value={form.first_name}
          onChange={handleChange("first_name")}
          error={fieldErrors.first_name}
        />
        <TextInput
          name="last_name"
          label="Last name"
          placeholder="Enter last name"
          value={form.last_name}
          onChange={handleChange("last_name")}
          error={fieldErrors.last_name}
        />
        <TextInput
          name="password"
          label="Password"
          type="password"
          placeholder="Enter password"
          value={form.password}
          onChange={handleChange("password")}
          error={fieldErrors.password}
        />
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Creating account..." : "Create account"}
        </Button>
      </form>
    </div>
  );
};

