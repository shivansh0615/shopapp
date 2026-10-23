import type { LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { appEntryRedirectTarget } from "../../lib/app-entry-redirect";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  throw redirect(appEntryRedirectTarget(new URL(request.url)));
};

export default function Index() {
  return null;
}
