"use client";
import { useState, useEffect } from "react";
import { Button, Input, Table, Field } from "@/src/components/ui";

type Banner = {
  id: string;
  partnerId?: string | null;
  title: string;
  subtitle?: string | null;
  imageUrl?: string | null;
  href?: string | null;
  isActive: boolean;
  startsAt?: string | null;
  endsAt?: string | null;
};

export default function Page() {
  const [banners, setBanners] = useState<Banner[]>([]);
  const [form, setForm] = useState<Partial<Banner>>({ isActive: true });

  useEffect(() => {
    fetch("/api/partner-banner").then((r) => r.json()).then(setBanners);
  }, []);

  async function save(e: React.FormEvent) {
    e.preventDefault();
    const method = form.id ? "PUT" : "POST";
    const res = await fetch("/api/partner-banner", { method, body: JSON.stringify(form), headers: { "content-type": "application/json" } });
    const data = await res.json();
    setForm({ isActive: true });
    setBanners((s) => {
      if (method === "POST") return [data, ...s];
      return s.map((b) => (b.id === data.id ? data : b));
    });
  }

  async function edit(b: Banner) {
    setForm({ ...b });
  }

  async function remove(id: string) {
    await fetch("/api/partner-banner", { method: "DELETE", body: JSON.stringify({ id }), headers: { "content-type": "application/json" } });
    setBanners((s) => s.filter((b) => b.id !== id));
  }

  return (
    <div>
      <h1>Partner Banners</h1>
      <form onSubmit={save} style={{ marginBottom: 20 }}>
        <Field label="Title">
          <Input placeholder="title" value={form.title ?? ""} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} required />
        </Field>
        <Field label="Partner ID">
          <Input placeholder="partnerId" value={form.partnerId ?? ""} onChange={(e) => setForm((f) => ({ ...f, partnerId: e.target.value }))} />
        </Field>
        <Field label="Image URL">
          <Input placeholder="imageUrl" value={form.imageUrl ?? ""} onChange={(e) => setForm((f) => ({ ...f, imageUrl: e.target.value }))} />
        </Field>
        <Field label="Href">
          <Input placeholder="href" value={form.href ?? ""} onChange={(e) => setForm((f) => ({ ...f, href: e.target.value }))} />
        </Field>
        <Field label="Active">
          <input type="checkbox" checked={!!form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
        </Field>
        <Button type="submit">Save</Button>
      </form>

      <Table>
        <thead>
          <tr><th>Title</th><th>Partner</th><th>Active</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {banners.map((b) => (
            <tr key={b.id}>
              <td>{b.title}</td>
              <td>{b.partnerId}</td>
              <td>{b.isActive ? "Yes" : "No"}</td>
              <td>
                <Button onClick={() => edit(b)} style={{ marginRight: 6 }}>Edit</Button>
                <Button onClick={() => remove(b.id)}>Delete</Button>
              </td>
            </tr>
          ))}
        </tbody>
      </Table>
    </div>
  );
}
