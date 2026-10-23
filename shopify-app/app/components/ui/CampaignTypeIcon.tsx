type CampaignTypeIconProps = {
  campaignType: string;
  className?: string;
  size?: number;
  /** Always render an icon (gift fallback) even for unknown types. */
  force?: boolean;
};

export function CampaignTypeIcon({
  campaignType,
  className,
  size = 16,
  force = false,
}: CampaignTypeIconProps) {
  const isTiered = campaignType === "Tiered Free Gifts";
  const isSpendGift = campaignType === "Spend X -> Free Gift";
  if (!isTiered && !isSpendGift && !force) return null;

  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      aria-hidden
    >
      {isTiered ? (
        <>
          <path d="M5 17h14" />
          <path d="M8 13h8" />
          <path d="M11 9h2" />
        </>
      ) : (
        <>
          <path d="M12 5v3" />
          <path d="M8 8h8l1.2 3H6.8L8 8z" />
          <path d="M7 11v7a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1v-7" />
        </>
      )}
    </svg>
  );
}
