import { createContext, useCallback, useContext, useEffect, useState } from "react";

const ActionDialogContext = createContext(null);

const toneStyles = {
  danger: {
    icon: "!",
    iconClass: "bg-rose-100 text-rose-700",
    confirmClass: "bg-rose-600 text-white hover:bg-rose-700 focus:ring-rose-200",
  },
  success: {
    icon: "✓",
    iconClass: "bg-emerald-100 text-emerald-700",
    confirmClass: "bg-emerald-600 text-white hover:bg-emerald-700 focus:ring-emerald-200",
  },
  info: {
    icon: "i",
    iconClass: "bg-sky-100 text-sky-700",
    confirmClass: "bg-sky-600 text-white hover:bg-sky-700 focus:ring-sky-200",
  },
};

function ActionDialog({ dialog, onDismiss }) {
  const [value, setValue] = useState("");
  const tone = toneStyles[dialog?.tone] || toneStyles.info;
  const isInput = dialog?.kind === "input";
  const isConfirmation = dialog?.kind === "confirm";

  useEffect(() => {
    setValue(dialog?.initialValue ?? "");
  }, [dialog]);

  useEffect(() => {
    if (!dialog) return undefined;
    const handleKeyDown = (event) => {
      if (event.key === "Escape") onDismiss(dialog.kind === "notice" ? undefined : null);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [dialog, onDismiss]);

  if (!dialog) return null;

  const cancel = () => onDismiss(dialog.kind === "notice" ? undefined : null);
  const submit = (event) => {
    event?.preventDefault();
    onDismiss(isInput ? value : true);
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/45 p-4 backdrop-blur-sm"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) cancel();
      }}
    >
      <section
        aria-label={dialog.title}
        aria-modal="true"
        className="w-full max-w-md rounded-3xl border border-white/80 bg-white p-5 shadow-2xl shadow-slate-900/30 sm:p-6"
        role="dialog"
      >
        <div className="flex items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-2xl text-lg font-bold ${tone.iconClass}`}>
            {tone.icon}
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold text-slate-900">{dialog.title}</h2>
            {dialog.message ? <p className="mt-1.5 whitespace-pre-line text-sm leading-6 text-slate-600">{dialog.message}</p> : null}
          </div>
        </div>

        {isInput ? (
          <form className="mt-5" onSubmit={submit}>
            {dialog.fieldLabel ? <label className="mb-1.5 block text-xs font-semibold text-slate-600" htmlFor="action-dialog-input">{dialog.fieldLabel}</label> : null}
            <input
              autoFocus
              className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-sky-500 focus:ring-4 focus:ring-sky-100"
              id="action-dialog-input"
              min={dialog.min}
              placeholder={dialog.placeholder}
              step={dialog.step}
              type={dialog.inputType || "text"}
              value={value}
              onChange={(event) => setValue(event.target.value)}
            />
            <div className="mt-5 flex flex-wrap justify-end gap-2">
              <button className="rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100" type="button" onClick={cancel}>ยกเลิก</button>
              <button className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 ${tone.confirmClass}`} type="submit">{dialog.confirmLabel || "บันทึก"}</button>
            </div>
          </form>
        ) : (
          <div className="mt-5 flex flex-wrap justify-end gap-2">
            {isConfirmation ? <button className="rounded-xl border border-sky-200 bg-white px-4 py-2.5 text-sm font-semibold text-sky-700 transition hover:bg-sky-50 focus:outline-none focus:ring-4 focus:ring-sky-100" type="button" onClick={cancel}>{dialog.cancelLabel || "ยกเลิก"}</button> : null}
            <button className={`rounded-xl px-4 py-2.5 text-sm font-semibold transition focus:outline-none focus:ring-4 ${tone.confirmClass}`} type="button" onClick={submit}>{dialog.confirmLabel || "ตกลง"}</button>
          </div>
        )}
      </section>
    </div>
  );
}

export function ActionDialogProvider({ children }) {
  const [dialog, setDialog] = useState(null);

  const dismiss = useCallback((result) => {
    if (dialog?.kind === "confirm") dialog.resolve(result === true);
    if (dialog?.kind === "input") dialog.resolve(result === null ? null : result);
    setDialog(null);
  }, [dialog]);

  const confirmAction = useCallback((options) => new Promise((resolve) => {
    setDialog({
      kind: "confirm",
      tone: "info",
      title: "ยืนยันการทำรายการ",
      confirmLabel: "ยืนยัน",
      ...options,
      resolve,
    });
  }), []);

  const requestInput = useCallback((options) => new Promise((resolve) => {
    setDialog({
      kind: "input",
      tone: "info",
      title: "กรอกข้อมูล",
      confirmLabel: "บันทึก",
      ...options,
      resolve,
    });
  }), []);

  const showMessage = useCallback((options) => {
    const details = typeof options === "string" ? { message: options } : options;
    setDialog({
      kind: "notice",
      tone: "info",
      title: "แจ้งเตือน",
      confirmLabel: "รับทราบ",
      ...details,
    });
  }, []);

  return (
    <ActionDialogContext.Provider value={{ confirmAction, requestInput, showMessage }}>
      {children}
      <ActionDialog dialog={dialog} onDismiss={dismiss} />
    </ActionDialogContext.Provider>
  );
}

export function useActionDialog() {
  const context = useContext(ActionDialogContext);
  if (!context) throw new Error("useActionDialog must be used within ActionDialogProvider");
  return context;
}
