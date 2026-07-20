import AssetForm from "./components/AssetForm";
import AssetTable from "./components/AssetTable";

function App() {
  return (
    <div className="min-h-screen bg-slate-50 text-slate-800">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto max-w-6xl px-6 py-4">
          <h1 className="text-2xl font-bold text-emerald-700">🌳 GreenAsset</h1>
          <p className="text-sm text-slate-500">Akıllı Şehir Varlık Yönetimi</p>
        </div>
      </header>

      <main className="mx-auto grid max-w-6xl gap-6 px-6 py-8 lg:grid-cols-[380px_1fr]">
        <section className="h-fit rounded-lg border border-slate-200 bg-white p-5 shadow-sm">
          <h2 className="mb-4 text-lg font-semibold text-slate-800">Varlık Ekle</h2>
          <AssetForm />
        </section>

        <AssetTable />
      </main>
    </div>
  );
}

export default App;
