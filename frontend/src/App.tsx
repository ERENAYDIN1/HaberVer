import AssetForm from "./components/AssetForm";
import { useAssets } from "./hooks/useAssets";

function App() {
  const { data, isLoading, isError, error } = useAssets();
  const varlikSayisi = data?.features.length ?? 0;

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-5xl px-6 py-4">
          <h1 className="text-2xl font-bold text-emerald-700">🌳 GreenAsset</h1>
          <p className="text-sm text-slate-500">Akıllı Şehir Varlık Yönetimi</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-5xl gap-6 px-6 py-8 md:grid-cols-2">
        <AssetForm />

        <section className="rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-lg font-semibold">Kayıtlı Varlıklar</h2>
          {isLoading && <p className="text-sm text-slate-500">Yükleniyor...</p>}
          {isError && (
            <p className="text-sm text-red-600">{(error as Error).message}</p>
          )}
          {data && (
            <>
              <p className="mb-2 text-sm text-slate-500">
                Toplam {varlikSayisi} varlık
              </p>
              <ul className="space-y-1 text-sm">
                {data.features.map((f) => (
                  <li key={f.properties.id} className="text-slate-700">
                    {f.properties.name}
                  </li>
                ))}
              </ul>
            </>
          )}
        </section>
      </main>
    </div>
  );
}

export default App;
