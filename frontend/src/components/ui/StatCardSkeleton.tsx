import React from "react";
import { Skeleton } from "./Skeleton";

export const StatCardSkeleton: React.FC = () => {
  return (
    <div className="stat-card">
      <Skeleton height="0.9rem" width="45%" rounded={false} />
      <div style={{ marginTop: "0.6rem" }}>
        <Skeleton height="1.9rem" width="60%" rounded={false} />
      </div>
      <div style={{ marginTop: "0.85rem" }}>
        <Skeleton height="0.9rem" width="80%" rounded={false} />
      </div>
    </div>
  );
};