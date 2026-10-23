import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/constants";
import {
  LegalDocument,
  LegalSection,
} from "@/components/layout/LegalDocument";

export const metadata: Metadata = {
  title: {
    absolute: "Privacy Policy | UpsellTrix",
  },
  description:
    "How Algorithmtrix Pvt. Ltd. handles information in connection with the UpsellTrix website and Shopify app.",
  openGraph: {
    title: "Privacy Policy | UpsellTrix",
    description:
      "How Algorithmtrix Pvt. Ltd. handles information in connection with the UpsellTrix website and Shopify app.",
  },
  twitter: {
    title: "Privacy Policy | UpsellTrix",
    description:
      "How Algorithmtrix Pvt. Ltd. handles information in connection with the UpsellTrix website and Shopify app.",
  },
};

const SUPPORT = SITE.supportEmail;
const MAIL_CLASS =
  "text-white transition-colors hover:text-[var(--accent)]";

function MailLink() {
  return (
    <a href={`mailto:${SUPPORT}`} className={MAIL_CLASS}>
      {SUPPORT}
    </a>
  );
}

export default function PrivacyPage() {
  return (
    <LegalDocument
      kicker="Legal"
      title="Privacy Policy"
      description={`This policy explains how ${SITE.legalName} (“we”, “us”) handles information in connection with ${SITE.name}.`}
      effectiveDate={SITE.legalEffectiveDate}
    >
      <LegalSection title="1. Introduction">
        <p>
          {SITE.name} is a Shopify application and related marketing website
          operated by {SITE.legalName}, {SITE.jurisdiction}. The current launch
          of the app is offered free of charge.
        </p>
        <p>
          This policy covers (1) this public website, and (2) the {SITE.name}{" "}
          Shopify application that merchants may install from Shopify. Shopify
          is a separate company. Shopify’s handling of information is described
          in Shopify’s own privacy materials. We do not control Shopify’s
          platforms.
        </p>
        <p>
          For privacy questions, contact <MailLink />.
        </p>
      </LegalSection>

      <LegalSection title="2. Information We Receive and Process">
        <p>
          We receive and process information in these main situations:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            when a merchant installs and uses {SITE.name} through Shopify;
          </li>
          <li>
            when the storefront sends limited cart context so the app can
            evaluate promotions;
          </li>
          <li>
            when you contact us, including through this website’s contact form
            (which opens your email application to send us a message);
          </li>
          <li>
            limited first-party operational or analytics records related to app
            usage and promotion behavior, if that functionality is used.
          </li>
        </ul>
        <p>
          {SITE.name} may maintain limited first-party operational or analytics
          records related to app usage and promotion behavior. Operational logs
          may include technical information such as a shop identifier, the
          route involved, error information, and request metadata. Request URLs
          may include Shopify-supplied identifiers. {SITE.name} does
          not currently integrate advertising networks or third-party
          behavioral analytics SDKs in the Shopify app runtime.
        </p>
        <p>
          This website does not implement its own server-side store of
          contact-form submissions. If you use the contact form, you may
          provide your name, email address, Shopify store URL, and a message.
        </p>
      </LegalSection>

      <LegalSection title="3. Shopify Information and Permissions">
        <p>
          When you install {SITE.name}, Shopify authenticates your merchant
          account and shows the access the app is requesting. {SITE.name}{" "}
          currently requests only the following Shopify API scopes:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <code className="text-white">read_discounts</code> and{" "}
            <code className="text-white">write_discounts</code> — to create and
            manage the automatic app discount used for free-gift promotions;
          </li>
          <li>
            <code className="text-white">read_publications</code> — to check
            whether selected gift products are published to the Online Store;
          </li>
          <li>
            <code className="text-white">read_products</code> — so merchants can
            search, select, and validate gift products and variants.
          </li>
        </ul>
        <p>{SITE.name} does not request:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            <code className="text-white">read_customers</code> or{" "}
            <code className="text-white">write_customers</code>;
          </li>
          <li>
            <code className="text-white">read_orders</code>,{" "}
            <code className="text-white">write_orders</code>, or{" "}
            <code className="text-white">read_all_orders</code>;
          </li>
          <li>
            <code className="text-white">read_checkouts</code>;
          </li>
          <li>
            <code className="text-white">read_customer_payment_methods</code>.
          </li>
        </ul>
        <p>
          We do not use those APIs as part of the current application. The
          permissions Shopify displays at install time remain the merchant-facing
          record of what you approve.
        </p>
      </LegalSection>

      <LegalSection title="4. Merchant and Account Information">
        <p>
          {SITE.name} uses Shopify’s authentication framework. The application
          stores session information in PostgreSQL. That information may
          include:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Shopify shop identifier or domain;</li>
          <li>Shopify access credentials needed to operate the app;</li>
          <li>granted scopes;</li>
          <li>session metadata used to keep the installation authenticated.</li>
        </ul>
        <p>
          If Shopify session handling supplies staff identity information, that
          information may be represented in session records. We do not
          separately require merchant staff name or email as a condition of
          using the app, and we do not claim that staff identity is always
          collected.
        </p>
      </LegalSection>

      <LegalSection title="5. Product and Promotion Configuration">
        <p>
          Merchants configure campaigns, thresholds, gifts, and widget
          appearance in {SITE.name}. We store shop-scoped operational
          information in PostgreSQL, including where applicable:
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>Shopify shop or domain information;</li>
          <li>campaign configuration and widget settings;</li>
          <li>
            gift product and variant identifiers, plus display titles and image
            URLs selected by the merchant;
          </li>
          <li>thresholds and other promotion configuration;</li>
          <li>
            discount identifiers and synchronization status, and related
            background job records;
          </li>
          <li>storefront integration heartbeat timestamps;</li>
          <li>
            limited first-party analytics-event records if that functionality is
            used.
          </li>
        </ul>
        <p>
          To help merchants choose gifts and validate them, {SITE.name} reads
          Shopify product and publication information. That may include product
          and variant identifiers, titles, images, price and compare-at
          information during selection, availability or inventory-related
          information during validation, and publication status.
        </p>
        <p>
          Some merchant-selected identifiers, titles, and image URLs are stored
          as part of campaign configuration. Other live catalog details may be
          read only while the merchant is selecting or validating a product, and
          are not retained as a full copy of the merchant’s Shopify catalog.
        </p>
      </LegalSection>

      <LegalSection title="6. Cart and Storefront Information">
        <p>
          The storefront may send limited cart information to {SITE.name}’s
          Shopify App Proxy so the app can evaluate promotion eligibility and
          display progress. Current production storefront data includes paid
          cart subtotal, currency, and technical or cache-busting request
          values.
        </p>
        <p>
          The application may also support transient cart-line evaluation
          internally. This information is used in memory for promotion
          evaluation. {SITE.name} does not persist the shopper’s full cart
          contents as a cart record in its database.
        </p>
        <p>
          Gift line properties used to identify a free gift are stored by
          Shopify on Shopify cart lines. They are not stored as customer
          records in {SITE.name}’s database.
        </p>
        <p>
          {SITE.name} does not request Shopify Customer API access, does not
          maintain a customer CRM, and does not store customer email, phone
          number, address, or customer account records as part of its normal
          app functionality. {SITE.name} does not request Shopify Order API
          access, does not access or store Shopify orders in the live
          application, and does not request Shopify Checkout API access or
          payment-method access.
        </p>
        <p>
          The points above do not mean that no shopper-related information is
          ever processed. Limited cart context is processed so promotions can
          work on the storefront.
        </p>
      </LegalSection>

      <LegalSection title="7. How We Use Information">
        <p>We use the information described in this policy to:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            provide, operate, authenticate, and maintain {SITE.name};
          </li>
          <li>
            let merchants configure campaigns, gifts, and storefront widgets;
          </li>
          <li>
            evaluate promotion eligibility and display progress on the
            storefront;
          </li>
          <li>
            create and keep the Shopify automatic discount used for free gifts
            in sync;
          </li>
          <li>respond to support and privacy requests;</li>
          <li>
            diagnose technical issues, maintain security, and prevent abuse;
          </li>
          <li>
            comply with law and with Shopify Partner requirements.
          </li>
        </ul>
      </LegalSection>

      <LegalSection title="8. Shopify Discounts and App Functionality">
        <p>
          {SITE.name} uses Shopify discount APIs to create and manage the
          automatic app discount required for free-gift promotions. We may
          store the Shopify discount identifier and synchronization state.
        </p>
        <p>
          Promotion configuration needed by the Shopify Discount Function may
          also be written to Shopify-hosted discount metafields so Shopify can
          apply the gift discount at checkout.
        </p>
      </LegalSection>

      <LegalSection title="9. How We Share Information">
        <p>
          We share information with Shopify as required to provide the app
          through Shopify’s platform, APIs, App Proxy, webhooks, and related
          services.
        </p>
        <p>
          {SITE.name} does not currently include advertising-network or
          behavioral-advertising integrations in the application runtime. This
          website similarly does not currently load advertising or third-party
          behavioral analytics scripts.
        </p>
        <p>
          We may disclose information if required by law, to protect rights and
          safety, or in connection with a corporate transaction involving{" "}
          {SITE.name}.
        </p>
      </LegalSection>

      <LegalSection title="10. Service Providers">
        <p>
          We use Shopify to provide the application on Shopify’s platform. We
          also use database infrastructure to store the shop-scoped operational
          information described in this policy.
        </p>
        <p>
          We may use infrastructure and service providers to host and operate{" "}
          {SITE.name}. These providers process information only as necessary to
          provide their services to us.
        </p>
      </LegalSection>

      <LegalSection title="11. Data Retention">
        <p>
          We retain information for as long as reasonably necessary to operate
          the service, comply with legal obligations, resolve disputes, and
          enforce agreements, subject to applicable Shopify privacy and
          deletion requirements.
        </p>
        <p>
          When Shopify sends a shop-redact request, remaining shop-scoped
          application data is deleted as described in the next section.
        </p>
        <p>
          Specific retention periods are subject to final company and legal
          review.
        </p>
      </LegalSection>

      <LegalSection title="12. Data Deletion and Shopify Privacy Requests">
        <p>
          {SITE.name} implements Shopify’s required privacy mechanisms,
          including customers/data_request, customers/redact, and shop/redact,
          as well as app/uninstalled and app/scopes_update handling.
        </p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            Customer privacy requests are acknowledged. No stored
            buyer/customer records are identified for deletion because{" "}
            {SITE.name} does not maintain customer records.
          </li>
          <li>
            Uninstall removes Shopify session and access credentials and
            managed discount records. Campaign configuration and related
            shop-scoped application data may remain until Shopify later sends a
            shop-redact request. Uninstall does not delete all application data
            immediately.
          </li>
          <li>
            Remaining shop-scoped application data is deleted when Shopify
            sends the shop-redact request.
          </li>
        </ul>
        <p>
          Merchants can also uninstall {SITE.name} from Shopify admin. To ask
          us about a privacy request, email <MailLink />.
        </p>
      </LegalSection>

      <LegalSection title="13. Cookies and Browser Storage">
        <p>
          {SITE.name} does not currently set advertising or
          behavioral-tracking cookies in its storefront code.
        </p>
        <p>
          The storefront may use limited browser storage (including local
          storage or session storage, which are not cookies) for diagnostic
          settings, rollout or configuration state, temporary UI state, and
          request cooldown state. These values are not intended to contain
          customer personal information.
        </p>
        <p>
          Shopify itself may use its own cookies and session technologies
          according to Shopify’s policies. The embedded merchant admin relies
          on Shopify session-token flows.
        </p>
        <p>
          This marketing website may use technically necessary storage required
          for the pages to function.
        </p>
      </LegalSection>

      <LegalSection title="14. Security">
        <p>
          We use reasonable administrative, technical, and organizational
          measures designed to protect information. No method of transmission
          or storage is completely secure.
        </p>
      </LegalSection>

      <LegalSection title="15. International Processing">
        <p>
          {SITE.legalName} is based in {SITE.jurisdiction}. Information may be
          processed in India and in other locations where we or our service
          providers operate. Shopify may also process information in accordance
          with its own terms.
        </p>
      </LegalSection>

      <LegalSection title="16. Children's Privacy">
        <p>
          {SITE.name} is offered to businesses operating Shopify stores. It is
          not directed at children, and we do not knowingly collect personal
          information from children.
        </p>
      </LegalSection>

      <LegalSection title="17. Your Rights and Choices">
        <p>
          Depending on applicable law, you may have rights to access, correct,
          or delete personal information, or to object to or restrict certain
          processing. To make a request, email <MailLink />. We may need to
          verify the request.
        </p>
        <p>
          Merchants may also uninstall the app and use tools available in
          Shopify admin. Shopify may handle certain shopper requests through
          its own privacy processes.
        </p>
      </LegalSection>

      <LegalSection title="18. Changes to This Privacy Policy">
        <p>
          We may update this policy from time to time. The effective date above
          will change when we do. Continued use of {SITE.name} or this website
          after an update constitutes acceptance of the revised policy where
          permitted by law.
        </p>
      </LegalSection>

      <LegalSection title="19. Contact Us">
        <p>
          {SITE.legalName}
          <br />
          {SITE.jurisdiction}
          <br />
          <MailLink />
        </p>
        <p>
          See also our{" "}
          <Link href="/terms" className={MAIL_CLASS}>
            Terms of Service
          </Link>{" "}
          and{" "}
          <Link href="/support" className={MAIL_CLASS}>
            Support
          </Link>{" "}
          page.
        </p>
      </LegalSection>
    </LegalDocument>
  );
}
