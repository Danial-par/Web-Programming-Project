import React from "react";
import { MostWantedItem } from "../../api/public";
import { formatNumber, formatRial } from "../../utils/format";
import { resolveMediaUrl } from "../../utils/media";

function PlaceholderAvatar() {
  return (
    <svg width="42" height="42" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M12 12c2.76 0 5-2.46 5-5.5S14.76 1 12 1 7 3.46 7 6.5 9.24 12 12 12Zm0 2c-4.42 0-8 2.69-8 6v2h16v-2c0-3.31-3.58-6-8-6Z"
        fill="rgba(148,163,184,0.55)"
      />
    </svg>
  );
}

function maskNationalId(value: string): string {
  const v = (value || "").trim();
  if (!v) return "—";
  if (v.length <= 4) return v;
  return `${"•".repeat(Math.max(0, v.length - 4))}${v.slice(-4)}`;
}

export interface MostWantedCardProps {
  item: MostWantedItem;
  /** The rank position in the list (1..N). */
  rank: number;
}

export const MostWantedCard: React.FC<MostWantedCardProps> = ({ item, rank }) => {
  const fullName = `${item.first_name} ${item.last_name}`.trim() || "Unknown";
  const photoUrl = resolveMediaUrl(item.photo);

  return (
    <article className="suspect-card">
      <div className="suspect-card__photo" aria-label={photoUrl ? `${fullName} photo` : "No photo available"}>
        {photoUrl ? <img src={photoUrl} alt={fullName} loading="lazy" /> : <PlaceholderAvatar />}
      </div>

      <div className="suspect-card__body">
        <div className="suspect-card__rank">Rank #{rank}</div>
        <h3 className="suspect-card__name">{fullName}</h3>

        <div className="suspect-card__meta">
          <span>National ID: {maskNationalId(item.national_id)}</span>
          <span>Phone: {item.phone?.trim() ? item.phone : "—"}</span>
        </div>

        <div style={{ marginTop: "0.7rem", display: "flex", flexWrap: "wrap", gap: "0.45rem" }}>
          <span className="metric-pill">
            Days wanted <strong>{formatNumber(item.max_days_wanted)}</strong>
          </span>
          <span className="metric-pill">
            Max degree <strong>{formatNumber(item.max_crime_degree)}</strong>
          </span>
          <span className="metric-pill">
            Score <strong>{formatNumber(item.ranking)}</strong>
          </span>
        </div>

        <div className="suspect-card__reward">
          <span className="suspect-card__reward-label">Reward</span>
          <span className="suspect-card__reward-value">{formatRial(item.reward_amount)}</span>
        </div>
      </div>
    </article>
  );
};