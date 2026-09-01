"use client";
import { useEffect, useState } from "react";
import { Button, Table } from "@/src/components/ui";

type Req = {
  id: string;
  companyName: string;
  contactName: string;
  productName: string;
  budget?: string | null;
  status: string;
  submittedAt: string;
};

export default function Page() {
  const [items, setItems] = useState<Req[]>([]);

  useEffect(() => {
    fetch("/api/advertising/admin").then((r) => r.json()).then(setItems);
  }, []);

  async function updateStatus(id: string, status: string) {
    const form = new FormData();
    form.set("id", id);
    form.set("status", status);
    await fetch("/api/advertising/admin", { method: "POST", body: form });
    setItems((s) => s.map((it) => (it.id === id ? { ...it, status } : it)));
  }

  return (
    <div>
      <h1>Advertising Requests</h1>
      <Table>
        <thead>
          <tr><th>Company</th><th>Product</th><th>Budget</th><th>Status</th><th>Submitted</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {items.map((r) => (
            <tr key={r.id}>
              <td>{r.companyName} — {r.contactName}</td>
              <td>{r.productName}</td>
              <td>{r.budget ?? '-'}</td>
              <td>{r.status}</td>
              <td>{new Date(r.submittedAt).toISOString().slice(0,10)}</td>
              <td>
                <Button onClick={() => updateStatus(r.id, "APPROVED")} style={{ marginRight: 6 }}>Approve</Button>
                <Button onClick={() => updateStatus(r.id, "REJECTED")}>Reject</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
