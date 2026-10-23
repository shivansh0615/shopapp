import type { CSSProperties } from "react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import {
  PUBLICATION_FALLBACK_WARNING,
  type ProductSearchResult,
  type ProductSearchVariantSummary,
} from "../../lib/product-availability";
import { fetchProductSearch } from "../../lib/product-search-client";
import { giftVariants, groupGiftProducts, groupGiftVariants, mergeGiftVariants } from "../../lib/gift-picker-groups";
import { color } from "../../styles/tokens";

export type SelectedGiftProduct = {
  productId: string;
  title: string;
  imageUrl: string | null;
  variantId: string;
  variantTitle: string;
};

export type InitialSelectedProduct = {
  id: string;
  title: string;
  image: string | null;
  firstVariant: {
    id: string;
    title: string;
  };
};

function toSelectedGiftProduct(initial: InitialSelectedProduct): SelectedGiftProduct {
  return {
    productId: initial.id,
    title: initial.title,
    imageUrl: initial.image,
    variantId: initial.firstVariant.id,
    variantTitle: initial.firstVariant.title,
  };
}

type ProductPickerProps = {
  selectedProduct?: SelectedGiftProduct | null;
  initialSelectedProduct?: InitialSelectedProduct | null;
  onSelect: (product: SelectedGiftProduct) => void;
  onRemove: () => void;
  /** Smaller selected state for side-by-side tier cards. */
  compact?: boolean;
};

type SearchPhase = "idle" | "loading" | "results" | "empty" | "permission" | "error";

type PendingGift = {
  productId: string;
  title: string;
  imageUrl: string | null;
  variants: ProductSearchVariantSummary[];
  truncated: boolean;
  endCursor: string | null;
};

export function ProductPicker({
  selectedProduct,
  initialSelectedProduct,
  onSelect,
  onRemove,
  compact = false,
}: ProductPickerProps) {
  const resolvedProduct =
    selectedProduct !== undefined
      ? selectedProduct
      : initialSelectedProduct
        ? toSelectedGiftProduct(initialSelectedProduct)
        : null;
  const [searchQuery, setSearchQuery] = useState("");
  const [results, setResults] = useState<ProductSearchResult[]>([]);
  const [publicationWarning, setPublicationWarning] = useState(false);
  const [phase, setPhase] = useState<SearchPhase>("idle");
  const [searchMessage, setSearchMessage] = useState<string | null>(null);
  const [pageInfo, setPageInfo] = useState<{ hasNextPage: boolean; endCursor: string | null }>({
    hasNextPage: false,
    endCursor: null,
  });
  const [showDropdown, setShowDropdown] = useState(false);
  const [pendingGift, setPendingGift] = useState<PendingGift | null>(null);
  const [browseMode, setBrowseMode] = useState(false);
  const [variantLoading, setVariantLoading] = useState(false);
  const [replacing, setReplacing] = useState(false);
  const resultsId = useId();
  const containerRef = useRef<HTMLDivElement>(null);
  const activeRequestRef = useRef<AbortController | null>(null);
  const requestSeq = useRef(0);

  const runSearch = useCallback(async (query: string, after: string | null, seq: number, append: boolean) => {
    const abortController = new AbortController();
    activeRequestRef.current?.abort();
    activeRequestRef.current = abortController;
    try {
      const data = await fetchProductSearch({
        q: query,
        browse: query.length < 2,
        after,
        signal: abortController.signal,
      });
      if (seq !== requestSeq.current) return;
      setPublicationWarning(data.publicationWarning);
      setPageInfo(data.pageInfo);
      if (data.status !== "ok") {
        setResults([]);
        setPhase(data.status === "permission_required" ? "permission" : "error");
        setSearchMessage(data.message);
        setShowDropdown(false);
        return;
      }
      setResults((previous) => append ? [...new Map([...previous, ...data.products].map(product => [product.id, product])).values()] : data.products);
      setSearchMessage(null);
      setPhase(append || data.products.length > 0 ? "results" : "empty");
      setShowDropdown(true);
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return;
      if (seq !== requestSeq.current) return;
      setResults([]);
      setPhase("error");
      setSearchMessage("Could not load products. Try again.");
      setShowDropdown(false);
    }
  }, []);

  useEffect(() => {
    const trimmedQuery = searchQuery.trim();

    if (trimmedQuery.length < 2 && !browseMode) {
      requestSeq.current += 1;
      activeRequestRef.current?.abort();
      activeRequestRef.current = null;
      setResults([]);
      setPublicationWarning(false);
      setPhase("idle");
      setSearchMessage(null);
      setShowDropdown(false);
      setPageInfo({ hasNextPage: false, endCursor: null });
      return;
    }

    const seq = ++requestSeq.current;
    setPhase("loading");
    setShowDropdown(false);
    const timer = setTimeout(() => {
      void runSearch(trimmedQuery, null, seq, false);
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  }, [searchQuery, browseMode, runSearch]);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setShowDropdown(false);
      }
    }

    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  useEffect(() => () => {
    requestSeq.current += 1;
    activeRequestRef.current?.abort();
  }, []);

  function commitGift(gift: SelectedGiftProduct) {
    requestSeq.current += 1;
    activeRequestRef.current?.abort();
    setBrowseMode(false);
    onSelect(gift);
    setSearchQuery("");
    setResults([]);
    setPendingGift(null);
    setReplacing(false);
    setShowDropdown(false);
    setPhase("idle");
    setSearchMessage(null);
  }

  function handleSelectProduct(product: ProductSearchResult) {
    const variants = giftVariants(product);
    if (variants.length === 1 && variants[0].selectable === true && !product.variantsTruncated) {
      commitGift({ productId: product.id, title: product.title, imageUrl: product.featuredImage?.url ?? null,
        variantId: variants[0].id, variantTitle: variants[0].title });
      return;
    }
    setPendingGift({ productId: product.id, title: product.title, imageUrl: product.featuredImage?.url ?? null,
      variants, truncated: product.variantsTruncated === true, endCursor: product.variantPageInfo?.endCursor ?? null });
    setShowDropdown(false);
  }

  function browseProducts() {
    setReplacing(true);
    setPendingGift(null);
    setSearchMessage(null);
    setSearchQuery("");
    if (browseMode && searchQuery === "") {
      setPhase("loading");
      void runSearch("", null, ++requestSeq.current, false);
    } else {
      setBrowseMode(true);
    }
  }

  async function loadMoreVariants() {
    if (!pendingGift || variantLoading) return;
    const selected = pendingGift;
    const seq = requestSeq.current;
    setVariantLoading(true);
    setSearchMessage(null);
    try {
      const data = await fetchProductSearch({ productId: selected.productId, after: selected.endCursor });
      if (seq !== requestSeq.current) return;
      if (data.status !== "ok" || !data.products[0]) {
        setSearchMessage(data.message || "Could not load variants. Try again.");
        return;
      }
      const variants = giftVariants(data.products[0]);
      setPendingGift((current) => {
        if (!current || current.productId !== selected.productId) return current;
        const combined = mergeGiftVariants(current.variants, variants);
        return { ...current, variants: combined, truncated: data.pageInfo.hasNextPage, endCursor: data.pageInfo.endCursor };
      });
    } finally {
      setVariantLoading(false);
    }
  }

  function retrySearch() {
    const seq = ++requestSeq.current;
    setPhase("loading");
    setSearchMessage(null);
    void runSearch(searchQuery.trim(), null, seq, false);
  }

  function handleRemove() {
    requestSeq.current += 1;
    activeRequestRef.current?.abort();
    setBrowseMode(false);
    setSearchQuery("");
    setResults([]);
    setPendingGift(null);
    setPublicationWarning(false);
    setShowDropdown(false);
    setPhase("idle");
    setSearchMessage(null);
    setReplacing(false);
    onRemove();
  }

  const productGroups = groupGiftProducts(results);
  const variantGroups = groupGiftVariants(pendingGift?.variants ?? []);
  const variantChooser = pendingGift ? (
    <fieldset style={chooserStyle}>
      <legend style={chooserLegendStyle}>Choose a variant for {pendingGift.title}</legend>
      {(["available", "unavailable"] as const).map(group => {
        const variants = variantGroups[group];
        if (!variants.length) return null;
        return <div key={group}>
          <p style={groupHeadingStyle}>{group === "available" ? "Available to add" : "Unavailable"} ({variants.length})</p>
          <div style={variantListStyle}>
            {variants.map(variant => <button key={variant.id} type="button"
              disabled={variant.selectable !== true}
              style={{ ...chooserButtonStyle, cursor: variant.selectable === true ? "pointer" : "not-allowed" }}
              onClick={() => {
                if (variant.selectable !== true) return;
                commitGift({ productId: pendingGift.productId, title: pendingGift.title, imageUrl: pendingGift.imageUrl,
                  variantId: variant.id, variantTitle: variant.title });
              }}>
              <span style={resultTitleStyle}>{variant.title === "Default Title" ? "Default variant" : variant.title}</span>
              <span style={resultVariantStyle}>{variant.selectable === true ? "Available to add" : variant.unavailableReason || "Availability could not be verified. Try again."}</span>
            </button>)}
          </div>
        </div>;
      })}
      {!pendingGift.variants.length ? <p style={hintStyle}>No variants loaded for this product.</p> : null}
      {pendingGift.truncated ? <>
        <p style={hintStyle}>Only loaded variants are shown. Load more to check the remaining variants.</p>
        <button type="button" style={inlineButtonStyle} disabled={variantLoading} onClick={() => void loadMoreVariants()}>
          {variantLoading ? "Loading variants…" : "Load more variants"}
        </button>
      </> : null}
      <button type="button" style={inlineButtonStyle} onClick={() => { setPendingGift(null); setShowDropdown(true); }}>Back to products</button>
      {searchMessage ? <p style={warningStyle} role="alert">{searchMessage}</p> : null}
    </fieldset>
  ) : null;

  const searchStatus =
    phase === "loading" ? (
      <p style={hintStyle} role="status">Loading products…</p>
    ) : phase === "permission" ? (
      <p style={warningStyle} role="alert">
        {searchMessage || "Permission required to read products."}{" "}
        <button type="button" style={inlineButtonStyle} onClick={retrySearch}>Retry</button>
      </p>
    ) : phase === "error" ? (
      <p style={warningStyle} role="alert">
        {searchMessage || "Could not load products."}{" "}
        <button type="button" style={inlineButtonStyle} onClick={retrySearch}>
          Retry
        </button>
      </p>
    ) : phase === "empty" ? (
      <p style={hintStyle}>No matches. Try another title or SKU, or browse products.</p>
    ) : null;

  if (resolvedProduct && !pendingGift && !replacing) {
    if (compact) {
      return (
        <div style={compactSelectedStyle}>
          {resolvedProduct.imageUrl ? (
            <img src={resolvedProduct.imageUrl} alt="" style={compactImageStyle} />
          ) : (
            <div style={compactImagePlaceholderStyle} />
          )}
          <div style={{ minWidth: 80, flex: "1 1 80px" }}>
            <p style={compactTitleStyle}>{resolvedProduct.title}</p>
            {resolvedProduct.variantTitle && resolvedProduct.variantTitle !== "Default Title" ? (
              <p style={compactVariantStyle}>{resolvedProduct.variantTitle}</p>
            ) : null}
          </div>
          <span style={{ display: "flex", gap: 8, marginLeft: "auto" }}>
            <button type="button" onClick={() => void browseProducts()} style={compactRemoveStyle} aria-label="Change gift">
              ↻
            </button>
            <button type="button" onClick={handleRemove} style={compactRemoveStyle} aria-label="Remove gift">
              ×
            </button>
          </span>
        </div>
      );
    }

    return (
      <div style={selectedCardStyle}>
        <div style={selectedCardHeaderStyle}>
          <span style={selectedEmojiStyle}>🧴</span>
          <span style={selectedTitleStyle}>{resolvedProduct.title}</span>
        </div>

        {resolvedProduct.imageUrl ? (
          <img src={resolvedProduct.imageUrl} alt={resolvedProduct.title} style={selectedImageStyle} />
        ) : (
          <div style={selectedImagePlaceholderStyle} />
        )}

        {resolvedProduct.variantTitle && resolvedProduct.variantTitle !== "Default Title" && (
          <p style={variantLabelStyle}>{resolvedProduct.variantTitle}</p>
        )}

        <div style={selectedFooterStyle}>
          <span style={selectedBadgeStyle}>Selected ✓</span>
          <span style={{ display: "flex", gap: 8 }}>
            <button type="button" onClick={() => void browseProducts()} style={changeButtonStyle}>
              Change
            </button>
            <button type="button" onClick={handleRemove} style={removeButtonStyle}>
              Remove
            </button>
          </span>
        </div>
      </div>
    );
  }

  return (
    <div ref={containerRef} style={containerStyle}>
      <div style={searchRowStyle}>
        <input
          type="text"
          value={searchQuery}
          onKeyDown={event => { if (event.key === "Escape") setShowDropdown(false); }}
          onChange={(e) => {
            requestSeq.current += 1;
            activeRequestRef.current?.abort();
            setBrowseMode(false);
            setPendingGift(null);
            setSearchQuery(e.target.value);
          }}
          onFocus={() => {
            if (results.length > 0) setShowDropdown(true);
          }}
          placeholder={compact ? "Search title or SKU…" : "Search by title or SKU"}
          style={compact ? compactSearchInputStyle : searchInputStyle}
          className="fgpb-search"
          autoComplete="off"
          aria-label="Search gift products"
          aria-controls={resultsId}
        />
        <button type="button" onClick={() => void browseProducts()} style={browseButtonStyle} disabled={phase === "loading"}>
          {phase === "loading" ? "Loading…" : "Browse products"}
        </button>
      </div>

      {publicationWarning ? <p style={warningStyle}>{PUBLICATION_FALLBACK_WARNING}</p> : null}
      {replacing && resolvedProduct ? (
        <button
          type="button"
          style={inlineButtonStyle}
          onClick={() => {
            setReplacing(false);
            setPendingGift(null);
            setPhase("idle");
            setSearchMessage(null);
          }}
        >
          Keep current gift
        </button>
      ) : null}
      {searchStatus}
      {variantChooser}

      {showDropdown && results.length > 0 && (
        <div id={resultsId} style={dropdownStyle} role="region" aria-label="Gift product results">
          <p style={resultsHintStyle}>Active products only. Open a product to inspect available and unavailable variants.</p>
          {(["available", "unavailable", "unchecked"] as const).map(group => {
            const products = productGroups[group];
            const title = group === "available" ? "Available to add" : group === "unchecked" ? "More variants to check" : "Unavailable";
            if (group === "unchecked" && !products.length) return null;
            return <section key={group} aria-label={title}>
              <h3 style={groupHeadingStyle}>{title} ({products.length})</h3>
              {!products.length ? <p style={resultsHintStyle}>No {group === "available" ? "available" : "unavailable"} products in the loaded results.</p> : null}
              <ul style={groupListStyle}>{products.map(product => {
                const variants = groupGiftVariants(giftVariants(product));
                return <li key={product.id}>
                  <button type="button" onClick={() => handleSelectProduct(product)} style={dropdownItemStyle}>
                    {product.featuredImage?.url ? <img src={product.featuredImage.url} alt="" loading="lazy" style={resultImageStyle} /> : <div style={resultImagePlaceholderStyle} />}
                    <span style={resultTextStyle}>
                      <span style={resultTitleStyle}>{product.title}</span>
                      <span style={{ ...availabilityStyle, color: group === "available" ? "#087443" : "#92400e" }}>
                        {title}
                      </span>
                      {variants.available.length > 0 ? <span style={resultVariantStyle}>{variants.available.length} available {variants.available.length === 1 ? "variant" : "variants"}{variants.unavailable.length ? `, ${variants.unavailable.length} unavailable` : ""}</span> : <span style={resultVariantStyle}>{group === "unchecked" ? "The loaded variants are unavailable. Open to check the remaining variants." : product.unavailableReason || "Availability could not be verified."}</span>}
                      {product.variantsTruncated && group !== "unchecked" ? <span style={resultVariantStyle}>More variants to check</span> : null}
                      <span style={resultVariantStyle}>{group === "available" && variants.available.length === 1 && variants.unavailable.length === 0 && !product.variantsTruncated ? "Select variant" : "View variants"}</span>
                    </span>
                  </button>
                </li>;
              })}</ul>
            </section>;
          })}
          <p style={resultsHintStyle}>Counts cover loaded results{pageInfo.hasNextPage ? "; more products are available below" : ""}.</p>
        </div>
      )}

      {showDropdown && pageInfo.hasNextPage ? (
        <button
          type="button"
          style={inlineButtonStyle}
          onClick={() => {
            const seq = ++requestSeq.current;
            setPhase("loading");
            void runSearch(searchQuery.trim(), pageInfo.endCursor, seq, true);
          }}
          disabled={phase === "loading"}
        >
          Load more
        </button>
      ) : null}
    </div>
  );
}

const containerStyle: CSSProperties = { position: "relative", minWidth: 0, width: "100%" };

const searchRowStyle: CSSProperties = { display: "flex", flexWrap: "wrap", gap: 8, alignItems: "center", minWidth: 0 };

const searchInputStyle: CSSProperties = {
  width: "100%",
  minWidth: 0,
  flex: "1 1 180px",
  height: 48,
  borderRadius: 14,
  border: `1px solid ${color.border}`,
  padding: "0 18px",
  fontSize: 16,
  background: "#fff",
  color: color.text,
  boxSizing: "border-box",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  fontFamily: 'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
};

const compactSearchInputStyle: CSSProperties = {
  ...searchInputStyle,
  height: 44,
  borderRadius: 10,
  padding: "0 12px",
  fontSize: 16,
  boxShadow: "none",
};

const browseButtonStyle: CSSProperties = {
  flexShrink: 0,
  minHeight: 44,
  borderRadius: 10,
  border: `1px solid ${color.border}`,
  background: "#fff",
  color: color.text,
  fontSize: 13,
  fontWeight: 600,
  padding: "0 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const inlineButtonStyle: CSSProperties = {
  marginTop: 8,
  border: "none",
  background: "transparent",
  color: color.text,
  fontWeight: 700,
  cursor: "pointer",
  fontFamily: "inherit",
  padding: "8px 0",
  minHeight: 44,
};

const chooserStyle: CSSProperties = {
  margin: "10px 0 0",
  minWidth: 0,
  padding: 10,
  border: `1px solid ${color.border}`,
  borderRadius: 12,
  display: "grid",
  gap: 6,
};

const chooserLegendStyle: CSSProperties = { fontSize: 13, fontWeight: 700, padding: "0 4px", overflowWrap: "anywhere", maxWidth: "100%" };

const chooserButtonStyle: CSSProperties = {
  display: "grid",
  gap: 4,
  minHeight: 44,
  width: "100%",
  minWidth: 0,
  textAlign: "left",
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  background: "#fff",
  padding: "8px 10px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const compactSelectedStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  alignItems: "center",
  gap: 8,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  padding: 8,
  background: "#fff",
  minWidth: 0,
};

const compactImageStyle: CSSProperties = {
  width: 36,
  height: 36,
  borderRadius: 8,
  objectFit: "cover",
  flexShrink: 0,
  border: `1px solid ${color.border}`,
};

const compactImagePlaceholderStyle: CSSProperties = {
  ...compactImageStyle,
  background: "#FAFAFA",
};

const compactTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  fontWeight: 600,
  color: color.text,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const compactVariantStyle: CSSProperties = {
  margin: 0,
  fontSize: 12,
  color: "#595959",
  overflowWrap: "anywhere",
};

const compactRemoveStyle: CSSProperties = {
  flexShrink: 0,
  width: 44,
  height: 44,
  border: `1px solid ${color.border}`,
  borderRadius: 8,
  background: "#fff",
  color: "#999",
  fontSize: 16,
  lineHeight: 1,
  cursor: "pointer",
  fontFamily: "inherit",
};

const hintStyle: CSSProperties = {
  margin: "8px 0 0",
  fontSize: 13,
  color: "#595959",
};

const warningStyle: CSSProperties = {
  margin: "8px 0 0",
  padding: "10px 12px",
  borderRadius: 12,
  border: `1px solid ${color.border}`,
  background: color.warningBg,
  color: color.text,
  fontSize: 12,
  fontWeight: 600,
};

const dropdownStyle: CSSProperties = {
  position: "relative",
  width: "100%",
  boxSizing: "border-box",
  margin: "6px 0 0",
  padding: 4,
  listStyle: "none",
  background: "#FFFFFF",
  border: `1px solid ${color.border}`,
  borderRadius: 14,
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  maxHeight: "min(440px, 55vh)",
  overscrollBehavior: "contain",
  overflowY: "auto",
  zIndex: 10,
};

const dropdownItemStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 12,
  width: "100%",
  minWidth: 0,
  minHeight: 44,
  background: "#fff",
  padding: "10px 8px",
  border: "none",
  borderRadius: 10,
  cursor: "pointer",
  textAlign: "left",
  fontFamily: "inherit",
};

const resultImageStyle: CSSProperties = {
  width: 44,
  height: 44,
  borderRadius: 10,
  objectFit: "cover",
  flexShrink: 0,
  border: `1px solid ${color.border}`,
};

const resultImagePlaceholderStyle: CSSProperties = {
  ...resultImageStyle,
  background: "#FAFAFA",
};

const resultTextStyle: CSSProperties = {
  display: "grid",
  gap: 2,
  minWidth: 0,
};

const resultTitleStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 600,
  color: color.text,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const resultVariantStyle: CSSProperties = {
  fontSize: 12,
  color: "#595959",
  overflowWrap: "anywhere",
};

const selectedCardStyle: CSSProperties = {
  border: `1px solid ${color.border}`,
  borderRadius: 16,
  padding: 16,
  background: "#FFFFFF",
  boxShadow: "0 1px 2px rgba(0,0,0,0.04)",
  display: "grid",
  gap: 10,
};

const selectedCardHeaderStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: 8,
};

const selectedEmojiStyle: CSSProperties = { fontSize: 18 };

const selectedTitleStyle: CSSProperties = {
  fontSize: 15,
  fontWeight: 700,
  color: color.text,
  overflowWrap: "anywhere",
  wordBreak: "break-word",
};

const selectedImageStyle: CSSProperties = {
  width: 80,
  height: 80,
  borderRadius: 12,
  objectFit: "cover",
  border: `1px solid ${color.border}`,
};

const selectedImagePlaceholderStyle: CSSProperties = {
  ...selectedImageStyle,
  background: "#FAFAFA",
};

const variantLabelStyle: CSSProperties = {
  margin: 0,
  fontSize: 13,
  color: "#666",
};

const selectedFooterStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: 8,
  alignItems: "center",
  justifyContent: "space-between",
};

const selectedBadgeStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  color: "#0EA765",
};

const changeButtonStyle: CSSProperties = {
  minHeight: 44,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  background: "#fff",
  color: color.text,
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const removeButtonStyle: CSSProperties = {
  minHeight: 44,
  border: `1px solid ${color.border}`,
  borderRadius: 10,
  background: "#fff",
  color: "#E5484D",
  fontSize: 13,
  fontWeight: 600,
  padding: "6px 12px",
  cursor: "pointer",
  fontFamily: "inherit",
};

const groupHeadingStyle: CSSProperties = { margin: 0, padding: "10px 8px", fontSize: 13, fontWeight: 700, color: color.text, background: "#f3f4f6", overflowWrap: "anywhere" };
const groupListStyle: CSSProperties = { margin: 0, padding: 0, listStyle: "none" };
const resultsHintStyle: CSSProperties = { margin: 0, padding: "8px", fontSize: 12, color: "#595959", lineHeight: 1.5 };
const availabilityStyle: CSSProperties = { fontSize: 12, fontWeight: 700 };
const variantListStyle: CSSProperties = { display: "grid", gap: 6, maxHeight: "min(360px, 45vh)", overflowY: "auto", minWidth: 0 };
