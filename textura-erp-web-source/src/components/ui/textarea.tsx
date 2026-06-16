import * as React from "react";

import { cn } from "@/lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  (
    {
      className,
      autoCapitalize: _autoCapitalize,
      autoComplete: _autoComplete,
      autoCorrect: _autoCorrect,
      spellCheck: _spellCheck,
      ...props
    },
    ref,
  ) => {
    return (
      <textarea
        autoCapitalize="none"
        autoComplete="off"
        autoCorrect="off"
        spellCheck={false}
        className={cn(
          "flex min-h-[84px] w-full rounded-xl border border-input bg-background/65 px-3.5 py-3 text-base leading-6 shadow-sm placeholder:text-muted-foreground/75 hover:border-primary/25 focus-visible:border-primary/40 focus-visible:bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/35 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm",
          className,
        )}
        ref={ref}
        {...props}
      />
    );
  },
);
Textarea.displayName = "Textarea";

export { Textarea };
