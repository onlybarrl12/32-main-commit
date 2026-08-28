export function ComingSoon({ title, note }: { title: string; note: string }) {
  return (
    <div className="bg-white rounded-xl border border-stone-200 p-5">
      <h2 className="text-base font-bold text-stone-900">{title}</h2>
      <p className="mt-2 max-w-2xl text-sm text-stone-500">{note}</p>
    </div>
  );
}
