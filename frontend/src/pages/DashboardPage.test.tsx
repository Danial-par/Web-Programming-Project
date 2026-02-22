import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { DashboardPage } from "./DashboardPage";

const mockUseAuthContext = vi.fn();

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => mockUseAuthContext(),
}));

function renderDashboard() {
  return render(
    <MemoryRouter>
      <DashboardPage />
    </MemoryRouter>
  );
}

describe("DashboardPage", () => {
  beforeEach(() => {
    mockUseAuthContext.mockReset();
  });

  it("shows Admin Panel module when user has Admin role", async () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: 1, username: "admin", roles: ["Admin"], first_name: "A", last_name: "B", email: "a@b.com" },
      isBootstrapping: false,
    });
    renderDashboard();
    expect(await screen.findByText("Admin Panel")).toBeInTheDocument();
  });

  it("hides Admin Panel when user has only Cadet role", async () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: 2, username: "cadet", roles: ["Cadet"], first_name: "C", last_name: "D", email: "c@d.com" },
      isBootstrapping: false,
    });
    renderDashboard();
    expect(await screen.findByText("Dashboard")).toBeInTheDocument();
    expect(screen.queryByText("Admin Panel")).not.toBeInTheDocument();
  });

  it("shows Reports module when user has Captain role", async () => {
    mockUseAuthContext.mockReturnValue({
      user: { id: 3, username: "cap", roles: ["Captain"], first_name: "Cap", last_name: "Tain", email: "cap@ex.com" },
      isBootstrapping: false,
    });
    renderDashboard();
    expect(await screen.findByText("Reports")).toBeInTheDocument();
  });
});
