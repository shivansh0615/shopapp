import type { DetailedHTMLProps, HTMLAttributes } from "react";

type ShopifyNavProps = DetailedHTMLProps<HTMLAttributes<HTMLElement>, HTMLElement> & {
  href?: string;
};

declare global {
  namespace JSX {
    interface IntrinsicElements {
      "s-app-nav": ShopifyNavProps;
      "s-link": ShopifyNavProps;
    }
  }
}

export {};
