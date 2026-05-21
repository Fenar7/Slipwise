import { redirect } from "next/navigation";

export default function NewCustomerRedirectPage() {
  redirect("/app/clients/new");
}
