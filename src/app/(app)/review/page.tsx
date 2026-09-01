import { redirect } from "next/navigation";
*** End Patch
          aria-label="Поиск по очереди согласования"
          className="w-auto min-w-56"
        />
        <Select name="period" defaultValue={periodId} className="w-auto py-2 text-sm" aria-label="Период">
          <option value="">Все периоды</option>
          {periods.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </Select>
        <Select name="sort" defaultValue={sort} className="w-auto py-2 text-sm" aria-label="Сортировка">
          <option value="old">Сначала старые</option>
          <option value="new">Сначала новые</option>
        </Select>
        <button className={buttonClass({ variant: "secondary", size: "sm" })}>Применить</button>
        {filtered && (
          <a href="/review" className={buttonClass({ variant: "ghost", size: "sm" })}>
            Сбросить
>>>>>>> 146b8b9 (feat: admin banners and advertising UI)
          </a>
        )}
      </form>

<<<<<<< HEAD
      {rows.length === 0 ? (
        <EmptyState>
          {totalPending === 0
            ? "Нет позиций, ожидающих решения."
            : "По заданным фильтрам ничего не найдено."}
        </EmptyState>
      ) : (
        <>
          <ReviewTable rows={rows} />

          {pages > 1 && (
            <div className="flex items-center justify-between text-sm">
              <span className="text-ink-muted">
                Стр. {page} из {pages}
              </span>
              <div className="flex gap-2">
                {page > 1 && (
                  <a
                    href={pageHref(page - 1)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    Назад
                  </a>
                )}
                {page < pages && (
                  <a
                    href={pageHref(page + 1)}
                    className={buttonClass({ variant: "secondary", size: "sm" })}
                  >
                    Вперёд
                  </a>
                )}
              </div>
            </div>
          )}
        </>
=======
      {groups.length === 0 ? (
        <EmptyState
          action={
            filtered ? (
              <a href="/review" className={buttonClass({ variant: "secondary", size: "sm" })}>
                Сбросить фильтры
              </a>
            ) : undefined
          }
        >
          {filtered
            ? "По заданным фильтрам позиций на согласовании нет."
            : "Нет позиций, ожидающих решения."}
        </EmptyState>
      ) : (
        groups.map((g) => (
          <Card key={g.key}>
            <CardHeader>
              <div className="flex items-center gap-2 text-sm font-medium text-ink">
                {g.employee}
                <span className="rounded-full bg-surface-muted px-2 py-0.5 text-xs font-normal text-ink-muted tabular-nums">
                  {g.items.length}
                </span>
              </div>
              <div className="text-xs text-ink-subtle">
                {g.department} · период: {g.period}
              </div>
            </CardHeader>
            <ul className="divide-y divide-line-subtle">
              {g.items.map((item) => (
                <ReviewRow
                  key={item.itemId}
                  itemId={item.itemId}
                  card={item.card}
                  partner={item.partner}
                  condition={item.condition}
                  submittedLabel={item.submittedLabel}
                  waiting={item.waiting}
                  overdue={item.overdue}
                />
              ))}
            </ul>
          </Card>
        ))
>>>>>>> 146b8b9 (feat: admin banners and advertising UI)
      )}
    </div>
  );
}
