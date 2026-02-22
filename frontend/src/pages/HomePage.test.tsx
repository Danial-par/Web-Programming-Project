import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HomePage } from "./HomePage";

const mockFetchStats = vi.fn();

vi.mock("../api/public", () => ({
  fetchStatsOverview: () => mockFetchStats(),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ user: null }),
}));

function renderHomePage() {
  return render(
    <MemoryRouter>
      <HomePage />
    </MemoryRouter>
  );
}

describe("HomePage", () => {
  beforeEach(() => {
    mockFetchStats.mockReset();
  });

  it("renders stats after mocked fetch", async () => {
    mockFetchStats.mockResolvedValue({
      solved_cases_count: 42,
      active_cases_count: 10,
      employees_count: 25,
    });
    renderHomePage();
    expect(mockFetchStats).toHaveBeenCalled();
    expect(await screen.findByText("42")).toBeInTheDocument();
    expect(screen.getByText("10")).toBeInTheDocument();
    expect(screen.getByText("25")).toBeInTheDocument();
  });
});
