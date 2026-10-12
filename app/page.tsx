export default function Home() {
  return (
    <main className="min-h-screen p-8 flex flex-col items-center justify-center">
      <div className="flex items-center gap-2 mb-4">
        <span className="font-display text-2xl font-semibold">Review</span>
        <div className="w-[2px] h-[18px] bg-accent" />
        <span className="font-display text-2xl font-semibold">Lock</span>
      </div>
      <p className="text-text-muted text-sm font-sans">
        ReviewLock Scaffold (B0)
      </p>
    </main>
  );
}
