import React from "react";
import { Skeleton } from "../ui/Skeleton";

export const MostWantedCardSkeleton: React.FC = () => {
  return (
    <div className="suspect-card" aria-hidden="true">
      <div className="suspect-card__photo">
        <Skeleton width="100%" height="100%" rounded={false} />
      </div>
      <div className="suspect-card__body">
        <Skeleton width="25%" height="0.9rem" rounded={false} />
        <div style={{ marginTop: "0.45rem" }}>
          <Skeleton width="70%" height="1.2rem" rounded={false} />
        </div>
        <div style={{ marginTop: "0.65rem", display: "grid", gap: "0.45rem" }}>
          <Skeleton width="90%" height="0.9rem" rounded={false} />
          <Skeleton width="80%" height="0.9rem" rounded={false} />
        </div>
        <div style={{ marginTop: "0.75rem", display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          <Skeleton width="110px" height="1.4rem" />
          <Skeleton width="110px" height="1.4rem" />
          <Skeleton width="110px" height="1.4rem" />
        </div>
        <div style={{ marginTop: "0.9rem", display: "flex", justifyContent: "space-between" }}>
          <Skeleton width="80px" height="0.8rem" rounded={false} />
          <Skeleton width="120px" height="1.1rem" rounded={false} />
        </div>
      </div>
    </div>
  );
};