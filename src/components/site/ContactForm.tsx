"use client";

import { useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Send, Loader2, CheckCircle2 } from "lucide-react";

const schema = z.object({
  name: z.string().min(1, "Required").max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  branch_id: z.string().optional(),
  message: z.string().min(5, "Tell us a little more").max(2000),
  // honeypot — humans don't see this field; bots fill every input
  website: z.string().max(0).optional().or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  branches: { id: string; name: string }[];
}

export default function ContactForm({ branches }: Props) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
    reset,
  } = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { name: "", email: "", phone: "", branch_id: "", message: "", website: "" },
  });
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onSubmit = async (values: FormValues) => {
    setError(null);
    try {
      const res = await fetch("/api/contact", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(values),
      });
      if (!res.ok) throw new Error("Submission failed");
      setDone(true);
      reset();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    }
  };

  if (done) {
    return (
      <div className="p-8 border border-phosphor/40 bg-bg-card rounded-xl glow-phosphor">
        <CheckCircle2 className="h-8 w-8 text-phosphor" />
        <h3 className="mt-4 text-2xl font-display text-cream">Connection established</h3>
        <p className="mt-2 text-cream-dim text-sm">
          We&apos;ve got your message. Expect a reply within a few hours during operating time.
        </p>
        <button
          onClick={() => setDone(false)}
          className="mt-5 font-mono text-xs uppercase tracking-widest text-amber hover:underline"
        >
          // send another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="grid gap-5 md:grid-cols-2">
        <Field label="Your name" error={errors.name?.message}>
          <input
            {...register("name")}
            className="form-input"
            placeholder="Player one"
            autoComplete="name"
          />
        </Field>
        <Field label="Phone" error={errors.phone?.message}>
          <input
            {...register("phone")}
            className="form-input"
            placeholder="+63 9XX XXX XXXX"
            autoComplete="tel"
          />
        </Field>
      </div>

      <Field label="Email (optional)" error={errors.email?.message}>
        <input
          {...register("email")}
          className="form-input"
          placeholder="hi@example.com"
          autoComplete="email"
        />
      </Field>

      {branches.length > 0 && (
        <Field label="Which branch?">
          <select {...register("branch_id")} className="form-input">
            <option value="">Any / not sure</option>
            {branches.map((b) => (
              <option key={b.id} value={b.id}>
                {b.name}
              </option>
            ))}
          </select>
        </Field>
      )}

      <Field label="Message" error={errors.message?.message}>
        <textarea
          {...register("message")}
          rows={5}
          className="form-input resize-none"
          placeholder="What do you need from us?"
        />
      </Field>

      {/* Honeypot — hidden from real users, bots fill every input */}
      <div aria-hidden="true" style={{ position: "absolute", left: "-9999px", top: "-9999px", width: 0, height: 0, overflow: "hidden" }}>
        <label>
          Website (leave blank)
          <input
            type="text"
            tabIndex={-1}
            autoComplete="off"
            {...register("website")}
          />
        </label>
      </div>

      {error && (
        <p className="font-mono text-xs text-red-400">// error: {error}</p>
      )}

      <button
        type="submit"
        disabled={isSubmitting}
        className="key-cap key-cap-primary w-full md:w-auto"
      >
        {isSubmitting ? (
          <>
            <Loader2 className="h-4 w-4 animate-spin" />
            Sending…
          </>
        ) : (
          <>
            <Send className="h-4 w-4" />
            Transmit
          </>
        )}
      </button>
      <style>{`
        .form-input {
          width: 100%;
          background: var(--color-bg);
          border: 1px solid var(--color-line-bright);
          border-radius: 0.5rem;
          padding: 0.75rem 1rem;
          color: var(--color-cream);
          font-family: var(--font-sans);
          font-size: 0.95rem;
          transition: border-color 120ms;
        }
        .form-input:focus {
          outline: none;
          border-color: var(--color-amber);
          box-shadow: 0 0 0 1px rgba(255,181,71,0.4), 0 0 24px rgba(255,181,71,0.15);
        }
        .form-input::placeholder { color: var(--color-mocha); }
      `}</style>
    </form>
  );
}

function Field({
  label,
  children,
  error,
}: {
  label: string;
  children: React.ReactNode;
  error?: string;
}) {
  return (
    <label className="block">
      <span className="font-mono text-[0.7rem] uppercase tracking-[0.18em] text-phosphor">
        // {label}
      </span>
      <div className="mt-2">{children}</div>
      {error && <p className="mt-1 text-xs text-red-400">{error}</p>}
    </label>
  );
}
