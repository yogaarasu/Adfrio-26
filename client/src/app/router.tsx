import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { MediaPage } from "@/pages/media-page";
import { LibraryPage } from "@/pages/library-page";
import { AccountPage } from "@/pages/account-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/music" replace /> },
      { path: "music", element: <MediaPage type="music" /> },
      { path: "videos", element: <MediaPage type="video" /> },
      { path: "library", element: <LibraryPage /> },
      { path: "account", element: <AccountPage /> }
    ]
  }
]);
