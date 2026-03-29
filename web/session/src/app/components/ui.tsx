import { cva, type VariantProps } from "class-variance-authority";
import { clsx, type ClassValue } from "clsx";
import type {
  ButtonHTMLAttributes,
  HTMLAttributes,
  InputHTMLAttributes,
  ReactNode,
  SelectHTMLAttributes,
} from "react";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-md border text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus focus-visible:ring-offset-2 focus-visible:ring-offset-panel",
  {
    variants: {
      variant: {
        primary: "border-accent bg-accent text-bg hover:bg-[#d79a40]",
        secondary: "border-line bg-panel-raised text-text hover:border-accent/50 hover:text-text",
        ghost:
          "border-transparent bg-transparent text-text-muted hover:bg-panel-raised hover:text-text",
        danger: "border-danger bg-danger text-text hover:bg-[#c0604d]",
      },
      size: {
        default: "h-10 px-4",
        sm: "h-8 px-3 text-xs uppercase tracking-[0.18em]",
      },
    },
    defaultVariants: {
      variant: "secondary",
      size: "default",
    },
  },
);

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export function Button({ className, size, variant, type = "button", ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ className, size, variant }))} type={type} {...props} />
  );
}

const pillVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-1 font-mono text-[0.72rem] uppercase tracking-[0.18em]",
  {
    variants: {
      tone: {
        neutral: "border-line bg-panel-raised text-text-muted",
        accent: "border-accent/60 bg-accent/12 text-accent",
        ok: "border-ok/60 bg-ok/12 text-[#bbd094]",
        warn: "border-warn/60 bg-warn/10 text-[#ebcd8a]",
        danger: "border-danger/70 bg-danger/12 text-[#e0a095]",
        info: "border-info/70 bg-info/10 text-[#b6d1df]",
      },
    },
    defaultVariants: {
      tone: "neutral",
    },
  },
);

interface PillProps extends HTMLAttributes<HTMLSpanElement>, VariantProps<typeof pillVariants> {}

export function Pill({ className, tone, ...props }: PillProps) {
  return <span className={cn(pillVariants({ className, tone }))} {...props} />;
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("panel-surface", className)} {...props} />;
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("border-b border-line px-5 py-4", className)} {...props} />;
}

export function CardBody({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("px-5 py-4", className)} {...props} />;
}

export function FieldLabel({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLLabelElement> & { children: ReactNode }) {
  return (
    <label
      className={cn(
        "mb-2 block font-mono text-[0.72rem] uppercase tracking-[0.2em] text-text-muted",
        className,
      )}
      {...props}
    >
      {children}
    </label>
  );
}

export function Input({ className, ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={cn(
        "h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-text placeholder:text-text-muted/70 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        className,
      )}
      {...props}
    />
  );
}

export function Select({ className, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-line bg-bg px-3 text-sm text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus",
        className,
      )}
      {...props}
    />
  );
}

export function SectionHeading({
  eyebrow,
  title,
  description,
}: {
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <div>
      <p className="section-label">{eyebrow}</p>
      <h2 className="mt-3 text-xl font-semibold text-text sm:text-2xl">{title}</h2>
      <p className="fine-print mt-2 max-w-2xl">{description}</p>
    </div>
  );
}
