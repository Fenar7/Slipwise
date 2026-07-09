import { redirect } from "next/navigation";

export const metadata = {
  title: "Customers | Slipwise",
};

export default function CustomersPage() {
  redirect("/app/clients");
}
