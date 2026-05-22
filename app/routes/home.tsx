import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Form, isRouteErrorResponse, useActionData, useLoaderData, useNavigation, useRouteError } from "react-router";
import type { Route } from "./+types/home";
import {
  getItems,
  addItem,
  togglePurchased,
  deleteItem,
  setupSheet,
} from "../lib/sheets.server";
import { CATEGORIES } from "../lib/constants";

export function ErrorBoundary() {
  const error = useRouteError();
  const message = isRouteErrorResponse(error)
    ? error.data
    : (error as Error)?.message ?? "未知錯誤";
  return (
    <div style={{ padding: "2rem", fontFamily: "sans-serif" }}>
      <h1 style={{ color: "#c00" }}>⚠️ 發生錯誤</h1>
      <pre style={{ background: "#f5f5f5", padding: "1rem", borderRadius: "8px", whiteSpace: "pre-wrap" }}>
        {message}
      </pre>
    </div>
  );
}

export function meta() {
  return [
    { title: "日本代購清單 🇯🇵" },
    { name: "description", content: "日本行家庭代購清單" },
  ];
}

export async function loader() {
  try {
    await setupSheet();
    const items = await getItems();
    const pinRequired = !!process.env.ADD_PIN;
    return { items, pinRequired };
  } catch (err) {
    throw new Response((err as Error).message ?? "載入失敗", { status: 500 });
  }
}

export async function action({ request }: Route.ActionArgs) {
  const formData = await request.formData();
  const intent = formData.get("intent") as string;

  if (intent === "add") {
    const pin = process.env.ADD_PIN;
    if (pin && formData.get("pin") !== pin) {
      return { error: "密碼錯誤" };
    }
    await addItem({
      name: (formData.get("name") as string).trim(),
      category: ((formData.get("category") as string) ?? "").trim(),
      nameJp: ((formData.get("nameJp") as string) ?? "").trim(),
      image: ((formData.get("image") as string) ?? "").trim(),
      priceTw: ((formData.get("priceTw") as string) ?? "").trim(),
      priceJp: ((formData.get("priceJp") as string) ?? "").trim(),
      quantity: (formData.get("quantity") as string) || "1",
      requester: ((formData.get("requester") as string) ?? "").trim(),
      notes: ((formData.get("notes") as string) ?? "").trim(),
      link: ((formData.get("link") as string) ?? "").trim(),
    });
  } else if (intent === "toggle") {
    await togglePurchased(
      formData.get("id") as string,
      formData.get("purchased") === "true"
    );
  } else if (intent === "delete") {
    await deleteItem(formData.get("id") as string);
  }

  return null;
}

const C = {
  primary: "#1E3A5F",
  primaryDark: "#152B47",
  bg: "#F0F4F8",
  text: "#1A2A3A",
  textMuted: "#4A6580",
  textLight: "#90A8BF",
  border: "#C8D8E8",
  cardBorder: "#BCCFDF",
  inputBorder: "#C8D8E8",
};

// Category order and emoji
const CATEGORY_META: Record<string, { emoji: string; order: number }> = {
  "藥妝": { emoji: "💊", order: 0 },
  "衣服": { emoji: "👗", order: 1 },
  "食品": { emoji: "🍱", order: 2 },
  "其他": { emoji: "📦", order: 3 },
};

function getCategoryMeta(cat: string) {
  return CATEGORY_META[cat] ?? { emoji: "📦", order: 99 };
}

function groupAndSort(items: ReturnType<typeof useLoaderData<typeof loader>>["items"]) {
  // Sort by category order, then by requester within each category
  const sorted = [...items].sort((a, b) => {
    const catDiff = getCategoryMeta(a.category).order - getCategoryMeta(b.category).order;
    if (catDiff !== 0) return catDiff;
    return (a.requester || "zzz").localeCompare(b.requester || "zzz", "zh-TW");
  });

  // Group by category
  const groups = new Map<string, typeof sorted>();
  for (const item of sorted) {
    const cat = item.category || "其他";
    if (!groups.has(cat)) groups.set(cat, []);
    groups.get(cat)!.push(item);
  }
  return groups;
}

function Field({ id, label, required, children }: {
  id?: string; label: string; required?: boolean; children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={id} className="text-sm font-bold block mb-1.5" style={{ color: C.textMuted }}>
        {label}{required && <span className="ml-1" style={{ color: C.primary }}>*</span>}
      </label>
      {children}
    </div>
  );
}

const inputStyle = {
  border: `1.5px solid ${C.inputBorder}`,
  color: C.text,
};

const inputClass = "w-full rounded-xl px-4 py-3 text-base focus:outline-none transition-colors bg-white";

function TextInput(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={inputClass}
      style={inputStyle}
      onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
      onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBorder; }}
    />
  );
}

export default function Home() {
  const { items, pinRequired } = useLoaderData<typeof loader>();
  const actionData = useActionData<typeof action>();
  const navigation = useNavigation();
  const isSubmitting = navigation.state === "submitting";

  const [myName, setMyName] = useState("");
  const [showForm, setShowForm] = useState(false);
  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    const saved = localStorage.getItem("jp-purchase-name");
    if (saved) setMyName(saved);
  }, []);

  const prevSubmitting = useRef(false);
  useEffect(() => {
    if (prevSubmitting.current && !isSubmitting) {
      setShowForm(false);
      formRef.current?.reset();
    }
    prevSubmitting.current = isSubmitting;
  }, [isSubmitting]);

  const pending = items.filter((i) => !i.purchased);
  const bought = items.filter((i) => i.purchased);
  const pendingGroups = groupAndSort(pending);
  const boughtGroups = groupAndSort(bought);

  return (
    <div className="min-h-screen" style={{ background: C.bg }}>
      {/* Header */}
      <header className="bg-white sticky top-0 z-20" style={{ borderBottom: `1.5px solid ${C.border}` }}>
        <div className="max-w-xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold leading-tight" style={{ color: C.primary }}>
              🇯🇵 日本代購清單
            </h1>
            <p className="text-base mt-0.5" style={{ color: C.textMuted }}>
              {pending.length} 件待購・{bought.length} 件已買
            </p>
          </div>
          <button
            onClick={() => setShowForm((v) => !v)}
            className="shrink-0 font-bold px-5 py-3 rounded-2xl text-base text-white"
            style={{ background: showForm ? C.primaryDark : C.primary }}
          >
            {showForm ? "關閉" : "+ 新增"}
          </button>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 py-5 space-y-4">
        {/* 許願人 */}
        <div className="bg-white rounded-2xl px-4 py-4 flex items-center gap-3" style={{ border: `1.5px solid ${C.border}` }}>
          <span className="text-2xl">👤</span>
          <div className="flex-1 min-w-0">
            <label htmlFor="my-name" className="text-xs font-bold uppercase tracking-wide block mb-1" style={{ color: C.textLight }}>
              許願人（選填）
            </label>
            <input
              id="my-name"
              value={myName}
              onChange={(e) => {
                setMyName(e.target.value);
                localStorage.setItem("jp-purchase-name", e.target.value);
              }}
              placeholder="填了之後新增時會自動帶入"
              className="w-full text-base focus:outline-none bg-transparent placeholder:text-gray-300"
              style={{ color: C.text }}
            />
          </div>
          {myName && (
            <button
              type="button"
              onClick={() => { setMyName(""); localStorage.removeItem("jp-purchase-name"); }}
              className="w-8 h-8 flex items-center justify-center rounded-full text-xl"
              style={{ color: C.textLight }}
            >×</button>
          )}
        </div>

        {/* Add form */}
        {showForm && (
          <div className="bg-white rounded-2xl p-5" style={{ border: `1.5px solid ${C.border}` }}>
            <h2 className="text-lg font-bold mb-5" style={{ color: C.text }}>新增代購商品</h2>
            <Form method="post" ref={formRef}>
              <input type="hidden" name="intent" value="add" />
              <input type="hidden" name="requester" value={myName} />

              <div className="space-y-4">
                <Field id="f-name" label="品項（中文）" required>
                  <TextInput id="f-name" name="name" required placeholder="例：資生堂防曬乳 SPF50+" />
                </Field>

                <Field id="f-category" label="類型">
                  <select
                    id="f-category"
                    name="category"
                    className={inputClass}
                    style={inputStyle}
                    onFocus={(e) => { e.currentTarget.style.borderColor = C.primary; }}
                    onBlur={(e) => { e.currentTarget.style.borderColor = C.inputBorder; }}
                    defaultValue=""
                  >
                    <option value="">請選擇類型</option>
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>
                        {getCategoryMeta(c).emoji} {c}
                      </option>
                    ))}
                  </select>
                </Field>

                <Field id="f-nameJp" label="日文名稱">
                  <TextInput id="f-nameJp" name="nameJp" placeholder="例：日焼け止め" />
                </Field>

                <div className="grid grid-cols-3 gap-3">
                  <Field id="f-qty" label="數量">
                    <TextInput id="f-qty" name="quantity" type="number" min="1" defaultValue="1" />
                  </Field>
                  <Field id="f-priceTw" label="台灣價格">
                    <TextInput id="f-priceTw" name="priceTw" placeholder="NT$" />
                  </Field>
                  <Field id="f-priceJp" label="日本價格">
                    <TextInput id="f-priceJp" name="priceJp" placeholder="¥" />
                  </Field>
                </div>

                <Field id="f-image" label="圖片連結">
                  <TextInput id="f-image" name="image" type="url" placeholder="https://..." />
                </Field>

                <Field id="f-link" label="參考連結">
                  <TextInput id="f-link" name="link" type="url" placeholder="https://..." />
                </Field>

                <Field id="f-notes" label="備註">
                  <TextInput id="f-notes" name="notes" placeholder="顏色、規格、特別要求…" />
                </Field>
              </div>

              {pinRequired && (
                <div className="mt-4">
                  <Field id="f-pin" label="加入密碼" required>
                    <TextInput id="f-pin" name="pin" type="password" placeholder="請輸入密碼" autoComplete="off" />
                  </Field>
                  {actionData && "error" in actionData && (
                    <p className="text-sm font-semibold mt-2" style={{ color: "#EF4444" }}>
                      {actionData.error}
                    </p>
                  )}
                </div>
              )}

              <div className="flex gap-3 mt-6">
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="flex-1 font-bold py-3.5 rounded-2xl text-base text-white disabled:opacity-50"
                  style={{ background: C.primary }}
                >
                  {isSubmitting ? "新增中…" : "確認新增"}
                </button>
                <button
                  type="button"
                  onClick={() => setShowForm(false)}
                  className="px-5 py-3.5 rounded-2xl text-base font-medium"
                  style={{ background: "#E4EAF0", color: C.textMuted }}
                >
                  取消
                </button>
              </div>
            </Form>
          </div>
        )}

        {/* Pending — grouped by category */}
        {pending.length > 0 && (
          <section className="space-y-5">
            <h2 className="text-sm font-bold uppercase tracking-widest px-1" style={{ color: C.textLight }}>
              未購買 ({pending.length})
            </h2>
            {Array.from(pendingGroups.entries()).map(([cat, catItems]) => (
              <div key={cat}>
                <div className="flex items-center gap-2 mb-2 px-1">
                  <span className="text-base">{getCategoryMeta(cat).emoji}</span>
                  <span className="text-base font-bold" style={{ color: C.primary }}>{cat}</span>
                  <span className="text-sm" style={{ color: C.textLight }}>({catItems.length})</span>
                </div>
                <div className="space-y-2">
                  {catItems.map((item) => (
                    <ItemCard key={item.id} item={item} showToggle={false} />
                  ))}
                </div>
              </div>
            ))}
          </section>
        )}

        {/* Bought — grouped by category */}
        {bought.length > 0 && (
          <section className="space-y-5 mt-2">
            <h2 className="text-sm font-bold uppercase tracking-widest px-1" style={{ color: C.textLight }}>
              已購買 ({bought.length})
            </h2>
            <div className="opacity-50 space-y-5">
              {Array.from(boughtGroups.entries()).map(([cat, catItems]) => (
                <div key={cat}>
                  <div className="flex items-center gap-2 mb-2 px-1">
                    <span className="text-base">{getCategoryMeta(cat).emoji}</span>
                    <span className="text-sm font-bold" style={{ color: C.primary }}>{cat}</span>
                    <span className="text-xs" style={{ color: C.textLight }}>({catItems.length})</span>
                  </div>
                  <div className="space-y-2">
                    {catItems.map((item) => (
                      <ItemCard key={item.id} item={item} showToggle={true} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {items.length === 0 && !showForm && (
          <div className="text-center py-20" style={{ color: C.textLight }}>
            <div className="text-6xl mb-4">🛍️</div>
            <p className="text-base font-medium">清單還是空的</p>
            <p className="text-sm mt-1">點「+ 新增」加入第一件商品！</p>
          </div>
        )}

        <div className="h-6" />
      </main>
    </div>
  );
}

function ImageModal({ url, onClose }: { url: string; onClose: () => void }) {
  const [failed, setFailed] = useState(false);

  // Close on Escape key
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-5"
      style={{ background: "rgba(0,0,0,0.75)" }}
      onClick={onClose}
    >
      <div
        className="relative bg-white rounded-2xl overflow-hidden shadow-2xl max-w-sm w-full"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: `1px solid ${C.border}` }}>
          <span className="text-sm font-bold" style={{ color: C.textMuted }}>商品圖片</span>
          <button
            onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-full text-xl font-bold"
            style={{ color: C.textLight }}
          >×</button>
        </div>

        {/* Image */}
        <div className="p-4">
          {failed ? (
            <div className="text-center py-8" style={{ color: C.textMuted }}>
              <div className="text-4xl mb-2">🖼️</div>
              <p className="text-sm mb-3">無法顯示圖片</p>
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-semibold underline"
                style={{ color: C.primary }}
              >
                在瀏覽器開啟 ↗
              </a>
            </div>
          ) : (
            <img
              src={url}
              alt="商品圖片"
              className="w-full rounded-xl object-contain max-h-72"
              onError={() => setFailed(true)}
            />
          )}
        </div>

        {/* Footer link */}
        {!failed && (
          <div className="px-4 pb-4 text-center">
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm"
              style={{ color: C.textLight }}
            >
              在瀏覽器開啟 ↗
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

function ItemCard({
  item,
  showToggle,
}: {
  item: {
    id: string;
    name: string;
    nameJp: string;
    image: string;
    priceTw: string;
    priceJp: string;
    quantity: string;
    purchased: boolean;
    requester: string;
    notes: string;
    link: string;
  };
  showToggle: boolean;
}) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [imgOpen, setImgOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const navigation = useNavigation();
  const isDeleting =
    navigation.state === "submitting" &&
    navigation.formData?.get("intent") === "delete" &&
    navigation.formData?.get("id") === item.id;

  return (
    <>
    {imgOpen && item.image && mounted && createPortal(
      <ImageModal url={item.image} onClose={() => setImgOpen(false)} />,
      document.body
    )}
    <div
      className="bg-white rounded-2xl overflow-hidden"
      style={{ border: `1.5px solid ${item.purchased ? "#D8E4EE" : C.cardBorder}` }}
    >
      {/* Card header */}
      <div
        className="flex items-center justify-between px-4 py-2.5"
        style={{ background: item.purchased ? "#F5F8FB" : "#EEF4FA", borderBottom: `1px solid ${C.border}` }}
      >
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-base font-semibold truncate" style={{ color: C.primary }}>
            👤 {item.requester || "—"}
          </span>
          {item.purchased ? (
            <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#D1FAE5", color: "#065F46" }}>已購買</span>
          ) : (
            <span className="shrink-0 text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: "#DBEAFE", color: "#1E40AF" }}>未購買</span>
          )}
        </div>

        {isDeleting ? (
          <div className="flex items-center gap-1.5 text-sm" style={{ color: C.textMuted }}>
            <svg className="animate-spin w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" opacity="0.25"/>
              <path fill="currentColor" opacity="0.75" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            刪除中…
          </div>
        ) : confirmDelete ? (
          <div className="flex gap-1">
            <Form method="post">
              <input type="hidden" name="intent" value="delete" />
              <input type="hidden" name="id" value={item.id} />
              <button type="submit" className="text-sm text-white px-3 py-1.5 rounded-lg font-bold" style={{ background: "#EF4444" }}>
                確認刪除
              </button>
            </Form>
            <button
              type="button"
              onClick={() => setConfirmDelete(false)}
              className="text-sm px-3 py-1.5 rounded-lg font-medium"
              style={{ background: "#E4EAF0", color: C.textMuted }}
            >
              取消
            </button>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="text-sm px-2 py-1 rounded-lg"
            style={{ color: C.textLight }}
          >
            刪除
          </button>
        )}
      </div>

      {/* Card body */}
      <div className="p-4 flex gap-3 items-start">
        {showToggle && (
          <Form method="post" className="shrink-0 pt-1">
            <input type="hidden" name="intent" value="toggle" />
            <input type="hidden" name="id" value={item.id} />
            <input type="hidden" name="purchased" value="true" />
            <button
              type="submit"
              className="w-8 h-8 rounded-full border-2 flex items-center justify-center"
              style={{ background: "#22C55E", borderColor: "#22C55E", color: "white" }}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </button>
          </Form>
        )}

        <div className="flex-1 min-w-0">
          {/* Name row */}
          <div className="flex items-baseline gap-2 flex-wrap">
            <span
              className="font-bold text-xl leading-snug"
              style={{
                color: item.purchased ? C.textLight : C.text,
                textDecoration: item.purchased ? "line-through" : "none",
              }}
            >
              {item.name}
            </span>
            {item.nameJp && (
              <span className="text-base" style={{ color: C.textMuted }}>{item.nameJp}</span>
            )}
            {item.quantity && item.quantity !== "1" && (
              <span className="text-base font-bold" style={{ color: C.primary }}>×{item.quantity}</span>
            )}
          </div>

          {/* Prices */}
          {(item.priceTw || item.priceJp) && (
            <div className="flex gap-4 mt-2 flex-wrap">
              {item.priceTw && (
                <span className="text-base" style={{ color: C.textMuted }}>🇹🇼 {item.priceTw}</span>
              )}
              {item.priceJp && (
                <span className="text-base" style={{ color: C.textMuted }}>🇯🇵 {item.priceJp}</span>
              )}
            </div>
          )}

          {/* Notes */}
          {item.notes && (
            <p className="text-base mt-2" style={{ color: C.textMuted }}>{item.notes}</p>
          )}

          {/* Links */}
          {(item.image || item.link) && (
            <div className="flex gap-4 mt-2 flex-wrap">
              {item.image && (
                <button
                  type="button"
                  onClick={() => setImgOpen(true)}
                  className="text-base font-semibold inline-flex items-center"
                  style={{
                    color: C.primary,
                    cursor: "pointer",
                    minHeight: "44px",
                    padding: "0 4px",
                    touchAction: "manipulation",
                    WebkitTapHighlightColor: "transparent",
                    userSelect: "none",
                  }}
                >
                  🖼️ 圖片
                </button>
              )}
              {item.link && (
                <a href={item.link} target="_blank" rel="noopener noreferrer"
                  className="text-base font-semibold" style={{ color: C.primary }}>
                  🔗 參考連結
                </a>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );
}
