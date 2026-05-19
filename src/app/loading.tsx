export default function RootLoading() {
  return (
    <div className="min-h-[60vh] container-edge py-32 flex flex-col items-center justify-center text-center">
      <div className="relative h-16 w-16">
        <div className="absolute inset-0 rounded-full border-2 border-line-bright" />
        <div className="absolute inset-0 rounded-full border-2 border-amber border-t-transparent animate-spin" />
      </div>
      <p className="mt-8 font-mono text-xs uppercase tracking-[0.2em] text-phosphor cursor-blink">
        loading
      </p>
    </div>
  );
}
