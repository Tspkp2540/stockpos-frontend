import { useMemo, useState } from "react";

const moneyDelta = (value) => {
  const amount = Number(value || 0);
  if (!amount) return "ไม่เพิ่มราคา";
  return `${amount > 0 ? "+" : "-"}฿${Math.abs(amount).toLocaleString("en-US", {
    minimumFractionDigits: 2,
  })}`;
};

const initialSelection = (groups, initialModifiers = []) => {
  const initiallySelected = new Set(
    initialModifiers
      .map((modifier) => Number(modifier.id ?? modifier.option_id))
      .filter((id) => Number.isFinite(id)),
  );
  return Object.fromEntries(
    groups.map((group) => {
      const options = (group.options || []).filter((option) => option.is_active !== false);
      const restored = options
        .filter((option) => initiallySelected.has(Number(option.id)))
        .map((option) => Number(option.id));
      return [
        group.id,
        restored.length
          ? restored
          : options
              .slice(0, Number(group.min_selection || 0))
              .map((option) => Number(option.id)),
      ];
    }),
  );
};

export default function MenuModifierPicker({
  product,
  initialModifiers = [],
  actionLabel = "เพิ่มลงตะกร้า",
  onClose,
  onConfirm,
}) {
  const groups = product?.modifier_groups || [];
  const [selectedByGroup, setSelectedByGroup] = useState(() => initialSelection(groups, initialModifiers));
  const selectedOptions = useMemo(
    () =>
      groups.flatMap((group) =>
        (group.options || [])
          .filter((option) => (selectedByGroup[group.id] || []).includes(Number(option.id)))
          .map((option) => ({ ...option, group_name: group.name })),
      ),
    [groups, selectedByGroup],
  );
  const priceAdjustment = selectedOptions.reduce(
    (sum, option) => sum + Number(option.price_adjustment || 0),
    0,
  );
  const isComplete = groups.every((group) => {
    const count = (selectedByGroup[group.id] || []).length;
    return count >= Number(group.min_selection || 0) && count <= Number(group.max_selection || 1);
  });
  const toggleOption = (group, optionId) => {
    const id = Number(optionId);
    setSelectedByGroup((current) => {
      const selected = current[group.id] || [];
      const hasOption = selected.includes(id);
      const max = Number(group.max_selection || 1);
      const next = hasOption
        ? selected.filter((selectedId) => selectedId !== id)
        : max === 1
          ? [id]
          : selected.length < max
            ? [...selected, id]
            : selected;
      return { ...current, [group.id]: next };
    });
  };

  if (!product) return null;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end bg-slate-950/35 p-0 backdrop-blur-sm sm:place-items-center sm:p-5">
      <section className="max-h-[88vh] w-full overflow-y-auto rounded-t-3xl border border-white/70 bg-white p-5 shadow-2xl sm:max-w-xl sm:rounded-3xl sm:p-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-bold uppercase tracking-[0.14em] text-violet-600">ปรับแก้วนี้</p>
            <h2 className="mt-1 text-xl font-bold text-slate-900">{product.name}</h2>
            <p className="mt-1 text-sm text-slate-500">เลือกรายละเอียดก่อนเพิ่มลงตะกร้า</p>
          </div>
          <button className="rounded-xl px-3 py-2 text-sm font-bold text-slate-500 hover:bg-slate-100" onClick={onClose}>
            ปิด
          </button>
        </div>

        <div className="mt-5 space-y-5">
          {groups.map((group) => {
            const selected = selectedByGroup[group.id] || [];
            const min = Number(group.min_selection || 0);
            const max = Number(group.max_selection || 1);
            return (
              <fieldset key={group.id}>
                <legend className="flex w-full items-center justify-between gap-3 text-sm font-bold text-slate-800">
                  <span>{group.name}</span>
                  <span className={`text-xs ${min > 0 ? "text-rose-600" : "text-slate-400"}`}>
                    {min > 0 ? `ต้องเลือก ${min}` : "ไม่บังคับ"}{max > 1 ? ` · ได้สูงสุด ${max}` : ""}
                  </span>
                </legend>
                <div className="mt-2 grid gap-2 sm:grid-cols-2">
                  {(group.options || []).filter((option) => option.is_active !== false).map((option) => {
                    const optionId = Number(option.id);
                    const checked = selected.includes(optionId);
                    const blocked = !checked && selected.length >= max;
                    return (
                      <label
                        className={`flex cursor-pointer items-center justify-between gap-3 rounded-xl border px-3 py-3 transition ${checked ? "border-violet-500 bg-violet-50" : "border-slate-200 bg-white hover:border-violet-300"} ${blocked ? "cursor-not-allowed opacity-45" : ""}`}
                        key={option.id}
                      >
                        <span className="min-w-0 flex-1 text-sm font-semibold text-slate-700">{option.name}</span>
                        <span className="shrink-0 text-xs font-bold text-violet-700">{moneyDelta(option.price_adjustment)}</span>
                        <input
                          className="h-4 w-4 accent-violet-600"
                          type="checkbox"
                          name={`modifier-${group.id}`}
                          checked={checked}
                          disabled={blocked}
                          onChange={() => toggleOption(group, optionId)}
                        />
                      </label>
                    );
                  })}
                </div>
              </fieldset>
            );
          })}
        </div>

        <div className="mt-6 flex items-center justify-between gap-4 border-t border-slate-100 pt-4">
          <div>
            <p className="text-xs font-semibold text-slate-500">ราคาเพิ่มจากตัวเลือก</p>
            <p className="mt-1 font-bold text-violet-700">{moneyDelta(priceAdjustment)}</p>
          </div>
          <button
            className="rounded-xl bg-violet-600 px-4 py-3 text-sm font-bold text-white shadow-sm shadow-violet-200 transition hover:bg-violet-700 disabled:cursor-not-allowed disabled:opacity-50"
            disabled={!isComplete}
            onClick={() => onConfirm(product, selectedOptions)}
          >
            {actionLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
