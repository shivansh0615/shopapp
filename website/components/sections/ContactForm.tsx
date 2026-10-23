"use client";

import { FormEvent, useState } from "react";
import { SITE } from "@/lib/constants";
import { Button } from "@/components/ui/Button";

const inbox = SITE.contactEmail.trim();

export function ContactForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [store, setStore] = useState("");
  const [message, setMessage] = useState("");

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!inbox) return;

    const body = [
      `Name: ${name}`,
      `Email: ${email}`,
      `Shopify store: ${store || "(not provided)"}`,
      "",
      message,
    ].join("\n");

    const href = `mailto:${inbox}?subject=${encodeURIComponent(
      `UpsellTrix inquiry from ${name || "a merchant"}`,
    )}&body=${encodeURIComponent(body)}`;

    window.location.href = href;
  }

  const fieldClass =
    "mt-2 min-h-11 w-full rounded-xl border border-[var(--border)] bg-black/40 px-4 py-3 text-base text-white outline-none transition-colors placeholder:text-[var(--muted-foreground)] focus:border-[var(--highlight)]";

  return (
    <form onSubmit={onSubmit} className="mt-10 space-y-5">
      <label className="block">
        <span className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          Name
        </span>
        <input
          required
          name="name"
          autoComplete="name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          Email
        </span>
        <input
          required
          type="email"
          name="email"
          autoComplete="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          Shopify store URL
        </span>
        <input
          type="url"
          name="store"
          inputMode="url"
          placeholder="https://"
          value={store}
          onChange={(e) => setStore(e.target.value)}
          className={fieldClass}
        />
      </label>

      <label className="block">
        <span className="text-[11px] font-medium tracking-[0.14em] text-[var(--muted-foreground)] uppercase">
          Message
        </span>
        <textarea
          required
          name="message"
          rows={6}
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          className={`${fieldClass} resize-y`}
        />
      </label>

      <div className="pt-2">
        <Button
          type="submit"
          size="lg"
          className="btn-shine w-full sm:w-auto"
          disabled={!inbox}
        >
          {inbox ? "Open email to send" : "Contact inbox not published yet"}
        </Button>
        {!inbox ? (
          <p className="mt-4 max-w-md text-sm leading-relaxed text-[var(--muted-foreground)]">
            A public contact address is not live yet. This form will open your
            email app once we publish an inbox.
          </p>
        ) : (
          <p className="mt-4 text-sm text-[var(--muted-foreground)]">
            Opens your email app addressed to {inbox}.
          </p>
        )}
      </div>
    </form>
  );
}
