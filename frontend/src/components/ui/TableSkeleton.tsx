import React from "react";
import { Skeleton } from "./Skeleton";

interface TableSkeletonProps {
  rows?: number;
  columns?: number;
}

export const TableSkeleton: React.FC<TableSkeletonProps> = ({ rows = 5, columns = 4 }) => {
  return (
    <div className="ui-table-skeleton">
      <div className="ui-table-skeleton__header">
        {Array.from({ length: columns }).map((_, idx) => (
          <Skeleton key={`header-${idx}`} height="1.25rem" width="120px" rounded={false} />
        ))}
      </div>
      <div className="ui-table-skeleton__body">
        {Array.from({ length: rows }).map((_, rowIdx) => (
          <div key={`row-${rowIdx}`} className="ui-table-skeleton__row">
            {Array.from({ length: columns }).map((_, colIdx) => (
              <Skeleton key={`cell-${rowIdx}-${colIdx}`} height="1rem" width="100%" rounded={false} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
};
