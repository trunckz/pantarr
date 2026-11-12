import { Center, Loader } from "@mantine/core";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Navigate, Route, Routes } from "react-router-dom";
import { api, ApiError, Me, Status } from "./api";
import Shell from "./components/Shell";
import Onboarding from "./onboarding";
import Account from "./pages/Account";
import Demo from "./pages/Demo";
import Home from "./pages/Home";
import Login from "./pages/Login";
import Legal from "./pages/Legal";
import Pantry from "./pages/Pantry";
import Planning from "./pages/Planning";
import Recipes from "./pages/Recipes";
import RecipeView from "./pages/RecipeView";
import RecipeEdit from "./pages/RecipeEdit";
import Setup from "./pages/Setup";
import Shopping from "./pages/Shopping";
import Soon from "./pages/Soon";
import Settings from "./pages/settings/Settings";
import Admin from "./pages/admin/Admin";

export default function App() {
  const { i18n } = useTranslation();
  const status = useQuery({ queryKey: ["status"], queryFn: () => api<Status>("/auth/status") });
  const me = useQuery({
    queryKey: ["me"], enabled: !!status.data && !status.data.setupNeeded,
    queryFn: () => api<Me>("/auth/me").catch((e) => { if (e instanceof ApiError && e.status === 401) return null; throw e; }),
  });
  useEffect(() => { if (me.data?.locale && me.data.locale !== i18n.language) i18n.changeLanguage(me.data.locale); }, [me.data?.locale, i18n]);

  if (status.isLoading || (me.isLoading && me.fetchStatus !== "idle")) return <Center h="100vh"><Loader /></Center>;
  // Public pages, signed in or not (privacy policy and terms: required by Google, linked from the sign-in page)
  const legal = window.location.pathname === "/privacy" ? "privacy" : window.location.pathname === "/terms" ? "terms" : null;
  if (legal && status.data) return <Legal page={legal} status={status.data} />;
  if (status.data?.setupNeeded) return <Setup />;
  // the demo without an account, signed in or not
  if (window.location.pathname === "/demo" && status.data) return <Demo signup={!me.data && !!status.data.signup} />;
  if (!me.data) {
    // a visitor of a hosted instance first sees what Pantarr does ; the links of the mails (invitation, address check,
    // new password, sign-in with Google) and the « sign in » / « sign up » buttons open the sign-in page
    const q = new URLSearchParams(window.location.search);
    const flow = ["login", "signup", "code", "invite", "reset", "verified", "social"].some((k) => q.has(k));
    if (status.data?.mode === "hosted" && window.location.pathname === "/" && !flow) return <Home status={status.data} />;
    return <Login status={status.data!} />;
  }
  const admin = me.data.role === "ADMIN";
  return (
    <Shell me={me.data} announcement={status.data?.announcement}>
      <Onboarding me={me.data} />
      <Routes>
        <Route path="/" element={<Navigate to="/planning" replace />} />
        <Route path="/planning" element={<Planning />} />
        <Route path="/shopping" element={<Shopping />} />
        <Route path="/recipes" element={<Recipes />} />
        <Route path="/recipes/:slug" element={<RecipeView />} />
        <Route path="/recipes/:slug/edit" element={<RecipeEdit />} />
        <Route path="/pantry" element={<Pantry me={me.data} />} />
        <Route path="/account" element={<Account me={me.data} />} />
        {admin && <Route path="/admin/*" element={<Admin />} />}
        {(admin || me.data.owner) && <Route path="/settings/*" element={<Settings me={me.data} status={status.data!} />} />}
        <Route path="*" element={<Navigate to="/planning" replace />} />
      </Routes>
    </Shell>
  );
}
