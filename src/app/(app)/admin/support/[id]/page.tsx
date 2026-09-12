import { notFound, redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { can } from "@/lib/rbac";
import { PageHeader } from "@/components/ui";
import { ThreadView } from "./_thread-view";

export const dynamic = "force-dynamic";

export default async function SupportThreadPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await getSession();
  if (!session) redirect("/login");
  if (!can(session.roles, "support.manage")) redirect("/");

  const { id } = await params;
  const thread = await db.supportThread.findUnique({
    where: { id },
    include: {
      messages: {
        orderBy: { createdAt: "asc" },
        include: { author: { select: { login: true, employee: { select: { fullName: true } } } } },
      },
    },
  });
  if (!thread) notFound();

  return (
    <div className="space-y-5">
      <PageHeader
        title={`Гость №${thread.seq}`}
        description={thread.phone ? `Присылал номер: ${thread.phone}` : "Номер телефона неизвестен."}
      />
      <ThreadView
        threadId={thread.id}
        status={thread.status}
        messages={thread.messages.map((m) => ({
          id: m.id,
          direction: m.direction,
          body: m.body,
          createdAt: m.createdAt.toISOString(),
          author: m.author?.employee?.fullName ?? m.author?.login ?? null,
        }))}
      />
    </div>
  );
}
