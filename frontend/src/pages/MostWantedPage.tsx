import React from "react";
import { useAuthContext } from "../auth/AuthContext";
import { fetchMostWanted, MostWantedItem } from "../api/public";
import { Alert } from "../components/ui/Alert";
import { BackToDashboardButton } from "../components/ui/BackToDashboardButton";
import { Button } from "../components/ui/Button";
import { MostWantedCard } from "../components/public/MostWantedCard";
import { MostWantedCardSkeleton } from "../components/public/MostWantedCardSkeleton";
import { useAsyncData } from "../hooks/useAsyncData";

export const MostWantedPage: React.FC = () => {
  const { user } = useAuthContext();
  const {
    data: items,
    isLoading,
    error,
    refetch
  } = useAsyncData<MostWantedItem[]>(() => fetchMostWanted(10), []);

  return (
    <div>
      <div className="workflow-header">
        <h1 style={{ marginTop: 0, marginBottom: 0 }}>Most Wanted</h1>
        {user && <BackToDashboardButton />}
      </div>
      <p style={{ color: "var(--text-muted)", marginTop: "0.35rem", lineHeight: 1.6 }}>
        A public list of high‑priority suspects. Rankings and reward amounts are computed by the backend.
      </p>

      {error && (
        <div style={{ marginTop: "1rem" }}>
          <Alert
            variant="error"
            title="We couldn’t load the Most Wanted list"
            actions={
              <Button variant="secondary" type="button" onClick={refetch}>
                Retry
              </Button>
            }
          >
            Please try again. If the issue continues, the API may be unavailable.
          </Alert>
        </div>
      )}

      {isLoading && (
        <div className="most-wanted-grid">
          {Array.from({ length: 10 }).map((_, idx) => (
            <MostWantedCardSkeleton key={`mw-skel-${idx}`} />
          ))}
        </div>
      )}

      {!isLoading && items && items.length === 0 && (
        <div style={{ marginTop: "1rem" }}>
          <Alert variant="info" title="No suspects found">
            The backend returned an empty list. Check back later.
          </Alert>
        </div>
      )}

      {!isLoading && items && items.length > 0 && (
        <div className="most-wanted-grid">
          {items.map((item, idx) => (
            <MostWantedCard key={item.suspect_id} item={item} rank={idx + 1} />
          ))}
        </div>
      )}
    </div>
  );
};
