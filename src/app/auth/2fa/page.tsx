import { Suspense } from "react";
import { TwoChallengeForm } from "./2fa-form";

export const metadata = { title: "Two-Factor Authentication" };

export default function TwoChallengePageWrapper() {
  return (
    <Suspense fallback={<div className="py-20" />}>
      <TwoChallengeForm />
    </Suspense>
  );
}
