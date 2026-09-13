import { redirect } from "next/navigation";

// «Обратная связь» объединена с чатом поддержки в один инбокс — старые
// ссылки/закладки на этот раздел просто ведут туда.
export default function AdminFeedbackRedirect() {
  redirect("/admin/support");
}
