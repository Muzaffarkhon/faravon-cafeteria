import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import { buildNavGroups } from "@/app/(app)/_nav";

export const dynamic = "force-dynamic";

/** /admin сам по себе не рендерит ничего — уводит на первый доступный раздел левого меню. */
export default async function AdminIndexPage() {
  const session = await getSession();
  if (!session) redirect("/login");

  const groups = buildNavGroups({
    roles: session.roles,
    hasEmployee: false,
    partnerId: session.user.partnerId,
    isTaxiContractor: false,
  }).filter((g) => g.id === "work" || g.id === "catalog" || g.id === "admin");

  const first = groups[0]?.items[0];
  redirect(first?.href ?? "/");
}
