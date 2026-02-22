import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { MostWantedPage } from "./MostWantedPage";

const mockFetchMostWanted = vi.fn();

vi.mock("../api/public", () => ({
  fetchMostWanted: (...args: unknown[]) => mockFetchMostWanted(...args),
}));

vi.mock("../auth/AuthContext", () => ({
  useAuthContext: () => ({ user: null }),
}));

describe("MostWantedPage", () => {
  beforeEach(() => {
    mockFetchMostWanted.mockReset();
  });

  it("renders list after mocked fetch", async () => {
    mockFetchMostWanted.mockResolvedValue([
      {
        suspect_id: 1,
        first_name: "John",
        last_name: "Doe",
        national_id: "123",
        phone: "555-0000",
        photo: null,
        max_days_wanted: 5,
        max_crime_degree: 2,
        ranking: 10,
        reward_amount: 200_000_000,
      },
    ]);
    render(
      <MemoryRouter>
        <MostWantedPage />
      </MemoryRouter>
    );
    expect(mockFetchMostWanted).toHaveBeenCalledWith(10);
    expect(await screen.findByText("John Doe")).toBeInTheDocument();
  });
});
