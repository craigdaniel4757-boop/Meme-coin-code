import { lazy, Suspense, useEffect } from "react";
import { Route, Routes, useLocation } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Footer } from "@/components/layout/footer";
import { NavBar } from "@/components/layout/nav-bar";
import { TooltipProvider } from "@/components/ui/tooltip";

// Lazy-loaded per route: Recharts + Radix pull the Report page's chunk well
// past the point of bundling it eagerly with everything else.
const LandingPage = lazy(() => import("@/pages/LandingPage"));
const UploadPage = lazy(() => import("@/pages/UploadPage"));
const ProcessingPage = lazy(() => import("@/pages/ProcessingPage"));
const ReportPage = lazy(() => import("@/pages/ReportPage"));
const NotFoundPage = lazy(() => import("@/pages/NotFoundPage"));

function RouteFallback() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );
}

/** Scrolls to an in-page anchor on hash navigation, otherwise resets to top on route change. */
function ScrollManager() {
  const location = useLocation();

  useEffect(() => {
    if (location.hash) {
      const el = document.getElementById(location.hash.slice(1));
      if (el) {
        requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
        return;
      }
    }
    window.scrollTo({ top: 0 });
  }, [location]);

  return null;
}

export default function App() {
  return (
    <TooltipProvider delayDuration={150}>
      <div className="flex min-h-screen flex-col">
        <ScrollManager />
        <NavBar />
        <main className="flex-1">
          <Suspense fallback={<RouteFallback />}>
            <Routes>
              <Route path="/" element={<LandingPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/processing/:jobId" element={<ProcessingPage />} />
              <Route path="/report/sample" element={<ReportPage sample />} />
              <Route path="/report/:jobId" element={<ReportPage />} />
              <Route path="*" element={<NotFoundPage />} />
            </Routes>
          </Suspense>
        </main>
        <Footer />
      </div>
    </TooltipProvider>
  );
}
