import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Moon, Search, Sun, ChevronDown } from "lucide-react";
import { useNavigate } from "@tanstack/react-router";
import { listInvoices } from "@/api/invoices";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { useAuth } from "@/hooks/use-auth";
import { getStoredString, setStoredString } from "@/lib/desktop-store";
import type { FixedProfile } from "@/types/api";

const THEME_KEY = "theme";
const LEGACY_THEME_KEY = "textura-theme";

const profileLabels: Record<FixedProfile, string> = {
  yes_fashion: "Yes Fashion",
  test_user: "Test User",
};

export function TopNavbar() {
  const [dark, setDark] = useState(false);
  const [themeReady, setThemeReady] = useState(false);
  const [searchValue, setSearchValue] = useState("");
  const { user, profile, switchProfile } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const email = user?.email ?? "";
  const fullName = profileLabels[profile] ?? user?.fullName ?? "User";
  const initials =
    fullName
      .split(" ")
      .map((p) => p[0])
      .filter(Boolean)
      .slice(0, 2)
      .join("")
      .toUpperCase() || "U";
  const trimmedSearch = searchValue.trim();

  const { data: searchResults, isFetching } = useQuery({
    queryKey: ["navbar-search", trimmedSearch],
    queryFn: () => listInvoices({ q: trimmedSearch, limit: 6 }),
    enabled: trimmedSearch.length >= 2,
  });
  const results = searchResults?.invoices ?? [];

  useEffect(() => {
    let active = true;
    const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;

    getStoredString(THEME_KEY, LEGACY_THEME_KEY).then((stored) => {
      if (!active) return;
      setDark(stored ? stored === "dark" : prefersDark);
      setThemeReady(true);
    });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!themeReady) return;
    document.documentElement.classList.toggle("dark", dark);
    void setStoredString(THEME_KEY, dark ? "dark" : "light", LEGACY_THEME_KEY);
  }, [dark, themeReady]);

  const submitSearch = () => {
    if (!trimmedSearch) return;
    setSearchValue("");
    navigate({ to: "/search", search: { q: trimmedSearch } });
  };

  async function selectProfile(nextProfile: FixedProfile) {
    if (nextProfile === profile) return;
    await switchProfile(nextProfile);
    await queryClient.invalidateQueries({ queryKey: ["invoices"] });
    await queryClient.invalidateQueries({ queryKey: ["invoice"] });
    setSearchValue("");
    navigate({ to: "/" });
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 min-w-0 max-w-full items-center gap-3 border-b border-border/70 bg-card/72 px-4 shadow-soft backdrop-blur-xl">
      <SidebarTrigger className="-ml-1" />
      <div className="relative ml-2 hidden flex-1 max-w-md md:block">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={searchValue}
          onChange={(event) => setSearchValue(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") submitSearch();
            if (event.key === "Escape") setSearchValue("");
          }}
          placeholder="Search invoices, customers, count, status..."
          className="h-10 rounded-xl border-transparent bg-muted/45 pl-9 shadow-inner focus-visible:bg-card"
        />
        <kbd className="pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 select-none rounded border bg-background px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground sm:inline-block">
          Enter
        </kbd>
        {trimmedSearch.length >= 2 && (
          <div className="absolute left-0 right-0 top-[calc(100%+8px)] z-50 overflow-hidden rounded-lg border bg-popover shadow-elevated">
            <div className="border-b px-3 py-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground">
              {isFetching ? "Searching..." : `${results.length} matches`}
            </div>
            {results.length === 0 && !isFetching ? (
              <div className="px-3 py-4 text-sm text-muted-foreground">No matching invoices.</div>
            ) : (
              results.map((invoice) => (
                <button
                  key={invoice.id}
                  type="button"
                  onClick={() => {
                    setSearchValue("");
                    navigate({ to: "/invoices/$invoiceId", params: { invoiceId: invoice.id } });
                  }}
                  className="flex w-full items-center justify-between gap-3 px-3 py-2.5 text-left text-sm hover:bg-accent"
                >
                  <div className="min-w-0">
                    <div className="truncate font-medium">{invoice.customer_name}</div>
                    <div className="truncate text-xs text-muted-foreground">
                      {invoice.invoice_number} - Count {invoice.count_construction ?? "-"}
                    </div>
                  </div>
                  <Badge variant="outline" className="shrink-0 text-[10px] capitalize">
                    {invoice.final_status}
                  </Badge>
                </button>
              ))
            )}
            <button
              type="button"
              onClick={submitSearch}
              className="w-full border-t px-3 py-2 text-left text-xs font-medium text-primary hover:bg-accent"
            >
              Open full search for "{trimmedSearch}"
            </button>
          </div>
        )}
      </div>
      <div className="ml-auto flex items-center gap-1.5">
        <Button
          variant="ghost"
          size="icon"
          onClick={() => setDark((d) => !d)}
          aria-label="Toggle theme"
        >
          {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" className="gap-2 px-2">
              <Avatar className="h-7 w-7">
                <AvatarFallback className="bg-primary text-primary-foreground text-xs">
                  {initials}
                </AvatarFallback>
              </Avatar>
              <div className="hidden text-left leading-tight md:block">
                <div className="text-xs font-semibold">{fullName}</div>
                <div className="text-[10px] text-muted-foreground">{email}</div>
              </div>
              <ChevronDown className="h-3.5 w-3.5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel>Active profile</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {(["yes_fashion", "test_user"] as FixedProfile[]).map((item) => (
              <DropdownMenuItem
                key={item}
                onClick={() => void selectProfile(item)}
                className={item === profile ? "bg-accent font-semibold" : undefined}
              >
                {profileLabels[item]}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
