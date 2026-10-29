import type { HeadersFunction, LinksFunction, LoaderFunctionArgs } from "react-router";
import { memo, useEffect } from "react";
import { Outlet, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { AppProvider } from "@shopify/shopify-app-react-router/react";

import { authenticateAdmin } from "../shopify.server";
import adminStyles from "../styles/admin.css?url";

export const links: LinksFunction = () => [
  { rel: "stylesheet", href: adminStyles },
];

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticateAdmin(request);

  // eslint-disable-next-line no-undef
  return {
    apiKey: process.env.SHOPIFY_API_KEY || "",
  };
};

const AdminNav = memo(function AdminNav() {
  return (
    <s-app-nav>
      <s-link href="/app">Home</s-link>
      <s-link href="/app/campaigns">Campaigns</s-link>
      <s-link href="/app/analytics">Analytics</s-link>
      <s-link href="/app/widgets">Theme setup</s-link>
      <s-link href="/app/billing">Billing</s-link>
      <s-link href="/app/settings">Settings</s-link>
      <s-link href="/app/help">Help</s-link>
    </s-app-nav>
  );
});

function AdminFrame() {
  const navigation = useNavigation();
  const isRouteLoading = navigation.state === "loading";

  useEffect(() => {
    const focusApp = () => {
      if (document.hasFocus()) return;
      window.focus();
    };
    document.addEventListener("pointerdown", focusApp, true);
    return () => document.removeEventListener("pointerdown", focusApp, true);
  }, []);

  return (
    <div className="fgpb-admin">
      <div className="fgpb-main">
        {isRouteLoading ? (
          <div className="fgpb-loading-bar" role="progressbar" aria-label="Loading page" />
        ) : null}
        <div className="fgpb-content">
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const { apiKey } = useLoaderData<typeof loader>();

  return (
    <AppProvider embedded apiKey={apiKey}>
      <AdminNav />
      <AdminFrame />
    </AppProvider>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (headersArgs) => {
  return boundary.headers(headersArgs);
};
