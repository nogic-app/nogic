import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// shadcn/ui-style Button, re-skinned onto Nogic tokens.
const buttonVariants = cva(
  "inline-flex h-8 items-center justify-center gap-2 whitespace-nowrap rounded-md px-3 text-sec font-medium transition-colors disabled:opacity-40",
  {
    variants: {
      variant: {
        accent: "bg-accent text-white hover:opacity-90",
        outline: "border border-border-strong bg-elevated text-primary hover:bg-muted",
        ghost: "text-secondary hover:bg-muted hover:text-primary",
      },
    },
    defaultVariants: { variant: "outline" },
  },
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, type = "button", ...props }, ref) => (
    <button ref={ref} type={type} className={cn(buttonVariants({ variant }), className)} {...props} />
  ),
);
Button.displayName = "Button";
