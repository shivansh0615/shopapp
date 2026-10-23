import type { Metadata } from "next";
import Link from "next/link";
import { SITE } from "@/lib/constants";
import {
  LegalDocument,
  LegalSection,
} from "@/components/layout/LegalDocument";

export const metadata: Metadata = {
  title: {
    absolute: "Terms of Service | UpsellTrix",
  },
  description:
    "Terms governing use of the UpsellTrix website and Shopify application operated by Algorithmtrix Pvt. Ltd.",
  openGraph: {
    title: "Terms of Service | UpsellTrix",
    description:
      "Terms governing use of the UpsellTrix website and Shopify application operated by Algorithmtrix Pvt. Ltd.",
  },
  twitter: {
    title: "Terms of Service | UpsellTrix",
    description:
      "Terms governing use of the UpsellTrix website and Shopify application operated by Algorithmtrix Pvt. Ltd.",
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

export default function TermsPage() {
  return (
    <LegalDocument
      kicker="Legal"
      title="Terms of Service"
      description={`These Terms of Service govern your use of ${SITE.name}, a Shopify application operated by ${SITE.legalName}.`}
      effectiveDate={SITE.legalEffectiveDate}
    >
      <LegalSection title="1. Acceptance of Terms">
        <p>
          These Terms of Service (“Terms”) govern access to and use of{" "}
          {SITE.name}, including the Shopify application and this related
          website.
        </p>
        <p>
          Installing {SITE.name}, using {SITE.name}, or continuing to use this
          website constitutes acceptance of these Terms, subject to applicable
          law and Shopify platform requirements. If you do not agree, do not
          install or use {SITE.name}.
        </p>
        <p>
          If you install or use {SITE.name} for a business, you represent that
          you have authority to bind that business to these Terms.
        </p>
      </LegalSection>

      <LegalSection title="2. About UpsellTrix">
        <p>
          {SITE.name} is a Shopify embedded application operated by{" "}
          {SITE.legalName}. It allows merchants to configure and display
          promotional experiences on supported Shopify Online Store
          storefronts.
        </p>
        <p>
          The current launch includes Spend X → Free Gift campaigns, Tiered
          Free Gifts (also described as Tiered Rewards), a storefront
          promotion progress bar, a Shopify theme app embed, campaign
          creation and configuration, campaign draft / activate / pause
          controls, and a Shopify automatic app discount used for eligible
          gifts.
        </p>
        <p>
          {SITE.name} may interact with Shopify products, discounts,
          storefront and cart information, and theme integrations as needed to
          provide those features. We do not promise particular sales,
          conversion, or average-order-value results.
        </p>
      </LegalSection>

      <LegalSection title="3. Shopify and Third-Party Services">
        <p>
          Shopify is a third-party platform. {SITE.name} is operated by{" "}
          {SITE.legalName}, which is responsible for {SITE.name}. Shopify is
          not responsible for {SITE.name}’s operation or support except where
          Shopify’s own terms require otherwise.
        </p>
        <p>
          Your use of Shopify remains subject to Shopify’s applicable
          agreements and policies. Nothing in these Terms means that Shopify
          endorses {SITE.name}.
        </p>
        <p>
          {SITE.name} depends in part on third-party services, including
          Shopify. We cannot control outages, delays, or changes made by
          third-party platforms.
        </p>
      </LegalSection>

      <LegalSection title="4. Installation and Permissions">
        <p>
          You install {SITE.name} through Shopify. Shopify will show the
          access the app needs to operate. You should review that access
          before you approve it.
        </p>
        <p>
          To provide the current launch features, {SITE.name} may need to
          access product and catalog information used for gift configuration,
          inspect and manage app discounts, and access publication information
          used to understand storefront availability. How we handle
          information is described in our{" "}
          <Link href="/privacy" className={MAIL_CLASS}>
            Privacy Policy
          </Link>
          .
        </p>
        <p>
          Shopify may later ask you to re-approve access if permissions change.
        </p>
      </LegalSection>

      <LegalSection title="5. Merchant Responsibilities">
        <p>You are responsible for:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>
            maintaining an active Shopify store and account where required;
          </li>
          <li>configuring campaigns correctly;</li>
          <li>selecting appropriate products and gifts;</li>
          <li>verifying product inventory and availability;</li>
          <li>
            ensuring promotions comply with laws applicable to your store;
          </li>
          <li>
            ensuring promotional wording, pricing, and claims are accurate;
          </li>
          <li>
            testing campaigns before exposing them to customers;
          </li>
          <li>
            maintaining appropriate Shopify and theme configuration, including
            enabling the theme app embed where the storefront experience
            requires it;
          </li>
          <li>safeguarding your Shopify account; and</li>
          <li>using {SITE.name} lawfully.</li>
        </ul>
        <p>
          These responsibilities do not make you responsible for defects in{" "}
          {SITE.name} itself.
        </p>
      </LegalSection>

      <LegalSection title="6. Promotions and Compatibility">
        <p>
          Promotion eligibility and display can depend on merchant
          configuration, cart value, eligible products, product availability,
          Shopify storefront behavior, theme configuration, and Shopify APIs
          and services.
        </p>
        <p>
          The current launch is designed for Shopify Online Store, with a
          primary supported experience on Dawn and other Online Store 2.0
          themes where the theme app embed can be enabled. We do not guarantee
          that every promotion will run under every checkout, third-party
          cart, custom theme, or accelerated checkout environment.
        </p>
      </LegalSection>

      <LegalSection title="7. Fees and Billing">
        <p>
          {SITE.name} is currently offered without an app subscription fee for
          the current launch.
        </p>
        <p>
          If paid functionality, plans, or charges are introduced later,
          applicable pricing and billing terms will be disclosed before you
          incur those charges and handled in accordance with applicable
          Shopify platform requirements. These Terms do not authorize future
          charges unless you later agree to those pricing and billing terms.
        </p>
      </LegalSection>

      <LegalSection title="8. Acceptable Use">
        <p>You may not:</p>
        <ul className="list-disc space-y-2 pl-5">
          <li>use {SITE.name} unlawfully;</li>
          <li>attempt unauthorized access to the service or related systems;</li>
          <li>interfere with or disrupt the service;</li>
          <li>
            reverse engineer the service except where applicable law allows;
          </li>
          <li>use the service to distribute malware;</li>
          <li>abuse infrastructure or attempt to overload the service;</li>
          <li>violate Shopify policies; or</li>
          <li>infringe third-party rights.</li>
        </ul>
      </LegalSection>

      <LegalSection title="9. Availability and Changes">
        <p>
          We may improve, modify, add, or remove features. Maintenance or
          platform issues may occasionally affect availability. Compatibility
          may change as Shopify, themes, and platform APIs evolve.
        </p>
        <p>
          We do not guarantee uninterrupted or error-free operation. Because
          the current launch is free, we may adjust available features as the
          product develops. If paid features are later introduced, withdrawal
          or material reduction of paid access will be handled under the
          then-current billing terms rather than under an unrestricted right
          to cancel paid service without process.
        </p>
      </LegalSection>

      <LegalSection title="10. Intellectual Property">
        <p>
          {SITE.name} software, branding, design, and associated materials
          remain owned by {SITE.legalName} or applicable licensors. These
          Terms do not transfer ownership of that material to you.
        </p>
        <p>
          You retain ownership and control of your store, your content, your
          product information, your trademarks, and your campaign content. You
          grant us only the rights needed to operate {SITE.name} for your
          store, including displaying and processing campaign configuration
          and related storefront experiences you enable.
        </p>
      </LegalSection>

      <LegalSection title="11. Feedback">
        <p>
          If you voluntarily send product feedback or suggestions, you grant{" "}
          {SITE.legalName} a non-exclusive, worldwide, royalty-free license to
          use that feedback to operate and improve {SITE.name}. This license
          is limited to voluntary product feedback and does not transfer
          ownership of your store, products, or other business content.
        </p>
        <p>
          This feedback license is subject to legal review.
        </p>
      </LegalSection>

      <LegalSection title="12. Privacy">
        <p>
          Handling of information in connection with {SITE.name} is described
          in the{" "}
          <Link href="/privacy" className={MAIL_CLASS}>
            Privacy Policy
          </Link>
          .
        </p>
      </LegalSection>

      <LegalSection title="13. Termination">
        <p>
          You may stop using {SITE.name} and uninstall it from Shopify at any
          time.
        </p>
        <p>
          We may suspend or terminate access for material breach of these
          Terms, unlawful use, security threats, abuse, or where required by
          law or platform rules.
        </p>
        <p>
          After uninstall, applicable data handling follows the Privacy Policy
          and Shopify privacy requirements. Uninstall does not necessarily
          delete all application data immediately.
        </p>
      </LegalSection>

      <LegalSection title="14. Disclaimers">
        <p>
          {SITE.name} is provided on an “as is” and “as available” basis, to
          the extent permitted by law. We do not promise uninterrupted
          availability, error-free operation, guaranteed sales, guaranteed
          conversion improvements, guaranteed average-order-value
          improvements, guaranteed compatibility with every Shopify theme or
          integration, or guaranteed promotion outcomes.
        </p>
        <p>
          This disclaimer is subject to mandatory rights that cannot be
          excluded under applicable law and to legal review.
        </p>
      </LegalSection>

      <LegalSection title="15. Limitation of Liability">
        <p>
          To the maximum extent permitted by applicable law, {SITE.legalName}{" "}
          will not be liable for indirect, incidental, special, consequential,
          or punitive damages, or for lost profits, revenue, data, or
          goodwill, arising from your use of {SITE.name} or this website.
        </p>
        <p>
          These Terms do not set a specific monetary liability cap. Any
          allocation of risk in this section is subject to mandatory
          applicable law and to legal review. Nothing in these Terms excludes
          liability that cannot legally be limited.
        </p>
      </LegalSection>

      <LegalSection title="16. Indemnification">
        <p>
          You agree to defend and indemnify {SITE.legalName} against claims
          arising from your unlawful use of {SITE.name}, your content, your
          violation of third-party rights, or your violation of these Terms,
          except to the extent a claim is caused by our willful misconduct or
          by a defect in {SITE.name} itself.
        </p>
        <p>
          This indemnification provision is subject to applicable law and to
          legal review.
        </p>
      </LegalSection>

      <LegalSection title="17. Governing Law">
        <p>
          These Terms are governed by the applicable laws of India, and courts
          in {SITE.jurisdiction} have jurisdiction, subject to mandatory
          applicable law.
        </p>
        <p>
          This governing-law provision is subject to legal review. These Terms
          do not specify an arbitration institution or procedure.
        </p>
      </LegalSection>

      <LegalSection title="18. Changes to These Terms">
        <p>
          We may update these Terms from time to time. Material changes may be
          communicated by reasonable means, including an updated effective
          date on this page.
        </p>
        <p>
          If you do not agree to an update, you should stop using and
          uninstall {SITE.name}. Continued use after an update does not waive
          rights that cannot legally be waived.
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
          <Link href="/privacy" className={MAIL_CLASS}>
            Privacy Policy
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
