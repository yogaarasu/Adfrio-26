import { createBrowserRouter, Navigate } from "react-router-dom";
import { AppShell } from "@/components/layout/app-shell";
import { HomePage } from "@/pages/home-page";
import { SearchPage } from "@/pages/search-page";
import { LibraryPage } from "@/pages/library-page";
import { ProfilePage } from "@/pages/profile-page";
import { NowPlayingPage } from "@/pages/now-playing-page";
import { SignInPage } from "@/pages/sign-in-page";
import { SignUpPage } from "@/pages/sign-up-page";
import { SignUpVerifyPage } from "@/pages/sign-up-verify-page";
import { ForgotPasswordPage } from "@/pages/forgot-password-page";
import { ForgotPasswordOtpPage } from "@/pages/forgot-password-otp-page";
import { ForgotPasswordResetPage } from "@/pages/forgot-password-reset-page";

export const router = createBrowserRouter([
  {
    path: "/",
    element: <AppShell />,
    children: [
      { index: true, element: <Navigate to="/home" replace /> },
      { path: "home", element: <HomePage /> },
      { path: "search", element: <SearchPage /> },
      { path: "library", element: <LibraryPage /> },
      { path: "library/:playlistId", element: <LibraryPage /> },
      { path: "profile", element: <ProfilePage /> },
      { path: "sign-in", element: <SignInPage /> },
      { path: "forgot-password", element: <ForgotPasswordPage /> },
      { path: "forgot-password/otp", element: <ForgotPasswordOtpPage /> },
      { path: "forgot-password/reset", element: <ForgotPasswordResetPage /> },
      { path: "sign-up", element: <SignUpPage /> },
      { path: "sign-up/verify", element: <SignUpVerifyPage /> },
      { path: "now-playing", element: <NowPlayingPage /> },
      { path: "music", element: <Navigate to="/home" replace /> },
      { path: "videos", element: <Navigate to="/home" replace /> },
      { path: "account", element: <Navigate to="/profile" replace /> },
      { path: "*", element: <Navigate to="/home" replace /> }
    ]
  }
]);
