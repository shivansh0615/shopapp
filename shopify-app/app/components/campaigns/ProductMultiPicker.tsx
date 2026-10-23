import type { CSSProperties } from "react";
import { useState } from "react";
import { ProductPicker, type SelectedGiftProduct } from "./ProductPicker";

export type RecommendationProduct = SelectedGiftProduct & {
  price?: string | null;
  compareAtPrice?: string | null;
  /** True when Shopify says the variant is not sellable. */
  outOfStock?: boolean;
};

type ProductMultiPickerProps = {
  products: RecommendationProduct[];
  maxProducts?: number;
  onChange: (products: RecommendationProduct[]) => void;
  disabled?: boolean;
};

export function ProductMultiPicker({
  products,
  maxProducts = 4,
  onChange,
  disabled,
}: ProductMultiPickerProps) {
  const [pickerError, setPickerError] = useState<string | null>(null);
  const [pickerKey, setPickerKey] = useState(0);
  function addProduct(product: SelectedGiftProduct) {
    if (disabled || products.length >= maxProducts) return;
    if (products.some(p => p.productId === product.productId)) {
      setPickerError("This product is already selected.");
      return;
    }
    setPickerError(null);
    onChange([...products, { ...product, outOfStock: false }]);
    setPickerKey(key => key + 1);
  }

  function removeAt(index: number) {
    onChange(products.filter((_, i) => i !== index));
  }

  function move(index: number, delta: number) {
    const next = index + delta;
    if (next < 0 || next >= products.length) return;
    const copy = products.slice();
    const [item] = copy.splice(index, 1);
    copy.splice(next, 0, item);
    onChange(copy);
  }

  return (
    <div style={{ display: "grid", gap: 12 }}>
      <div style={{ display: "grid", gap: 8 }}>
        {products.map((product, index) => (
          <div
            key={`${product.productId}-${product.variantId}`}
            style={{
              ...rowStyle,
              borderColor: product.outOfStock ? "#f0b4b4" : "#e8e8e8",
              background: product.outOfStock ? "#fff5f5" : "#fff",
            }}
          >
            {product.imageUrl ? (
              <img src={product.imageUrl} alt="" style={thumbStyle} />
            ) : (
              <div style={{ ...thumbStyle, background: "#f5f5f5" }} />
            )}
            <div style={{ minWidth: 0, flex: 1 }}>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 13 }}>{product.title}</p>
              <p style={{ margin: "2px 0 0", fontSize: 12, color: "#999" }}>{product.variantTitle}</p>
              {product.outOfStock ? (
                <p style={{ margin: "4px 0 0", fontSize: 12, color: "#b42318", fontWeight: 600 }}>
                  Out of stock — won&apos;t show in bestsellers
                </p>
              ) : null}
            </div>
            <div style={{ display: "flex", gap: 4 }}>
              <button type="button" style={iconBtnStyle} disabled={disabled || index === 0} onClick={() => move(index, -1)}>
                ↑
              </button>
              <button
                type="button"
                style={iconBtnStyle}
                disabled={disabled || index === products.length - 1}
                onClick={() => move(index, 1)}
              >
                ↓
              </button>
              <button type="button" style={iconBtnStyle} disabled={disabled} onClick={() => removeAt(index)}>
                ✕
              </button>
            </div>
          </div>
        ))}
      </div>

      {pickerError ? <p style={errorStyle} role="alert">{pickerError}</p> : null}
      {products.length < maxProducts ? (
        <fieldset disabled={disabled} style={{ border: 0, padding: 0, margin: 0, minWidth: 0 }}>
          <legend style={hintStyle}>Add a recommended product and variant</legend>
          <ProductPicker key={pickerKey} selectedProduct={null} onSelect={addProduct} onRemove={() => setPickerError(null)} />
        </fieldset>
      ) : <p style={hintStyle}>Maximum of {maxProducts} products.</p>}
    </div>
  );
}

const rowStyle: CSSProperties = {
  display: "flex",
  gap: 10,
  alignItems: "center",
  padding: "8px 10px",
  border: "1px solid #e8e8e8",
  borderRadius: 8,
};

const thumbStyle: CSSProperties = {
  width: 40,
  height: 40,
  borderRadius: 6,
  objectFit: "cover",
  flexShrink: 0,
};

const iconBtnStyle: CSSProperties = {
  width: 28,
  height: 28,
  border: "1px solid #e8e8e8",
  borderRadius: 6,
  background: "#fff",
  cursor: "pointer",
  fontSize: 12,
};

const hintStyle: CSSProperties = {
  margin: "6px 0 0",
  fontSize: 12,
  color: "#999",
};

const errorStyle: CSSProperties = {
  margin: 0,
  padding: "8px 10px",
  borderRadius: 8,
  background: "#fff5f5",
  border: "1px solid #f0b4b4",
  color: "#b42318",
  fontSize: 12,
  fontWeight: 600,
};
