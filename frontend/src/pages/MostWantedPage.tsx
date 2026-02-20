import React, { useEffect, useState } from "react";
import { DataTable } from "../components/ui/DataTable";
import { TableSkeleton } from "../components/ui/TableSkeleton";
import { apiRequest } from "../api/client";
import { endpoints } from "../api/endpoints";
import { useToast } from "../utils/toast";

interface MostWantedRow {
  suspect_id: number;
  first_name: string;
  last_name: string;
  national_id: string;
  phone: string;
  ranking: number;
  reward_amount: number;
}

export const MostWantedPage: React.FC = () => {
  const [rows, setRows] = useState<MostWantedRow[] | null>(null);
  const { showError } = useToast();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await apiRequest<MostWantedRow[]>(endpoints.mostWanted);
        if (!cancelled) {
          setRows(data);
        }
      } catch (err) {
        console.error(err);
        if (!cancelled) {
          showError("Failed to load most wanted list.");
          setRows([]);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showError]);

  return (
    <div>
      <h1>Most Wanted</h1>
      <p>Public view of high-priority suspects. Data will be enriched in later steps.</p>

      {rows === null && <TableSkeleton rows={5} columns={6} />}

      {rows && rows.length > 0 && (
        <div style={{ marginTop: "1rem" }}>
          <DataTable<MostWantedRow>
            data={rows}
            columns={[
              { key: "first_name", header: "First Name" },
              { key: "last_name", header: "Last Name" },
              { key: "national_id", header: "National ID" },
              { key: "phone", header: "Phone" },
              { key: "ranking", header: "Ranking" },
              { key: "reward_amount", header: "Reward (Rial)" }
            ]}
          />
        </div>
      )}

      {rows && rows.length === 0 && (
        <div style={{ marginTop: "1rem" }}>No most wanted suspects at this time.</div>
      )}
    </div>
  );
};

