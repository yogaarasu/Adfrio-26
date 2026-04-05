import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/pages/home-page";
import { SearchPage } from "@/pages/search-page";
import { LibraryPage } from "@/pages/library-page";
import { ProfilePage } from "@/pages/profile-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: "home", element: <HomePage /> },
      { path: "search", element: <SearchPage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "music", element: <Navigate to="/home" replace /> },
      { path: "videos", element: <Navigate to="/home" replace /> },
      { path: "account", element: <Navigate to="/profile" replace /> },
      { path: "*", element: <Navigate to="/home" replace /> }
    ]
  }
]);
