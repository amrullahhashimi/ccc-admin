import { useCallback, useEffect, useState } from "react";
import { useNavigate, useParams } from "react-router";

import { sourcing, vendorMoney } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import { useNotify } from "../../components/ui/notify";
import { Modal } from "../../components/ui/modal";
import { Chip, Empty, Loading, Panel, SpecChips } from "./parts";
import OnlinePrices from "./OnlinePrices";
import {
  cellInputClass,
  dateTime,
  gradeLabel,
  dollarsFromCents,
  ghostButton,
  inputClass,
  primaryButton,
  shortDate,
  tierLabel,
  toneClass,
  toneNote,
} from "./ui";

type Detail = Awaited<ReturnType<typeof sourcing.product>>;

/**
 * One product, and everything anybody has said about its price.
 *
 * Each offer keeps a link back to the message it came from, because the first
 * question when a price looks wrong is "who told us that, and when".
 */
export default function CatalogProductDetail() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const notify = useNotify();
  const { user } = useAuth();
  const canManage = user?.role === "OWNER" || user?.role === "MANAGER";

  const [quantity, setQuantity] = useState(1);
  const [data, setData] = useState<Detail | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [editing, setEditing] = useState<string | null>(null);
  const [priceDraft, setPriceDraft] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      setData(await sourcing.product(id, quantity));
      setError("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load this product.");
    }
    setLoading(false);
  }, [id, quantity]);

  useEffect(() => {
    load();
  }, [load]);

  async function saveOffer(offerId: string) {
    try {
      await sourcing.updateOffer(offerId, { price: priceDraft });
      notify.success("Price updated", { message: "The change has been added to this product's history." });
      setEditing(null);
      load();
    } catch (err) {
      notify.error("Could not update that price", { message: err instanceof Error ? err.message : undefined });
    }
  }

  async function removeOffer(offerId: string, vendorName: string) {
    const ok = await notify.confirm({
      title: `Remove ${vendorName}'s offer?`,
      message: "The price history for this offer goes with it.",
      confirmText: "Remove",
      variant: "error",
    });
    if (!ok) return;

    try {
      await sourcing.removeOffer(offerId);
      notify.success("Offer removed");
      load();
    } catch (err) {
      notify.error("Could not remove that offer", { message: err instanceof Error ? err.message : undefined });
    }
  }

  async function removeProduct() {
    if (!data) return;
    const ok = await notify.confirm({
      title: `Delete ${data.product.normalizedName}?`,
      message: `Its ${data.offers.length} vendor ${data.offers.length === 1 ? "offer" : "offers"} and their price history will be deleted too.`,
      confirmText: "Delete",
      variant: "error",
    });
    if (!ok) return;

    try {
      await sourcing.removeProduct(data.product.id);
      notify.success("Product deleted");
      navigate("/sourcing/comparison");
    } catch (err) {
      notify.error("Could not delete that product", { message: err instanceof Error ? err.message : undefined });
    }
  }

  if (loading && !data) return <Loading />;
  if (error) return <p className="p-10 text-center text-sm text-error-500">{error}</p>;
  if (!data) return null;

  const { product, offers, comparison, history } = data;
  const byVendor = offers.reduce<Record<string, typeof offers>>((acc, offer) => {
    (acc[offer.vendor.id] ??= []).push(offer);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-800 dark:text-white/90">{product.normalizedName}</h1>
          <div className="mt-2">
            <SpecChips product={product} />
          </div>
        </div>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 whitespace-nowrap text-sm text-gray-700 dark:text-gray-400">
            Quantity
            <input
              className={`${inputClass} w-20 text-right tabular-nums`}
              value={quantity}
              onChange={(e) => setQuantity(Math.max(1, Number(e.target.value) || 1))}
              inputMode="numeric"
            />
          </label>
          {canManage && (
            <button className={ghostButton} onClick={removeProduct}>
              Delete product
            </button>
          )}
        </div>
      </div>

      {/* --------------------------- who is cheapest --------------------------- */}
      <Panel
        title={`Best price at ${quantity} ${quantity === 1 ? "unit" : "units"}`}
        subtitle={
          comparison.vendors.length === 0
            ? "No vendor quotes a price at this quantity."
            : comparison.tied
              ? "Two or more vendors are level."
              : comparison.savingsCents == null
                ? "Only one vendor quotes this product."
                : `Cheapest saves $${(comparison.savingsCents / 100).toFixed(2)} against the next vendor.`
        }
        padded={false}
      >
        {comparison.vendors.length === 0 ? (
          <Empty title="Nothing applies at this quantity" message="Try a smaller quantity, or check the tiers below." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Applies to</th>
                  <th className="px-5 py-3">Condition</th>
                  <th className="px-5 py-3 text-right">In stock</th>
                  <th className="px-5 py-3 text-right">Price</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {comparison.vendors.map((cell) => (
                  <tr key={cell.vendorId}>
                    <td className="px-5 py-3 text-sm font-medium text-gray-800 dark:text-white/90">{cell.vendorName}</td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {tierLabel(cell.minQuantity, cell.maxQuantity)}
                    </td>
                    <td className="px-5 py-3 text-sm text-gray-600 dark:text-gray-400">
                      {[cell.condition, gradeLabel(cell.grade)].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-600 dark:text-gray-400">
                      {cell.availableQuantity ?? "—"}
                    </td>
                    <td className={`px-5 py-3 text-right text-sm tabular-nums ${toneClass[cell.tone]}`}>
                      <span title={toneNote[cell.tone]}>
                        {cell.tone === "cheapest" ? "▾ " : ""}
                        {vendorMoney(cell.priceCents, cell.currency)}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {/* ------------------------------ every tier ------------------------------ */}
      <Panel title="All vendor prices">
        {offers.length === 0 ? (
          <Empty title="No offers yet" />
        ) : (
          <div className="divide-y divide-gray-100 dark:divide-gray-800">
            {Object.entries(byVendor).map(([vendorId, vendorOffers]) => (
              <div key={vendorId} className="px-5 py-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-medium text-gray-800 dark:text-white/90">{vendorOffers[0].vendor.name}</p>
                  <p className="text-xs text-gray-500">Last quoted {shortDate(vendorOffers[0].lastSeenAt)}</p>
                </div>

                <table className="mt-3 w-full">
                  <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                    {vendorOffers.map((offer) => (
                      <tr key={offer.id}>
                        <td className="py-2 text-sm text-gray-600 dark:text-gray-400">
                          {tierLabel(offer.minQuantity, offer.maxQuantity)}
                          {offer.minQuantity > 1 && <Chip tone="brand">Quantity break</Chip>}
                        </td>
                        <td className="py-2 text-sm text-gray-500">
                          {[offer.condition, gradeLabel(offer.grade)].filter(Boolean).join(" · ")}
                        </td>
                        <td className="py-2 text-right text-xs text-gray-500">
                          {offer.availableQuantity == null ? "" : `${offer.availableQuantity} in stock`}
                        </td>
                        <td className="py-2 text-right">
                          {editing === offer.id ? (
                            <span className="flex items-center justify-end gap-2">
                              <input
                                className={`${cellInputClass} w-24 text-right tabular-nums`}
                                value={priceDraft}
                                onChange={(e) => setPriceDraft(e.target.value)}
                                inputMode="decimal"
                                aria-label="New price"
                                autoFocus
                              />
                              <button className="text-xs font-medium text-brand-500" onClick={() => saveOffer(offer.id)}>
                                Save
                              </button>
                              <button className="text-xs text-gray-500" onClick={() => setEditing(null)}>
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <span className="text-sm font-semibold tabular-nums text-gray-800 dark:text-white/90">
                              {vendorMoney(offer.priceCents, offer.currency)}
                            </span>
                          )}
                        </td>
                        <td className="w-40 py-2 text-right">
                          {editing !== offer.id && (
                            <span className="flex items-center justify-end gap-3">
                              <button
                                className="text-xs font-medium text-brand-500 hover:underline"
                                onClick={() => {
                                  setEditing(offer.id);
                                  setPriceDraft(dollarsFromCents(offer.priceCents));
                                }}
                              >
                                Edit
                              </button>
                              {offer.sourceMessageId && (
                                <button
                                  className="text-xs text-gray-500 hover:underline"
                                  onClick={() => setSourceId(offer.sourceMessageId)}
                                >
                                  Source
                                </button>
                              )}
                              {canManage && (
                                <button
                                  className="text-xs text-error-500 hover:underline"
                                  onClick={() => removeOffer(offer.id, offer.vendor.name)}
                                >
                                  Remove
                                </button>
                              )}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </div>
        )}
      </Panel>

      {/* --------------------------- the open market --------------------------- */}
      <OnlinePrices productId={product.id} productName={product.normalizedName} />

      {/* ----------------------------- what changed ----------------------------- */}
      <Panel title="Price history" padded={false}>
        {history.length === 0 ? (
          <Empty title="No price changes recorded" message="History starts the first time a vendor re-quotes this product." />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead className="border-b border-gray-200 dark:border-gray-800">
                <tr className="text-left text-xs font-medium uppercase tracking-wider text-gray-500">
                  <th className="px-5 py-3">When</th>
                  <th className="px-5 py-3">Vendor</th>
                  <th className="px-5 py-3">Tier</th>
                  <th className="px-5 py-3 text-right">Was</th>
                  <th className="px-5 py-3 text-right">Now</th>
                  <th className="px-5 py-3">By</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 dark:divide-gray-800">
                {history.map((h) => {
                  const down = h.newPriceCents < h.oldPriceCents;
                  return (
                    <tr key={h.id}>
                      <td className="whitespace-nowrap px-5 py-3 text-sm text-gray-500">{dateTime(h.changedAt)}</td>
                      <td className="px-5 py-3 text-sm text-gray-700 dark:text-gray-300">{h.vendor?.name ?? "—"}</td>
                      <td className="px-5 py-3 text-sm text-gray-500">{h.minQuantity > 1 ? `${h.minQuantity}+` : "Any"}</td>
                      <td className="px-5 py-3 text-right text-sm tabular-nums text-gray-500 line-through">
                        {vendorMoney(h.oldPriceCents)}
                      </td>
                      <td
                        className={`px-5 py-3 text-right text-sm font-medium tabular-nums ${
                          down ? "text-success-600 dark:text-success-400" : "text-error-500"
                        }`}
                      >
                        {down ? "▾ " : "▴ "}
                        {vendorMoney(h.newPriceCents)}
                      </td>
                      <td className="px-5 py-3 text-sm text-gray-500">{h.changedBy ?? "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      <SourceMessage id={sourceId} onClose={() => setSourceId(null)} />
    </div>
  );
}

/* --------------------------- the original words --------------------------- */

export function SourceMessage({ id, onClose }: { id: string | null; onClose: () => void }) {
  const [message, setMessage] = useState<Awaited<ReturnType<typeof sourcing.message>> | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    setMessage(null);
    setError("");
    if (!id) return;
    sourcing
      .message(id)
      .then(setMessage)
      .catch((err) => setError(err instanceof Error ? err.message : "Could not load that message."));
  }, [id]);

  return (
    <Modal isOpen={!!id} onClose={onClose} className="mx-4 max-w-2xl p-6 lg:p-8">
      <h3 className="text-lg font-semibold text-gray-800 dark:text-white/90">Source message</h3>
      {error ? (
        <p className="mt-4 text-sm text-error-500">{error}</p>
      ) : !message ? (
        <p className="mt-4 text-sm text-gray-500">Loading…</p>
      ) : (
        <>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            {message.vendor.name} · received {dateTime(message.receivedAt)}
            {message.importedBy ? ` · imported by ${message.importedBy}` : ""}
          </p>
          <pre className="mt-4 max-h-96 overflow-auto whitespace-pre-wrap rounded-lg bg-gray-50 p-4 font-mono text-xs leading-6 text-gray-700 dark:bg-white/[0.03] dark:text-gray-300">
            {message.rawMessage}
          </pre>
          <p className="mt-3 text-sm text-gray-500">
            {message.offers.length} {message.offers.length === 1 ? "offer" : "offers"} came from this message.
          </p>
          <div className="mt-5 flex justify-end">
            <button className={primaryButton} onClick={onClose}>
              Close
            </button>
          </div>
        </>
      )}
    </Modal>
  );
}
