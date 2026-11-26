import { cn } from "@/lib/utils";

const control =
  "block w-full rounded-md border border-neutral-300 bg-white px-3 py-2 text-sm focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-primary disabled:bg-neutral-100";

export function Input({ className, ...props }: React.ComponentProps<"input">) {
  return <input className={cn(control, className)} {...props} />;
}

export function Select({ className, ...props }: React.ComponentProps<"select">) {
  return <select className={cn(control, className)} {...props} />;
}

/** Label + control + optional hint, wired together for screen readers. */
export function Field({
  label,
  htmlFor,
  hint,
  children,
}: {
  label: string;
  htmlFor: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <label htmlFor={htmlFor} className="block text-sm font-medium">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-neutral-500">{hint}</p> : null}
    </div>
  );
}

const BADGE = {
  neutral: "bg-neutral-100 text-neutral-700",
  green: "bg-green-50 text-green-800",
  amber: "bg-amber-50 text-amber-800", // amber and red are for expiry warnings only
  red: "bg-red-50 text-red-700",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGE; children: React.ReactNode }) {
  return <span className={cn("inline-block rounded px-1.5 py-0.5 text-xs font-medium", BADGE[tone])}>{children}</span>;
}

export function FormError({ message }: { message: string | null | undefined }) {
  if (!message) return null;
  return (
    <p role="alert" className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
      {message}
    </p>
  );
}
