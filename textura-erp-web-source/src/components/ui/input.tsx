import * as React from "react";

import { cn } from "@/lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  (
    {
      className,
      type,
      autoCapitalize: _autoCapitalize,
      autoComplete: _autoComplete,
      autoCorrect: _autoCorrect,
      spellCheck: _spellCheck,
      ...props
    },
    ref,
  ) => {
    return (
      <input
        type={type}
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          "flex h-10 w-full rounded-xl border border-input bg-background/65 px-3.5 py-2 text-base shadow-sm transition-all file:border-0 file:bg-transparent file:text-sm file:font-semibold file:text-foreground placeholder:text-muted-foreground/75 hover:border-primary/25 focus-visible:border-primary/40 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Input.displayName = "Input";

export { Input };
