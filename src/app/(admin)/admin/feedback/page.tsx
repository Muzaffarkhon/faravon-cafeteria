import { redirect } from "next/navigation";

export default function AdminFeedbackRedirect() {
  redirect("/admin/support");
}
