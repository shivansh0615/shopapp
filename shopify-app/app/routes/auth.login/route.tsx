import { AppProvider } from "@shopify/shopify-app-react-router/react";

export default function Auth() {
  return (
    <AppProvider embedded={false}>
      <s-page>
        <s-section heading="Open UpsellTrix through Shopify">
          <p>
            Install or open UpsellTrix from the Shopify App Store or your
            Shopify admin. Shopify securely supplies the store identity during
            installation.
          </p>
        </s-section>
      </s-page>
    </AppProvider>
  );
}
