import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useLocation,
  useNavigate,
} from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { SidebarProvider } from "@/components/ui/sidebar";
import { AppSidebar } from "@/components/app-sidebar";
import { TopNavbar } from "@/components/top-navbar";
import { Toaster } from "@/components/ui/sonner";
import { DesktopUpdatePrompt } from "@/components/desktop-update-prompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider, useAuth } from "@/hooks/use-auth";
import { Loader2 } from "lucide-react";

import appCss from "../styles.css?url";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold">404</h1>
        <p className="mt-2 text-sm text-muted-foreground">Page not found.</p>
        <Link
          to="/"
          className="mt-6 inline-block rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Back to dashboard
        </Link>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  const router = useRouter();
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">Something went wrong</h1>
        <p className="mt-2 text-sm text-muted-foreground">{error.message}</p>
        <button
          onClick={() => {
            router.invalidate();
            reset();
          }}
          className="mt-6 rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Try again
        </button>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Textura ERP - Invoice Approval Suite" },
      {
        name: "description",
        content: "Enterprise textile invoice approval and document tracking system.",
      },
      { property: "og:title", content: "Textura ERP - Invoice Approval Suite" },
      { name: "twitter:title", content: "Textura ERP - Invoice Approval Suite" },
      {
        property: "og:description",
        content: "Enterprise textile invoice approval and document tracking system.",
      },
      {
        name: "twitter:description",
        content: "Enterprise textile invoice approval and document tracking system.",
      },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2a13ae6e-7647-46dd-97eb-eb9026258b57/id-preview-dccea36e--8fc2b83d-853c-4dc6-9b24-acf48bb60a04.lovable.app-1779100801823.png",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/2a13ae6e-7647-46dd-97eb-eb9026258b57/id-preview-dccea36e--8fc2b83d-853c-4dc6-9b24-acf48bb60a04.lovable.app-1779100801823.png",
      },
      { name: "twitter:card", content: "summary_large_image" },
      { property: "og:type", content: "website" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@500;600&family=Outfit:wght@400;500;600;700;800&display=swap",
      },
    ],
  }),
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider delayDuration={150}>
        <AuthProvider>
          <AuthGate />
          <DesktopUpdatePrompt />
          <Toaster position="top-right" richColors />
        </AuthProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function AuthGate() {
  const { session, loading } = useAuth();
  const location = useLocation();
  const navigate = useNavigate();
  const [mounted, setMounted] = useState(false);
  const isAuthRoute = location.pathname === "/auth";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && !loading && !session && !isAuthRoute) {
      navigate({ to: "/auth" });
    }
  }, [mounted, loading, session, isAuthRoute, navigate]);

  if (!mounted || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isAuthRoute || !session) {
    return <Outlet />;
  }

  return (
    <SidebarProvider>
      <div className="flex min-h-screen w-full max-w-full overflow-x-clip bg-background/80">
        <AppSidebar />
        <div className="flex min-w-0 max-w-full flex-1 flex-col overflow-x-clip">
          <TopNavbar />
          <main className="mx-auto flex w-full min-w-0 max-w-[1500px] flex-1 overflow-x-clip p-4 md:p-6 lg:p-8">
            <Outlet />
          </main>
        </div>
      </div>
    </SidebarProvider>
  );
}
