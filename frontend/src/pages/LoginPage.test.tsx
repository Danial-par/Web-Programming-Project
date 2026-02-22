import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { LoginPage } from "./LoginPage";
import { ToastProvider } from "../utils/toast";

const mockLogin = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({
    login: mockLogin,
    user: null,
    isBootstrapping: false,
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

function renderLoginPage() {
  return render(
    <MemoryRouter>
      <ToastProvider>
        <LoginPage />
      </ToastProvider>
    </MemoryRouter>
  );
}

describe("LoginPage", () => {
  beforeEach(() => {
    mockLogin.mockReset();
  });

  it("shows validation errors when identifier is empty", async () => {
    renderLoginPage();
    const identifierInput = screen.getByPlaceholderText(/username.*email.*phone/i);
    const passwordInput = screen.getByPlaceholderText(/enter password/i);
    fireEvent.change(identifierInput, { target: { value: "" } });
    fireEvent.change(passwordInput, { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    expect(await screen.findByText(/identifier is required/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("shows validation error when password is too short", async () => {
    renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText(/username.*email.*phone/i), { target: { value: "user1" } });
    fireEvent.change(screen.getByPlaceholderText(/enter password/i), { target: { value: "12345" } });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    expect(screen.getByText(/password should be at least 6 characters/i)).toBeInTheDocument();
    expect(mockLogin).not.toHaveBeenCalled();
  });

  it("submits when identifier and password are valid", async () => {
    mockLogin.mockResolvedValue(undefined);
    renderLoginPage();
    fireEvent.change(screen.getByPlaceholderText(/username.*email.*phone/i), { target: { value: "user1" } });
    fireEvent.change(screen.getByPlaceholderText(/enter password/i), { target: { value: "password1" } });
    fireEvent.click(screen.getByRole("button", { name: /login/i }));
    expect(mockLogin).toHaveBeenCalledWith("user1", "password1");
  });
});
