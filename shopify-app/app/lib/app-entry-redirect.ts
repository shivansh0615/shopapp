/** The public app address should open the embedded admin, not a separate install page. */
export function appEntryRedirectTarget(url: URL): string {
  const query = url.searchParams.toString();
  return query ? `/app?${query}` : "/app";
}
