import { MOCK_PRODUCTS } from "../components/mock-data";

function formatCurrency(amount: number) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 0,
  }).format(amount);
}

export default async function ClientHubProductsPage() {
  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Products & Services</h1>
        <p className="mt-1 text-sm text-slate-500">Explore what we offer and how we can help your business grow</p>
      </div>

      {/* Products Grid */}
      {MOCK_PRODUCTS.length === 0 ? (
        <div className="rounded-xl border border-slate-200 bg-white px-6 py-16 text-center shadow-sm">
          <p className="text-sm text-slate-500">No products listed yet.</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {MOCK_PRODUCTS.map((product) => (
            <div key={product.id} className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-sm font-semibold text-slate-900">{product.name}</h3>
                  <p className="mt-1 text-xs text-slate-500 leading-relaxed">{product.description}</p>
                </div>
                <div className="shrink-0 text-right">
                  <p className="text-sm font-bold text-slate-900">{formatCurrency(product.price)}</p>
                  <p className="text-xs text-slate-400">/ {product.unit}</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Customization placeholder */}
      <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50/50 p-6 text-center">
        <p className="text-xs text-slate-400">
          Product catalog and pricing customization will be available in a future phase.
        </p>
      </div>
    </div>
  );
}
