import { redirect } from "next/navigation";

export default function PayPage() {
  // Redirect the root /pay route to the first active sub-module
  redirect("/app/pay/receivables");
}
