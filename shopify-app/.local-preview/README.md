# Local dashboard preview

Run `node .local-preview/server.mjs` from the project folder and open http://127.0.0.1:4173/app.

This harness renders the actual page components and styles with sample data. Vite reloads source edits automatically. Shopify authentication, server loaders, and production actions are excluded only in this preview. No live credentials or database are used.

Includes Overview, Campaigns, create/edit campaign, Theme setup, Analytics, Diagnostics, Billing, Settings, and Help. Product search has three local sample products (Aloe Vera Gift, Travel Pouch, Cotton Tote). Settings save in memory until refresh. Campaign save/activate/delete actions are intentionally simulated with a notice; no live operations occur. Theme editor and storefront integrations require the live Shopify app.

The sidebar is a local substitute for Shopify's navigation. These files are outside production routes and are not shipped in the app build.
